import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  from: vi.fn(),
}))

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({ rpc: mocks.rpc, from: mocks.from }),
}))

import { createConsoleStore } from './store'

const env = {
  SUPABASE_URL: 'https://project.supabase.co',
  SUPABASE_PUBLISHABLE_KEY: 'publishable',
  SUPABASE_SERVICE_ROLE_KEY: 'service-role',
  CONSOLE_BOOTSTRAP_EMAILS: '',
}

function serviceQuery() {
  const row = {
    key: 'api', name: 'API', description: null, status: 'active', redirect_uris: [],
    resource_uri: 'https://api.dondone.dev', capability_sync_status: 'active',
    active_capability_version: null, capability_last_synced_at: null,
    capability_last_error: null, service_capability_versions: [{ id: 'pending-1' }], permission_groups: [],
  }
  const builder = {
    select: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    order: vi.fn(() => builder),
    returns: vi.fn(async () => ({ data: [row], error: null })),
    single: vi.fn(async () => ({ data: row, error: null })),
  }
  return builder
}

function resultQuery(result: { data: unknown; error: unknown }) {
  const builder = {
    select: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    maybeSingle: vi.fn(async () => result),
    returns: vi.fn(async () => result),
  }
  return builder
}

describe('Console store capability grant RPC boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.rpc.mockResolvedValue({ data: null, error: null })
    mocks.from.mockImplementation(() => serviceQuery())
  })

  it('passes service, actor, and selected catalog permissions to the atomic create RPC', async () => {
    const store = createConsoleStore(env)
    await store.createGroup('api', {
      key: 'reader', name: 'Reader', description: null,
      permission_keys: ['api:echo'], usage_policy_key: 'caller-limits', actor: 'actor-1',
    })

    expect(mocks.rpc).toHaveBeenCalledWith('console_create_permission_group_with_policy', {
      p_service_key: 'api', p_group_key: 'reader', p_name: 'Reader',
      p_description: null, p_permission_keys: ['api:echo'],
      p_usage_policy_key: 'caller-limits', p_actor: 'actor-1',
    })
  })

  it('does not fetch or return a service when the transactional RPC fails', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { code: '23514', message: 'system_role_read_only' } })
    const store = createConsoleStore(env)

    await expect(store.updateGroup('api', 'reader', {
      name: 'Changed', description: null, status: 'disabled', permission_keys: [],
      usage_policy_key: null, actor: 'actor-1',
    })).rejects.toMatchObject({ message: 'system_role_read_only' })
    expect(mocks.from).not.toHaveBeenCalled()
  })

  it('reports pending catalog history even when no version is active', async () => {
    const query = serviceQuery()
    mocks.from.mockReturnValue(query)
    const store = createConsoleStore(env)
    const [service] = await store.listServices()

    expect(query.select).toHaveBeenCalledWith(
      expect.stringContaining(
        'service_capability_versions!service_capability_versions_service_key_fkey(id)'
      )
    )
    expect(service.active_capability_version).toBeNull()
    expect(service.has_capability_versions).toBe(true)
  })

  it('does not grant permissions through a disabled permission group', async () => {
    mocks.from.mockImplementation((table: string) => {
      if (table === 'user_permissions') return resultQuery({ data: [], error: null })
      if (table === 'user_permission_groups') {
        return resultQuery({
          data: [{
            id: 'grant-1', user_id: 'user-1', group_id: 'console-admin', status: 'active', expires_at: null,
            permission_groups: {
              status: 'disabled',
              permission_group_permissions: [{ permissions: { key: 'console:admin' } }],
            },
          }],
          error: null,
        })
      }
      return serviceQuery()
    })

    const store = createConsoleStore(env)
    await expect(store.getEffectivePermissions('user-1')).resolves.toEqual([])
  })

  it('derives sorted unique permissions only from active unexpired group grants', async () => {
    mocks.from.mockImplementation((table: string) => {
      if (table === 'user_permissions') {
        return resultQuery({
          data: [{ permission_key: 'direct:legacy', status: 'active', expires_at: null }],
          error: null,
        })
      }
      if (table === 'user_permission_groups') {
        return resultQuery({
          data: [
            {
              id: 'grant-active', user_id: 'user-1', group_id: 'role-active', status: 'active', expires_at: null,
              permission_groups: {
                status: 'active',
                permission_group_permissions: [
                  { permissions: { key: 'service:write' } },
                  { permissions: { key: 'service:read' } },
                  { permissions: { key: 'service:read' } },
                ],
              },
            },
            {
              id: 'grant-expired', user_id: 'user-1', group_id: 'role-expired', status: 'active', expires_at: '2000-01-01T00:00:00.000Z',
              permission_groups: {
                status: 'active',
                permission_group_permissions: [{ permissions: { key: 'service:expired' } }],
              },
            },
            {
              id: 'grant-future', user_id: 'user-1', group_id: 'role-future', status: 'active', expires_at: '2999-01-01T00:00:00.000Z',
              permission_groups: {
                status: 'active',
                permission_group_permissions: [{ permissions: { key: 'service:future' } }],
              },
            },
            {
              id: 'grant-revoked', user_id: 'user-1', group_id: 'role-revoked', status: 'revoked', expires_at: null,
              permission_groups: {
                status: 'active',
                permission_group_permissions: [{ permissions: { key: 'service:revoked' } }],
              },
            },
            {
              id: 'grant-disabled-role', user_id: 'user-1', group_id: 'role-disabled', status: 'active', expires_at: null,
              permission_groups: {
                status: 'disabled',
                permission_group_permissions: [{ permissions: { key: 'service:disabled' } }],
              },
            },
          ],
          error: null,
        })
      }
      return serviceQuery()
    })

    const store = createConsoleStore(env)
    await expect(store.getEffectivePermissions('user-1')).resolves.toEqual([
      'service:future',
      'service:read',
      'service:write',
    ])
    expect(mocks.from).not.toHaveBeenCalledWith('user_permissions')
  })

  it('fails closed when profile lookup returns a database error', async () => {
    const dbError = new Error('profile lookup unavailable')
    mocks.from.mockImplementation((table: string) =>
      table === 'profiles'
        ? resultQuery({ data: null, error: dbError })
        : serviceQuery()
    )

    const store = createConsoleStore(env)
    await expect(store.ensureProfile({ id: 'user-1' })).rejects.toBe(dbError)
  })
})
