import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { RefreshCw, Search, Users as UsersIcon } from 'lucide-react'
import { toast } from 'sonner'
import { apiFetch, type Profile, type Service, type UserDetail } from '@/lib/api'
import type { Session } from '@/lib/auth'
import { useConsole } from '@/lib/console-context'
import { cn } from '@/lib/utils'
import { PageHeader } from '@/components/page-header'
import { EmptyState } from '@/components/empty-state'
import { Badge, StatusDot } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
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
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<string | null>(null)

  const users = useQuery({
    queryKey: ['users', search],
    queryFn: () =>
      apiFetch<{ users: Profile[]; total: number }>(
        session,
        `/api/users?search=${encodeURIComponent(search)}`
      ),
  })

  const list = users.data?.users ?? []
  const selectedUser = list.find((user) => user.id === selected) ?? list[0]

  return (
    <>
      <PageHeader title="Users" description="Manage service permission groups for Dondone users." />

      <div className="relative max-w-xs">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          className="pl-8"
          placeholder="Search by email"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
        <Card className="overflow-hidden py-0">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Email</TableHead>
                <TableHead className="w-28">Status</TableHead>
                <TableHead className="w-36">Created</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.isLoading &&
                Array.from({ length: 5 }, (_, index) => (
                  <TableRow key={index}>
                    <TableCell><Skeleton className="h-4 w-48" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                  </TableRow>
                ))}
              {users.isError && (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={3} className="py-8 text-center text-sm text-muted-foreground">
                    Failed to load users.
                    <Button variant="link" size="sm" onClick={() => void users.refetch()}>
                      Retry
                    </Button>
                  </TableCell>
                </TableRow>
              )}
              {users.isSuccess && list.length === 0 && (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={3} className="p-0">
                    <EmptyState
                      className="rounded-none border-0"
                      icon={<UsersIcon />}
                      title="No users found"
                      description={
                        search
                          ? `No users match "${search}".`
                          : 'Users appear here after they sign in with Dondone Auth.'
                      }
                    />
                  </TableCell>
                </TableRow>
              )}
              {list.map((user) => (
                <TableRow
                  key={user.id}
                  className="cursor-pointer"
                  data-state={selectedUser?.id === user.id ? 'selected' : undefined}
                  onClick={() => setSelected(user.id)}
                >
                  <TableCell className="max-w-0 truncate font-medium">{user.email}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className="capitalize text-muted-foreground">
                      <StatusDot active={user.status === 'active'} />
                      {user.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {new Date(user.created_at).toLocaleDateString()}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>

        {selectedUser && <UserGroups key={selectedUser.id} session={session} user={selectedUser} />}
      </div>
    </>
  )
}

function UserGroups({ session, user }: { session: Session; user: Profile }) {
  const queryClient = useQueryClient()
  const detail = useQuery({
    queryKey: ['user-detail', user.id],
    queryFn: () => apiFetch<UserDetail>(session, `/api/users/${user.id}`),
  })
  const services = useQuery({
    queryKey: ['services'],
    queryFn: () => apiFetch<{ services: Service[] }>(session, '/api/services'),
  })
  const groupGrants = detail.data?.groups
  const activeGrants = useMemo(
    () => new Map(
      (groupGrants ?? [])
        .filter((grant) => grant.status === 'active')
        .map((grant) => [grant.group_id, grant.expires_at] as const)
    ),
    [groupGrants]
  )
  const [draft, setDraft] = useState<Map<string, string | null> | null>(null)
  const selectedGroups = draft ?? activeGrants

  const save = useMutation({
    mutationFn: () =>
      apiFetch<UserDetail>(session, `/api/users/${user.id}/groups`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          grants: [...selectedGroups].map(([groupId, expiresAt]) => ({
            group_id: groupId,
            expires_at: expiresAt,
          })),
        }),
      }),
    onSuccess: () => {
      setDraft(null)
      toast.success('Permission groups updated')
      void queryClient.invalidateQueries({ queryKey: ['user-detail', user.id] })
    },
    onError: (error) =>
      toast.error('Failed to save groups', {
        description: error instanceof Error ? error.message : undefined,
      }),
  })

  const loading = detail.isLoading || services.isLoading
  const permissions = detail.data?.permissions ?? []

  return (
    <Card className="xl:sticky xl:top-7">
      <CardHeader>
        <CardTitle className="truncate">{user.email}</CardTitle>
        <CardDescription>Effective permissions from assigned roles</CardDescription>
        <div className="flex flex-wrap gap-1 pt-1">
          {permissions.length === 0 && !loading && (
            <span className="text-xs text-muted-foreground">No permissions granted.</span>
          )}
          {permissions.map((permission) => (
            <Badge key={permission} variant="secondary" className="font-mono text-[11px]">
              {permission}
            </Badge>
          ))}
        </div>
      </CardHeader>
      <CardContent className="grid gap-4">
        {loading && (
          <div className="grid gap-2">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        )}
        {(services.data?.services ?? []).map((service) => (
          <div key={service.key} className="grid gap-2">
            <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {service.name}
            </div>
            {service.groups.map((group) => {
              const checked = selectedGroups.has(group.id)
              return (
                <div
                  key={group.id}
                  className={cn(
                    'flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors hover:bg-muted/50',
                    checked && 'border-primary/40 bg-primary/5 dark:bg-primary/10'
                  )}
                >
                  <Checkbox className="mt-0.5" checked={checked} disabled={group.status !== 'active' && !checked}
                    onCheckedChange={() => {
                      const next = new Map(selectedGroups)
                      if (checked) next.delete(group.id)
                      else next.set(group.id, null)
                      setDraft(next)
                    }} />
                  <span className="grid gap-0.5 text-sm leading-tight">
                    <span className="font-medium">{group.name}</span>
                    <span className="font-mono text-xs text-muted-foreground">
                      {group.permissions.join(', ') || 'no permissions'}
                    </span>
                    {checked && (
                      <span className="mt-1 grid gap-1">
                        <span className="text-[11px] text-muted-foreground">Expires at (optional)</span>
                        <Input
                          type="datetime-local"
                          className="h-8 text-xs"
                          value={toDateTimeLocal(selectedGroups.get(group.id) ?? null)}
                          onChange={(event) => {
                            const next = new Map(selectedGroups)
                            next.set(group.id, event.target.value ? new Date(event.target.value).toISOString() : null)
                            setDraft(next)
                          }}
                        />
                      </span>
                    )}
                  </span>
                </div>
              )
            })}
          </div>
        ))}
      </CardContent>
      <CardFooter className="flex-col items-stretch gap-2">
        <Button onClick={() => save.mutate()} disabled={draft === null || save.isPending}>
          {save.isPending && <RefreshCw className="animate-spin" />}
          {draft === null ? 'No changes' : 'Save changes'}
        </Button>
      </CardFooter>
    </Card>
  )
}

function toDateTimeLocal(value: string | null): string {
  if (!value) return ''
  const date = new Date(value)
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
  return local.toISOString().slice(0, 16)
}
