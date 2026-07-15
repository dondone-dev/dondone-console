import type { Session } from './auth'

export class ApiClientError extends Error {
  readonly status: number
  readonly error: string

  constructor(status: number, error: string) {
    super(error)
    this.status = status
    this.error = error
  }
}

export interface MeResponse {
  user: { id: string; email?: string }
  profile: Profile | null
  console_admin: boolean
  permissions: string[]
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

export interface UserDetail {
  profile: Profile
  groups: Array<{
    id: string
    user_id: string
    group_id: string
    status: 'active' | 'revoked'
    expires_at: string | null
  }>
  permissions: string[]
}

export async function apiFetch<T>(
  session: Session,
  path: string,
  init: RequestInit = {}
): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: {
      ...init.headers,
      Authorization: `Bearer ${session.accessToken}`,
    },
  })
  const body = await response.json()
  if (!response.ok) {
    throw new ApiClientError(
      response.status,
      body.message ?? body.error ?? 'request_failed'
    )
  }
  return body as T
}

const AUTH_BASE = import.meta.env.VITE_AUTH_BASE as string

export async function authAdminFetch<T>(
  session: Session,
  path: string,
  init: RequestInit = {}
): Promise<T> {
  const response = await fetch(`${AUTH_BASE}${path}`, {
    ...init,
    headers: {
      ...init.headers,
      Authorization: `Bearer ${session.accessToken}`,
      'Content-Type': 'application/json',
    },
  })
  const body = await response.json()
  if (!response.ok) {
    throw new ApiClientError(
      response.status,
      body.message ?? body.error ?? 'request_failed'
    )
  }
  return body as T
}
