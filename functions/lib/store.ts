import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import {
  ApiError,
  type ConsoleEnv,
  type ConsoleStore,
  type PermissionGroup,
  type Profile,
  type Service,
  type UserGroupGrant,
} from './types'

type DbClient = SupabaseClient<any, any, any, any, any>

interface PermissionGroupRow {
  id: string
  service_key: string
  key: string
  name: string
  description: string | null
  status: 'active' | 'disabled'
  is_system: boolean
  permission_group_permissions?: Array<{
    permissions: { key: string } | null
  }>
}

interface ServiceRow {
  key: string
  name: string
  description: string | null
  status: 'active' | 'disabled'
  permission_groups?: PermissionGroupRow[]
}

interface UserPermissionGroupRow {
  id: string
  user_id: string
  group_id: string
  status: 'active' | 'revoked'
  expires_at: string | null
  permission_groups?: {
    permission_group_permissions?: Array<{
      permissions: { key: string } | null
    }>
  } | null
}

interface UserPermissionRow {
  permission_key: string
  status: 'active' | 'revoked'
  expires_at: string | null
}

export function createConsoleStore(env: ConsoleEnv): ConsoleStore {
  const admin = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  }) as unknown as DbClient

  return {
    async getUser(token) {
      const response = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
        headers: {
          apikey: env.SUPABASE_PUBLISHABLE_KEY,
          Authorization: `Bearer ${token}`,
        },
      })
      if (!response.ok) throw new Error('invalid token')
      const data = (await response.json()) as { id?: unknown; email?: unknown }
      if (typeof data.id !== 'string') throw new Error('invalid token')
      return {
        id: data.id,
        email: typeof data.email === 'string' ? data.email : undefined,
      }
    },

    async getProfile(userId) {
      const { data } = await admin
        .from('profiles')
        .select('id,email,display_name,avatar_url,status,created_at')
        .eq('id', userId)
        .maybeSingle<Profile>()
      return data ?? null
    },

    async ensureProfile(user) {
      const existing = await this.getProfile(user.id)
      if (existing) return existing

      const profile = {
        id: user.id,
        email: user.email ?? null,
        display_name: null,
        avatar_url: null,
        status: 'active' as const,
      }
      const { data, error } = await admin
        .from('profiles')
        .upsert(profile)
        .select('id,email,display_name,avatar_url,status,created_at')
        .single<Profile>()
      if (error || !data) throw error ?? new Error('profile upsert failed')
      return data
    },

    async getEffectivePermissions(userId) {
      const { data: direct } = await admin
        .from('user_permissions')
        .select('permission_key,status,expires_at')
        .eq('user_id', userId)
        .returns<UserPermissionRow[]>()
      const { data: groups } = await admin
        .from('user_permission_groups')
        .select(
          'id,user_id,group_id,status,expires_at,permission_groups(permission_group_permissions(permissions(key)))'
        )
        .eq('user_id', userId)
        .returns<UserPermissionGroupRow[]>()

      return effectivePermissions(direct ?? [], groups ?? [])
    },

    async grantConsoleAdmin(userId) {
      const { data: group, error } = await admin
        .from('permission_groups')
        .select('id')
        .eq('service_key', 'console')
        .eq('key', 'admin')
        .single<{ id: string }>()
      if (error || !group) throw error ?? new Error('console admin group missing')

      const { error: upsertError } = await admin
        .from('user_permission_groups')
        .upsert({
          user_id: userId,
          group_id: group.id,
          status: 'active',
          expires_at: null,
        })
      if (upsertError) throw upsertError
    },

    async listUsers(params) {
      let query = admin
        .from('profiles')
        .select('id,email,display_name,avatar_url,status,created_at', {
          count: 'exact',
        })
        .order('created_at', { ascending: false })
        .range(params.offset, params.offset + params.limit - 1)

      if (params.search) query = query.ilike('email', `%${params.search}%`)
      if (params.status) query = query.eq('status', params.status)

      const { data, count, error } = await query.returns<Profile[]>()
      if (error) throw error
      return { users: data ?? [], total: count ?? 0 }
    },

    async getUserDetail(userId) {
      const profile = await this.getProfile(userId)
      if (!profile) return null
      const groups = await listUserGroups(admin, userId)
      return {
        profile,
        groups,
        permissions: await this.getEffectivePermissions(userId),
      }
    },

    async replaceUserGroups({ userId, grants, grantedBy }) {
      await admin.from('user_permission_groups').delete().eq('user_id', userId)
      if (grants.length > 0) {
        const { error } = await admin.from('user_permission_groups').insert(
          grants.map((grant) => ({
            user_id: userId,
            group_id: grant.group_id,
            expires_at: grant.expires_at,
            status: 'active',
            granted_by: grantedBy,
          }))
        )
        if (error) throw error
      }
      const detail = await this.getUserDetail(userId)
      if (!detail) throw new Error('user missing after update')
      return detail
    },

    async listServices() {
      const { data, error } = await admin
        .from('services')
        .select(
          'key,name,description,status,permission_groups(id,service_key,key,name,description,status,is_system,permission_group_permissions(permissions(key)))'
        )
        .order('key')
        .returns<ServiceRow[]>()
      if (error) throw error
      return (data ?? []).map(mapService)
    },

    async createService(input) {
      const { error } = await admin.from('services').insert({
        key: input.key,
        name: input.name,
        description: input.description,
      })
      if (error) throw error
      return serviceByKey(admin, input.key)
    },

    async createGroup(serviceKey, input) {
      await assertPermissionKeysExist(admin, input.permission_keys)
      const { data: group, error } = await admin
        .from('permission_groups')
        .insert({
          service_key: serviceKey,
          key: input.key,
          name: input.name,
          description: input.description,
        })
        .select('id')
        .single<{ id: string }>()
      if (error || !group) throw error ?? new Error('group insert failed')
      await replaceGroupPermissions(admin, group.id, input.permission_keys)
      return serviceByKey(admin, serviceKey)
    },

    async updateGroup(serviceKey, groupKey, input) {
      await assertPermissionKeysExist(admin, input.permission_keys)
      const { data: group, error } = await admin
        .from('permission_groups')
        .update({
          name: input.name,
          description: input.description,
          status: input.status,
        })
        .eq('service_key', serviceKey)
        .eq('key', groupKey)
        .select('id')
        .single<{ id: string }>()
      if (error || !group) throw error ?? new Error('group update failed')
      await replaceGroupPermissions(admin, group.id, input.permission_keys)
      return serviceByKey(admin, serviceKey)
    },
  }
}

function effectivePermissions(
  direct: UserPermissionRow[],
  groups: UserPermissionGroupRow[]
): string[] {
  const now = Date.now()
  const permissions = new Set<string>()
  for (const row of direct) {
    if (row.status === 'active' && (!row.expires_at || Date.parse(row.expires_at) > now)) {
      permissions.add(row.permission_key)
    }
  }
  for (const grant of groups) {
    if (grant.status !== 'active') continue
    if (grant.expires_at && Date.parse(grant.expires_at) <= now) continue
    for (const item of grant.permission_groups?.permission_group_permissions ?? []) {
      if (item.permissions?.key) permissions.add(item.permissions.key)
    }
  }
  return [...permissions].sort()
}

async function listUserGroups(
  admin: DbClient,
  userId: string
): Promise<UserGroupGrant[]> {
  const { data, error } = await admin
    .from('user_permission_groups')
    .select('id,user_id,group_id,status,expires_at')
    .eq('user_id', userId)
    .returns<UserGroupGrant[]>()
  if (error) throw error
  return data ?? []
}

async function assertPermissionKeysExist(
  admin: DbClient,
  permissionKeys: string[]
): Promise<void> {
  if (permissionKeys.length === 0) return
  const requested = [...new Set(permissionKeys)]
  const { data, error } = await admin
    .from('permissions')
    .select('key')
    .in('key', requested)
    .returns<Array<{ key: string }>>()
  if (error) throw error
  const found = new Set((data ?? []).map((row) => row.key))
  const missing = requested.filter((key) => !found.has(key))
  if (missing.length > 0) {
    throw new ApiError(
      400,
      'unknown_permission_keys',
      `Unknown permission key(s): ${missing.join(', ')}. Create them in the permissions table before attaching to a group.`
    )
  }
}

async function replaceGroupPermissions(
  admin: DbClient,
  groupId: string,
  permissionKeys: string[]
): Promise<void> {
  await admin.from('permission_group_permissions').delete().eq('group_id', groupId)
  if (permissionKeys.length === 0) return
  const { error } = await admin.from('permission_group_permissions').insert(
    permissionKeys.map((permissionKey) => ({
      group_id: groupId,
      permission_key: permissionKey,
    }))
  )
  if (error) throw error
}

async function serviceByKey(
  admin: DbClient,
  serviceKey: string
): Promise<Service> {
  const { data, error } = await admin
    .from('services')
    .select(
      'key,name,description,status,permission_groups(id,service_key,key,name,description,status,is_system,permission_group_permissions(permissions(key)))'
    )
    .eq('key', serviceKey)
    .single<ServiceRow>()
  if (error || !data) throw error ?? new Error('service missing')
  return mapService(data)
}

function mapService(row: ServiceRow): Service {
  return {
    key: row.key,
    name: row.name,
    description: row.description,
    status: row.status,
    groups: (row.permission_groups ?? []).map(mapGroup),
  }
}

function mapGroup(row: PermissionGroupRow): PermissionGroup {
  return {
    id: row.id,
    service_key: row.service_key,
    key: row.key,
    name: row.name,
    description: row.description,
    status: row.status,
    is_system: row.is_system,
    permissions: (row.permission_group_permissions ?? [])
      .map((item) => item.permissions?.key)
      .filter((key): key is string => typeof key === 'string')
      .sort(),
  }
}
