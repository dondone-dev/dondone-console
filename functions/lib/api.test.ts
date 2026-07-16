import { describe, expect, it } from 'vitest'
import { handleConsoleApi } from './api'
import { ApiError } from './types'
import type {
  CapabilityVersion,
  ConsoleEnv,
  ConsoleStore,
  Profile,
  Service,
  SupabaseUser,
  UserDetail,
} from './types'

const manifest = {
  resource: 'https://api.dondone.dev',
  authorization_servers: ['https://auth.dondone.dev'],
  scopes_supported: ['api:echo'],
  dondone_capabilities: {
    schema_version: 1 as const,
    catalog_version: 'v2',
    permissions: [{ key: 'api:echo', description: 'Call echo.' }],
    roles: [{ key: 'reader', name: 'Reader', description: 'Read access.', permission_keys: ['api:echo'] }],
  },
}

const env: ConsoleEnv = {
  SUPABASE_URL: 'https://project.supabase.co',
  SUPABASE_PUBLISHABLE_KEY: 'publishable-key',
  SUPABASE_SERVICE_ROLE_KEY: 'service-role-key',
  CONSOLE_BOOTSTRAP_EMAILS: 'admin@example.com',
}

const admin: SupabaseUser = { id: 'admin-1', email: 'admin@example.com' }
const normal: SupabaseUser = { id: 'user-1', email: 'user@example.com' }

const adminProfile: Profile = {
  id: admin.id,
  email: admin.email ?? null,
  display_name: 'Admin',
  avatar_url: null,
  status: 'active',
  created_at: '2026-07-03T00:00:00Z',
}

const userProfile: Profile = {
  id: normal.id,
  email: normal.email ?? null,
  display_name: 'User',
  avatar_url: null,
  status: 'active',
  created_at: '2026-07-03T00:00:00Z',
}

const services: Service[] = [
  {
    key: 'console',
    name: 'Console',
    description: null,
    status: 'active',
    redirect_uris: ['https://console.dondone.dev/auth/callback'],
    resource_uri: null,
    capability_sync_status: 'not_configured',
    active_capability_version: null,
    capability_last_synced_at: null,
    capability_last_error: null,
    has_capability_versions: false,
    default_group_id: null,
    groups: [
      {
        id: 'group-console-admin',
        service_key: 'console',
        key: 'admin',
        name: 'Console Admin',
        description: null,
        status: 'active',
        is_system: true,
        usage_policy_id: null,
        permissions: ['console:admin'],
      },
    ],
  },
]

function store(overrides: Partial<ConsoleStore> = {}): ConsoleStore {
  return {
    getUser: async (token) => (token === 'admin-token' ? admin : normal),
    getProfile: async (id) => (id === admin.id ? adminProfile : userProfile),
    ensureProfile: async (user) => ({
      ...userProfile,
      id: user.id,
      email: user.email ?? null,
    }),
    getEffectivePermissions: async (id) =>
      id === admin.id ? ['console:admin'] : [],
    grantConsoleAdmin: async () => {},
    listUsers: async () => ({ users: [adminProfile, userProfile], total: 2 }),
    getUserDetail: async (id) => ({
      profile: id === admin.id ? adminProfile : userProfile,
      groups: [],
      permissions: id === admin.id ? ['console:admin'] : [],
    }),
    replaceUserGroups: async ({ userId }) => ({
      profile: userId === admin.id ? adminProfile : userProfile,
      groups: [],
      permissions: ['api:echo'],
    }),
    listServices: async () => services,
    createService: async (input) => ({
      key: input.key,
      name: input.name,
      description: input.description,
      status: 'active',
      redirect_uris: input.redirect_uris,
      resource_uri: input.resource_uri,
      capability_sync_status: 'not_configured',
      active_capability_version: null,
      capability_last_synced_at: null,
      capability_last_error: null,
      has_capability_versions: false,
      default_group_id: null,
      groups: [],
    }),
    updateService: async (key, input) => ({
      key,
      name: input.name,
      description: input.description,
      status: input.status,
      redirect_uris: input.redirect_uris,
      resource_uri: input.resource_uri,
      capability_sync_status: 'not_configured',
      active_capability_version: null,
      capability_last_synced_at: null,
      capability_last_error: null,
      has_capability_versions: false,
      default_group_id: null,
      groups: [],
    }),
    createGroup: async () => services[0],
    updateGroup: async () => services[0],
    deleteService: async () => {},
    listCapabilityVersions: async () => [],
    listActiveCapabilities: async () => [],
    listUsagePolicies: async () => [],
    upsertUsagePolicy: async (_serviceKey, input) => ({
      id: 'policy-1',
      service_key: 'api',
      key: input.key,
      name: input.name,
      description: input.description,
      status: input.status,
      rules: input.rules,
    }),
    bindGroupPolicy: async () => services[0],
    setServiceDefaultGroup: async () => services[0],
    ...overrides,
  }
}

function request(path: string, init: RequestInit = {}) {
  return new Request(`https://console.dondone.dev${path}`, init)
}

function auth(token = 'admin-token') {
  return { Authorization: `Bearer ${token}` }
}

describe('console api', () => {
  it('rejects unauthenticated management requests', async () => {
    const response = await handleConsoleApi(
      request('/api/users'),
      env,
      store()
    )

    expect(response.status).toBe(401)
    expect(await response.json()).toEqual({ error: 'missing_token' })
  })

  it('returns current user and console admin status', async () => {
    const response = await handleConsoleApi(
      request('/api/me', { headers: auth() }),
      env,
      store()
    )

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      user: admin,
      profile: adminProfile,
      console_admin: true,
      permissions: ['console:admin'],
    })
  })

  it('returns invalid_token only when Supabase token verification fails', async () => {
    const response = await handleConsoleApi(
      request('/api/me', { headers: auth('bad-token') }),
      env,
      store({
        getUser: async () => {
          throw new Error('invalid token')
        },
      })
    )

    expect(response.status).toBe(401)
    expect(await response.json()).toEqual({ error: 'invalid_token' })
  })

  it('does not report database setup failures as expired sessions', async () => {
    const response = await handleConsoleApi(
      request('/api/me', { headers: auth() }),
      env,
      store({
        ensureProfile: async () => {
          throw new Error('profiles table missing')
        },
      })
    )

    expect(response.status).toBe(500)
    expect(await response.json()).toEqual({ error: 'internal_error' })
  })

  it.each(['/api/me', '/api/services'])('rejects a disabled profile at the shared entry gate for %s', async (path) => {
    const response = await handleConsoleApi(
      request(path, { headers: auth() }),
      env,
      store({
        ensureProfile: async () => ({ ...adminProfile, status: 'disabled' }),
      })
    )

    expect(response.status).toBe(403)
    expect(await response.json()).toEqual({ error: 'user_disabled' })
  })

  it('rejects non-admin users from admin endpoints', async () => {
    const response = await handleConsoleApi(
      request('/api/users', { headers: auth('user-token') }),
      env,
      store()
    )

    expect(response.status).toBe(403)
    expect(await response.json()).toEqual({ error: 'forbidden' })
  })

  it('bootstraps console admin for allowlisted email', async () => {
    let granted = false
    const response = await handleConsoleApi(
      request('/api/bootstrap', {
        method: 'POST',
        headers: auth(),
      }),
      env,
      store({
        getEffectivePermissions: async () => [],
        grantConsoleAdmin: async () => {
          granted = true
        },
      })
    )

    expect(response.status).toBe(200)
    expect(granted).toBe(true)
    expect(await response.json()).toEqual({ ok: true, console_admin: true })
  })

  it('lists users for admins', async () => {
    const response = await handleConsoleApi(
      request('/api/users?search=user&limit=20', { headers: auth() }),
      env,
      store()
    )

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      users: [adminProfile, userProfile],
      total: 2,
    })
  })

  it('replaces a user group grants for admins', async () => {
    let grants: unknown
    const response = await handleConsoleApi(
      request('/api/users/user-1/groups', {
        method: 'PUT',
        headers: { ...auth(), 'Content-Type': 'application/json' },
        body: JSON.stringify({
          grants: [{ group_id: 'group-api-basic', expires_at: null }],
        }),
      }),
      env,
      store({
        replaceUserGroups: async (input) => {
          grants = input.grants
          return {
            profile: userProfile,
            groups: [],
            permissions: ['api:echo'],
          } satisfies UserDetail
        },
      })
    )

    expect(response.status).toBe(200)
    expect(grants).toEqual([{ group_id: 'group-api-basic', expires_at: null }])
    expect(await response.json()).toEqual({
      profile: userProfile,
      groups: [],
      permissions: ['api:echo'],
    })
  })

  it('rejects an invalid group grant expiry before calling the store', async () => {
    let called = false
    const response = await handleConsoleApi(
      request('/api/users/user-1/groups', {
        method: 'PUT',
        headers: { ...auth(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ grants: [{ group_id: 'group-api-basic', expires_at: 'tomorrow' }] }),
      }),
      env,
      store({ replaceUserGroups: async () => { called = true; throw new Error('unexpected') } })
    )

    expect(response.status).toBe(400)
    expect(await response.json()).toMatchObject({ error: 'invalid_expiry' })
    expect(called).toBe(false)
  })

  it('lists services for admins', async () => {
    const response = await handleConsoleApi(
      request('/api/services', { headers: auth() }),
      env,
      store()
    )

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ services })
  })

  it('updates a service, including its redirect URIs, for admins', async () => {
    let received: unknown
    const response = await handleConsoleApi(
      request('/api/services/time', {
        method: 'PUT',
        headers: { ...auth(), 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Local Time',
          description: 'Example app using Dondone Auth.',
          status: 'active',
          redirect_uris: ['https://time.dondone.dev/auth/callback'],
          resource_uri: 'https://time-api.dondone.dev/v1',
        }),
      }),
      env,
      store({
        updateService: async (key, input) => {
          received = { key, input }
          return {
            key,
            name: input.name,
            description: input.description,
            status: input.status,
            redirect_uris: input.redirect_uris,
            resource_uri: input.resource_uri,
            capability_sync_status: 'not_configured',
            active_capability_version: null,
            capability_last_synced_at: null,
            capability_last_error: null,
            has_capability_versions: false,
            default_group_id: null,
            groups: [],
          }
        },
      })
    )

    expect(response.status).toBe(200)
    expect(received).toEqual({
      key: 'time',
      input: {
        name: 'Local Time',
        description: 'Example app using Dondone Auth.',
        status: 'active',
        redirect_uris: ['https://time.dondone.dev/auth/callback'],
        resource_uri: 'https://time-api.dondone.dev/v1',
      },
    })
    expect(await response.json()).toEqual({
      key: 'time',
      name: 'Local Time',
      description: 'Example app using Dondone Auth.',
      status: 'active',
      redirect_uris: ['https://time.dondone.dev/auth/callback'],
      resource_uri: 'https://time-api.dondone.dev/v1',
      capability_sync_status: 'not_configured',
      active_capability_version: null,
      capability_last_synced_at: null,
      capability_last_error: null,
      has_capability_versions: false,
      default_group_id: null,
      groups: [],
    })
  })

  it('passes a normalized resource URI when creating a service', async () => {
    let received: unknown
    const response = await handleConsoleApi(
      request('/api/services', {
        method: 'POST',
        headers: { ...auth(), 'Content-Type': 'application/json' },
        body: JSON.stringify({
          key: 'reports',
          name: 'Reports',
          description: null,
          redirect_uris: [],
          resource_uri: '  https://reports.dondone.dev  ',
        }),
      }),
      env,
      store({
        createService: async (input) => {
          received = input
          return {
            key: input.key,
            name: input.name,
            description: input.description,
            status: 'active',
            redirect_uris: input.redirect_uris,
            resource_uri: input.resource_uri,
            capability_sync_status: 'not_configured',
            active_capability_version: null,
            capability_last_synced_at: null,
            capability_last_error: null,
            has_capability_versions: false,
            default_group_id: null,
            groups: [],
          }
        },
      })
    )

    expect(response.status).toBe(201)
    expect(received).toMatchObject({ resource_uri: 'https://reports.dondone.dev' })
  })

  it('rejects an insecure resource URI before calling the store', async () => {
    let called = false
    const response = await handleConsoleApi(
      request('/api/services', {
        method: 'POST',
        headers: { ...auth(), 'Content-Type': 'application/json' },
        body: JSON.stringify({
          key: 'reports',
          name: 'Reports',
          description: null,
          redirect_uris: [],
          resource_uri: 'http://reports.dondone.dev',
        }),
      }),
      env,
      store({ createService: async () => { called = true; throw new Error('unexpected') } })
    )

    expect(response.status).toBe(400)
    expect(await response.json()).toMatchObject({ error: 'invalid_resource_uri' })
    expect(called).toBe(false)
  })

  it('returns a specific conflict when a resource URI is already registered', async () => {
    const response = await handleConsoleApi(
      request('/api/services/reports', {
        method: 'PUT',
        headers: { ...auth(), 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Reports', description: null, status: 'active', redirect_uris: [],
          resource_uri: 'https://api.dondone.dev',
        }),
      }),
      env,
      store({ updateService: async () => { throw {
        code: '23505', message: 'duplicate key value violates unique constraint "services_resource_uri_unique"',
        constraint: 'services_resource_uri_unique',
      } } })
    )
    expect(response.status).toBe(409)
    expect(await response.json()).toMatchObject({ error: 'resource_uri_already_exists' })
  })

  it('returns resource_uri_locked when an active catalog prevents identity changes', async () => {
    const response = await handleConsoleApi(
      request('/api/services/api', {
        method: 'PUT',
        headers: { ...auth(), 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'API', description: null, status: 'active', redirect_uris: [],
          resource_uri: 'https://new-api.dondone.dev',
        }),
      }),
      env,
      store({ updateService: async () => { throw { code: '23514', message: 'resource_uri_locked' } } })
    )
    expect(response.status).toBe(409)
    expect(await response.json()).toMatchObject({ error: 'resource_uri_locked' })
  })

  it('rejects a malformed redirect_uris field instead of silently clearing it', async () => {
    const response = await handleConsoleApi(
      request('/api/services/time', {
        method: 'PUT',
        headers: { ...auth(), 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Local Time',
          description: null,
          status: 'active',
          redirect_uris: 'https://time.dondone.dev/auth/callback',
        }),
      }),
      env,
      store()
    )

    expect(response.status).toBe(400)
    expect(await response.json()).toMatchObject({ error: 'invalid_field' })
  })

  it('surfaces a 404 when a store reports an unknown service, instead of a raw 500', async () => {
    const response = await handleConsoleApi(
      request('/api/services/unknown', {
        method: 'PUT',
        headers: { ...auth(), 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Ghost',
          description: null,
          status: 'active',
          redirect_uris: [],
        }),
      }),
      env,
      store({
        updateService: async () => {
          throw new ApiError(404, 'not_found')
        },
      })
    )

    expect(response.status).toBe(404)
  })

  it('maps a foreign-key violation from the store into a 400 instead of a raw 500', async () => {
    const response = await handleConsoleApi(
      request('/api/services/api/groups', {
        method: 'POST',
        headers: { ...auth(), 'Content-Type': 'application/json' },
        body: JSON.stringify({
          key: 'plus',
          name: 'Plus',
          description: null,
          permission_keys: ['tier:lowb_vip'],
        }),
      }),
      env,
      store({
        createGroup: async () => {
          throw {
            code: '23503',
            message: 'insert or update on table "permission_group_permissions" violates foreign key constraint',
            details: 'Key (permission_key)=(tier:lowb_vip) is not present in table "permissions".',
          }
        },
      })
    )

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({
      error: 'invalid_reference',
      message: 'Key (permission_key)=(tier:lowb_vip) is not present in table "permissions".',
    })
  })

  it('forwards the authenticated actor when creating a catalog-backed group', async () => {
    let received: unknown
    const response = await handleConsoleApi(
      request('/api/services/api/groups', {
        method: 'POST',
        headers: { ...auth(), 'Content-Type': 'application/json' },
        body: JSON.stringify({
          key: 'reader',
          name: 'Reader',
          description: null,
          permission_keys: ['api:echo'],
          usage_policy_key: 'caller-limits',
        }),
      }),
      env,
      store({ createGroup: async (_serviceKey, input) => { received = input; return services[0] } })
    )
    expect(response.status).toBe(201)
    expect(received).toMatchObject({
      actor: admin.id,
      permission_keys: ['api:echo'],
      usage_policy_key: 'caller-limits',
    })
  })

  it('updates Group fields and policy binding through one store operation', async () => {
    let received: unknown
    let bindCalled = false
    const response = await handleConsoleApi(
      request('/api/services/api/groups/reader', {
        method: 'PUT',
        headers: { ...auth(), 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Reader',
          description: null,
          status: 'active',
          permission_keys: ['api:echo'],
          usage_policy_key: 'caller-limits',
        }),
      }),
      env,
      store({
        updateGroup: async (_serviceKey, _groupKey, input) => {
          received = input
          return services[0]
        },
        bindGroupPolicy: async () => {
          bindCalled = true
          return services[0]
        },
      })
    )

    expect(response.status).toBe(200)
    expect(received).toMatchObject({ usage_policy_key: 'caller-limits' })
    expect(bindCalled).toBe(false)
  })

  it('rejects malformed permission selections instead of silently clearing a group', async () => {
    let called = false
    const response = await handleConsoleApi(
      request('/api/services/api/groups/reader', {
        method: 'PUT', headers: { ...auth(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Reader', description: null, status: 'active', permission_keys: 'api:echo' }),
      }),
      env,
      store({ updateGroup: async () => { called = true; throw new Error('unexpected') } })
    )
    expect(response.status).toBe(400)
    expect(await response.json()).toMatchObject({ error: 'invalid_field' })
    expect(called).toBe(false)
  })

  it('returns raw pending manifests for permission and built-in-role review', async () => {
    const version: CapabilityVersion = {
      id: 'version-2', service_key: 'api', catalog_version: 'v2', import_status: 'pending_review',
      fetched_at: '2026-07-14T00:00:00Z', approved_at: null, rejection_reason: null, manifest,
    }
    const response = await handleConsoleApi(
      request('/api/services/api/capability-versions', { headers: auth() }),
      env,
      store({ listCapabilityVersions: async () => [version] })
    )
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ versions: [version] })
  })

  it('preserves a system-role read-only error from the store', async () => {
    const response = await handleConsoleApi(
      request('/api/services/api/groups/reader', {
        method: 'PUT', headers: { ...auth(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Changed', description: null, status: 'disabled', permission_keys: [] }),
      }),
      env,
      store({ updateGroup: async () => { throw new ApiError(400, 'system_role_read_only') } })
    )
    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: 'system_role_read_only' })
  })

  it('deletes a service for admins', async () => {
    let deletedKey: string | undefined
    const response = await handleConsoleApi(
      request('/api/services/time', { method: 'DELETE', headers: auth() }),
      env,
      store({
        deleteService: async (key) => {
          deletedKey = key
        },
      })
    )

    expect(response.status).toBe(200)
    expect(deletedKey).toBe('time')
    expect(await response.json()).toEqual({ deleted: true })
  })

  it('rejects a non-admin from deleting a service', async () => {
    const response = await handleConsoleApi(
      request('/api/services/time', {
        method: 'DELETE',
        headers: { Authorization: 'Bearer user-token' },
      }),
      env,
      store()
    )

    expect(response.status).toBe(403)
  })
})
