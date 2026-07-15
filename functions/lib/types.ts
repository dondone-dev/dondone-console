export class ApiError extends Error {
  readonly status: number
  readonly error: string

  constructor(status: number, error: string, message?: string) {
    super(message ?? error)
    this.status = status
    this.error = error
  }
}

export interface ConsoleEnv {
  SUPABASE_URL: string
  SUPABASE_PUBLISHABLE_KEY: string
  SUPABASE_SERVICE_ROLE_KEY: string
  CONSOLE_BOOTSTRAP_EMAILS: string
}

export interface SupabaseUser {
  id: string
  email?: string
}

export interface Profile {
  id: string
  email: string | null
  display_name: string | null
  avatar_url: string | null
  status: 'active' | 'disabled'
  created_at: string
}

export interface PermissionGroup {
  id: string
  service_key: string
  key: string
  name: string
  description: string | null
  status: 'active' | 'disabled'
  is_system: boolean
  permissions: string[]
}

export interface Service {
  key: string
  name: string
  description: string | null
  status: 'active' | 'disabled'
  redirect_uris: string[]
  groups: PermissionGroup[]
  resource_uri: string | null
  capability_sync_status: string
  active_capability_version: string | null
  capability_last_synced_at: string | null
  capability_last_error: string | null
  has_capability_versions: boolean
}

export interface CapabilityVersion {
  id: string
  service_key: string
  catalog_version: string
  import_status: string
  fetched_at: string
  approved_at: string | null
  rejection_reason: string | null
  manifest: CapabilityManifest
}

export interface CapabilityManifest {
  resource: string
  authorization_servers: string[]
  scopes_supported: string[]
  dondone_capabilities: {
    schema_version: 1
    catalog_version: string
    permissions: Array<{ key: string; description: string }>
    roles: Array<{
      key: string
      name: string
      description?: string
      permission_keys: string[]
    }>
  }
}

export interface ActiveCapability {
  service_key: string
  key: string
  description: string
  oauth_scope: boolean
  catalog_version: string
}

export interface DiffClassification {
  change_type: 'additive' | 'benign' | 'breaking'
  added_permissions: string[]
  removed_permissions: string[]
  added_scopes: string[]
  removed_scopes: string[]
  added_roles: string[]
  removed_roles: string[]
  changed_role_memberships: string[]
  description_changes: string[]
}

export interface UserGroupGrant {
  id: string
  user_id: string
  group_id: string
  status: 'active' | 'revoked'
  expires_at: string | null
}

export interface UserDetail {
  profile: Profile
  groups: UserGroupGrant[]
  permissions: string[]
}

export interface ConsoleStore {
  getUser(token: string): Promise<SupabaseUser>
  getProfile(userId: string): Promise<Profile | null>
  ensureProfile(user: SupabaseUser): Promise<Profile>
  getEffectivePermissions(userId: string): Promise<string[]>
  grantConsoleAdmin(userId: string): Promise<void>
  listUsers(params: {
    search: string | null
    status: string | null
    limit: number
    offset: number
  }): Promise<{ users: Profile[]; total: number }>
  getUserDetail(userId: string): Promise<UserDetail | null>
  replaceUserGroups(params: {
    userId: string
    grants: Array<{ group_id: string; expires_at: string | null }>
    grantedBy: string
  }): Promise<UserDetail>
  listServices(): Promise<Service[]>
  createService(input: {
    key: string
    name: string
    description: string | null
    redirect_uris: string[]
    resource_uri: string | null
  }): Promise<Service>
  updateService(key: string, input: {
    name: string
    description: string | null
    status: 'active' | 'disabled'
    redirect_uris: string[]
    resource_uri: string | null
  }): Promise<Service>
  createGroup(serviceKey: string, input: {
    key: string
    name: string
    description: string | null
    permission_keys: string[]
    actor: string
  }): Promise<Service>
  updateGroup(serviceKey: string, groupKey: string, input: {
    name: string
    description: string | null
    status: 'active' | 'disabled'
    permission_keys: string[]
    actor: string
  }): Promise<Service>
  listCapabilityVersions(serviceKey: string): Promise<CapabilityVersion[]>
  listActiveCapabilities(serviceKey: string): Promise<ActiveCapability[]>
}
