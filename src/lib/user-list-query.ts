export const USER_PAGE_SIZE = 20

export type UserStatusFilter = 'all' | 'active' | 'disabled'

export interface UserListQuery {
  search: string
  status: UserStatusFilter
  page: number
}

const VALID_STATUSES: ReadonlySet<string> = new Set(['active', 'disabled'])

export function parseUserListQuery(params: URLSearchParams): UserListQuery {
  const search = (params.get('search') ?? '').trim()

  const rawStatus = params.get('status') ?? ''
  const status: UserStatusFilter = VALID_STATUSES.has(rawStatus)
    ? (rawStatus as UserStatusFilter)
    : 'all'

  const rawPage = Number(params.get('page'))
  const page = Number.isFinite(rawPage) && rawPage >= 1 ? Math.floor(rawPage) : 1

  return { search, status, page }
}

export function updateUserListQuery(
  current: URLSearchParams,
  patch: Partial<UserListQuery>
): URLSearchParams {
  const base = parseUserListQuery(current)
  const merged = { ...base, ...patch }

  const next = new URLSearchParams()

  if (merged.search !== '') next.set('search', merged.search)
  if (merged.status !== 'all') next.set('status', merged.status)
  if (merged.page > 1) next.set('page', String(merged.page))

  return next
}

export function userListApiPath(query: UserListQuery): string {
  const params = new URLSearchParams()
  if (query.search) params.set('search', query.search)
  if (query.status !== 'all') params.set('status', query.status)
  params.set('limit', String(USER_PAGE_SIZE))
  params.set('offset', String((query.page - 1) * USER_PAGE_SIZE))
  return `/api/users?${params.toString()}`
}
