import { useEffect } from 'react'
import { Link, useLocation, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ChevronRight, Search, Users as UsersIcon } from 'lucide-react'
import { apiFetch, type Profile } from '@/lib/api'
import { useConsole } from '@/lib/console-context'
import {
  parseUserListQuery,
  updateUserListQuery,
  userListApiPath,
  USER_PAGE_SIZE,
} from '@/lib/user-list-query'
import { PageHeader } from '@/components/page-header'
import { EmptyState } from '@/components/empty-state'
import { Badge, StatusDot } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Pagination } from '@/components/ui/pagination'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

export function UsersPage() {
  const { session } = useConsole()
  const location = useLocation()
  const [searchParams, setSearchParams] = useSearchParams()
  const query = parseUserListQuery(searchParams)

  const users = useQuery({
    queryKey: ['users', query.search, query.status, query.page, USER_PAGE_SIZE],
    queryFn: () =>
      apiFetch<{ users: Profile[]; total: number }>(session, userListApiPath(query)),
  })

  const list = users.data?.users ?? []
  const total = users.data?.total ?? 0
  const pageCount = Math.max(1, Math.ceil(total / USER_PAGE_SIZE))

  useEffect(() => {
    if (users.isSuccess && query.page > pageCount) {
      setSearchParams(updateUserListQuery(searchParams, { page: pageCount }), {
        replace: true,
      })
    }
  }, [users.isSuccess, query.page, pageCount, searchParams, setSearchParams])

  const linkState = { from: location.pathname + location.search }
  const hasFilters = query.search !== '' || query.status !== 'all'

  function displayName(user: Profile) {
    return user.display_name || user.email || 'Unnamed user'
  }

  function secondaryText(user: Profile) {
    if (user.display_name) return user.email
    return user.id
  }

  return (
    <>
      <PageHeader
        title="Users"
        description="Manage Dondone users and their service access."
      />

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative max-w-xs flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-8"
            placeholder="Search by email"
            value={query.search}
            onChange={(e) =>
              setSearchParams(
                updateUserListQuery(searchParams, {
                  search: e.target.value,
                  page: 1,
                }),
                { replace: true }
              )
            }
          />
        </div>
        <Select
          value={query.status}
          onValueChange={(value) =>
            setSearchParams(
              updateUserListQuery(searchParams, {
                status: value as 'all' | 'active' | 'disabled',
                page: 1,
              })
            )
          }
        >
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="disabled">Disabled</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Card className="overflow-hidden py-0">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>User</TableHead>
              <TableHead className="w-28">Status</TableHead>
              <TableHead className="w-36">Created</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.isLoading &&
              Array.from({ length: 5 }, (_, index) => (
                <TableRow key={index}>
                  <TableCell>
                    <Skeleton className="mb-1 h-4 w-48" />
                    <Skeleton className="h-3 w-32" />
                  </TableCell>
                  <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                  <TableCell />
                </TableRow>
              ))}
            {users.isError && (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={4} className="py-8 text-center text-sm text-muted-foreground">
                  Failed to load users.
                  <Button variant="link" size="sm" onClick={() => void users.refetch()}>
                    Retry
                  </Button>
                </TableCell>
              </TableRow>
            )}
            {users.isSuccess && list.length === 0 && (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={4} className="p-0">
                  <EmptyState
                    className="rounded-none border-0"
                    icon={<UsersIcon />}
                    title="No users found"
                    description={
                      hasFilters
                        ? 'No users match the current filters.'
                        : 'Users appear here after they sign in with Dondone Auth.'
                    }
                    action={
                      hasFilters ? (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setSearchParams(new URLSearchParams())}
                        >
                          Clear filters
                        </Button>
                      ) : undefined
                    }
                  />
                </TableCell>
              </TableRow>
            )}
            {list.map((user) => (
              <TableRow key={user.id}>
                <TableCell className="max-w-0">
                  <Link
                    to={`/users/${user.id}`}
                    state={linkState}
                    className="block truncate font-medium hover:underline"
                  >
                    {displayName(user)}
                  </Link>
                  <span
                    className={`block truncate text-xs text-muted-foreground ${!user.display_name ? 'font-mono' : ''}`}
                  >
                    {secondaryText(user)}
                  </span>
                </TableCell>
                <TableCell>
                  <Badge variant="outline" className="capitalize text-muted-foreground">
                    <StatusDot active={user.status === 'active'} />
                    {user.status}
                  </Badge>
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {new Date(user.created_at).toLocaleDateString()}
                </TableCell>
                <TableCell>
                  <Link
                    to={`/users/${user.id}`}
                    state={linkState}
                    aria-label={`View ${user.email || user.id}`}
                  >
                    <ChevronRight className="size-4 text-muted-foreground" />
                  </Link>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      {users.isSuccess && total > USER_PAGE_SIZE && (
        <Pagination
          page={query.page}
          pageCount={pageCount}
          total={total}
          pageSize={USER_PAGE_SIZE}
          onPageChange={(p) =>
            setSearchParams(updateUserListQuery(searchParams, { page: p }))
          }
          itemLabel="users"
        />
      )}
    </>
  )
}
