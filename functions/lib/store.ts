import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import {
  type ActiveCapability,
  type CapabilityVersion,
  type ConsoleEnv,
  type ConsoleStore,
  type PermissionGroup,
  type Profile,
  type Service,
  type UserGroupGrant,
} from './types'
import { assertValidRedirectUris, assertValidServiceKey, normalizeResourceUri, requireFoundRow } from './validation'

type DbClient = SupabaseClient<any, any, any, any, any>

const SERVICE_SELECT =
  'key,name,description,status,redirect_uris,resource_uri,capability_sync_status,active_capability_version,capability_last_synced_at,capability_last_error,service_capability_versions!service_capability_versions_service_key_fkey(id),permission_groups(id,service_key,key,name,description,status,is_system,permission_group_permissions(permissions(key)))'

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
  redirect_uris: string[]
  resource_uri: string | null
  capability_sync_status: string
  active_capability_version: string | null
  capability_last_synced_at: string | null
  capability_last_error: string | null
  service_capability_versions?: Array<{ id: string }>
  permission_groups?: PermissionGroupRow[]
}

interface UserPermissionGroupRow {
  id: string
  user_id: string
  group_id: string
  status: 'active' | 'revoked'
  expires_at: string | null
  permission_groups?: {
    status: 'active' | 'disabled'
    permission_group_permissions?: Array<{
      permissions: { key: string } | null
    }>
  } | null
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
      const { data, error } = await admin
        .from('profiles')
        .select('id,email,display_name,avatar_url,status,created_at')
        .eq('id', userId)
        .maybeSingle<Profile>()
      if (error) throw error
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
      const { data: groups, error: groupsError } = await admin
        .from('user_permission_groups')
        .select(
          'id,user_id,group_id,status,expires_at,permission_groups(status,permission_group_permissions(permissions(key)))'
        )
        .eq('user_id', userId)
        .returns<UserPermissionGroupRow[]>()
      if (groupsError) throw groupsError

      return effectivePermissions(groups ?? [])
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
      const { error } = await admin.rpc('console_replace_user_permission_groups', {
        p_user_id: userId,
        p_grants: grants,
        p_actor: grantedBy,
      })
      if (error) throw error

      const detail = await this.getUserDetail(userId)
      if (!detail) throw new Error('user missing after update')
      return detail
    },

    async listServices() {
      const { data, error } = await admin
        .from('services')
        .select(SERVICE_SELECT)
        .order('key')
        .returns<ServiceRow[]>()
      if (error) throw error
      return (data ?? []).map(mapService)
    },

    async createService(input) {
      assertValidServiceKey(input.key)
      assertValidRedirectUris(input.redirect_uris)
      const resourceUri = normalizeResourceUri(input.resource_uri)
      const { error } = await admin.from('services').insert({
        key: input.key,
        name: input.name,
        description: input.description,
        redirect_uris: input.redirect_uris,
        resource_uri: resourceUri,
      })
      if (error) throw error
      return serviceByKey(admin, input.key)
    },

    async updateService(key, input) {
      assertValidRedirectUris(input.redirect_uris)
      const resourceUri = normalizeResourceUri(input.resource_uri)
      const { data, error } = await admin
        .from('services')
        .update({
          name: input.name,
          description: input.description,
          status: input.status,
          redirect_uris: input.redirect_uris,
          resource_uri: resourceUri,
        })
        .eq('key', key)
        .select('key')
        .maybeSingle<{ key: string }>()
      requireFoundRow(data, error)
      return serviceByKey(admin, key)
    },

    async createGroup(serviceKey, input) {
      const { error } = await admin.rpc('console_create_permission_group', {
        p_service_key: serviceKey,
        p_group_key: input.key,
        p_name: input.name,
        p_description: input.description,
        p_permission_keys: input.permission_keys,
        p_actor: input.actor,
      })
      if (error) throw error
      return serviceByKey(admin, serviceKey)
    },

    async updateGroup(serviceKey, groupKey, input) {
      const { error } = await admin.rpc('console_update_permission_group', {
        p_service_key: serviceKey,
        p_group_key: groupKey,
        p_name: input.name,
        p_description: input.description,
        p_status: input.status,
        p_permission_keys: input.permission_keys,
        p_actor: input.actor,
      })
      if (error) throw error
      return serviceByKey(admin, serviceKey)
    },

    async listCapabilityVersions(serviceKey) {
      const { data, error } = await admin
        .from('service_capability_versions')
        .select('id,service_key,catalog_version,import_status,fetched_at,approved_at,rejection_reason,manifest')
        .eq('service_key', serviceKey)
        .order('fetched_at', { ascending: false })
        .returns<CapabilityVersion[]>()
      if (error) throw error
      return data ?? []
    },

    async listActiveCapabilities(serviceKey) {
      const { data, error } = await admin
        .from('active_service_capabilities')
        .select('service_key,key,description,oauth_scope,catalog_version')
        .eq('service_key', serviceKey)
        .returns<ActiveCapability[]>()
      if (error) throw error
      return data ?? []
    },
  }
}

function effectivePermissions(groups: UserPermissionGroupRow[]): string[] {
  const now = Date.now()
  const permissions = new Set<string>()
  for (const grant of groups) {
    if (grant.status !== 'active') continue
    if (grant.expires_at && Date.parse(grant.expires_at) <= now) continue
    if (grant.permission_groups?.status !== 'active') continue
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

async function serviceByKey(
  admin: DbClient,
  serviceKey: string
): Promise<Service> {
  const { data, error } = await admin
    .from('services')
    .select(SERVICE_SELECT)
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
    redirect_uris: row.redirect_uris ?? [],
    groups: (row.permission_groups ?? []).map(mapGroup),
    resource_uri: row.resource_uri ?? null,
    capability_sync_status: row.capability_sync_status ?? 'not_configured',
    active_capability_version: row.active_capability_version ?? null,
    capability_last_synced_at: row.capability_last_synced_at ?? null,
    capability_last_error: row.capability_last_error ?? null,
    has_capability_versions: (row.service_capability_versions?.length ?? 0) > 0,
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
