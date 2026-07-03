import { describe, expect, it } from 'vitest'
import { handleConsoleApi } from './api'
import type {
  ConsoleEnv,
  ConsoleStore,
  Profile,
  Service,
  SupabaseUser,
  UserDetail,
} from './types'

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
    groups: [
      {
        id: 'group-console-admin',
        service_key: 'console',
        key: 'admin',
        name: 'Console Admin',
        description: null,
        status: 'active',
        is_system: true,
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
      groups: [],
    }),
    createGroup: async () => services[0],
    updateGroup: async () => services[0],
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

  it('lists services for admins', async () => {
    const response = await handleConsoleApi(
      request('/api/services', { headers: auth() }),
      env,
      store()
    )

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ services })
  })
})
