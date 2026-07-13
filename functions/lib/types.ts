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
  }): Promise<Service>
  updateService(key: string, input: {
    name: string
    description: string | null
    status: 'active' | 'disabled'
    redirect_uris: string[]
  }): Promise<Service>
  createGroup(serviceKey: string, input: {
    key: string
    name: string
    description: string | null
    permission_keys: string[]
  }): Promise<Service>
  updateGroup(serviceKey: string, groupKey: string, input: {
    name: string
    description: string | null
    status: 'active' | 'disabled'
    permission_keys: string[]
  }): Promise<Service>
}
