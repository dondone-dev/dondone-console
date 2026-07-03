import type { Session } from './auth'

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
  groups: PermissionGroup[]
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
    throw new Error(body.message ?? body.error ?? 'Request failed.')
  }
  return body as T
}
