import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  BadgeCheck,
  Boxes,
  KeyRound,
  LogIn,
  LogOut,
  RefreshCw,
  Search,
  ShieldAlert,
  Users,
} from 'lucide-react'
import {
  clearSession,
  handleCallback,
  loadSession,
  startLogin,
  type Session,
} from '@/lib/auth'
import {
  apiFetch,
  type MeResponse,
  type Profile,
  type Service,
  type UserDetail,
} from '@/lib/api'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'

type View = 'users' | 'services' | 'activity' | 'settings'

function CallbackHandler() {
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    handleCallback()
      .then(() => window.location.replace('/'))
      .catch((err: unknown) =>
        setError(err instanceof Error ? err.message : 'Authorization failed.')
      )
  }, [])

  if (error) {
    return (
      <div className="flex min-h-svh items-center justify-center p-6">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>Authorization failed</CardTitle>
            <CardDescription>{error}</CardDescription>
          </CardHeader>
          <CardContent>
            <Button className="w-full" onClick={() => window.location.replace('/')}>
              Back to console
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="flex min-h-svh items-center justify-center text-muted-foreground">
      <RefreshCw className="mr-2 size-4 animate-spin" />
      Completing sign in
    </div>
  )
}

function SignIn() {
  return (
    <div className="flex min-h-svh items-center justify-center p-6">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Dondone Console</CardTitle>
          <CardDescription>Sign in with Dondone Auth to manage users and service permissions.</CardDescription>
        </CardHeader>
        <CardContent>
          <Button className="w-full" onClick={() => void startLogin()}>
            <LogIn className="size-4" />
            Sign in
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}

export default function App() {
  if (window.location.pathname === '/auth/callback') return <CallbackHandler />
  return <ConsoleApp />
}

function ConsoleApp() {
  const [session, setSession] = useState<Session | null>(() => loadSession())
  const [view, setView] = useState<View>('users')
  const queryClient = useQueryClient()

  const me = useQuery({
    queryKey: ['me', session?.accessToken],
    queryFn: () => apiFetch<MeResponse>(session!, '/api/me'),
    enabled: session !== null,
    retry: false,
  })

  const bootstrap = useMutation({
    mutationFn: () => apiFetch<{ ok: boolean }>(session!, '/api/bootstrap', { method: 'POST' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['me'] }),
  })

  if (!session) return <SignIn />

  if (me.isLoading) {
    return (
      <div className="flex min-h-svh items-center justify-center text-muted-foreground">
        <RefreshCw className="mr-2 size-4 animate-spin" />
        Loading console
      </div>
    )
  }

  if (me.isError) {
    return (
      <CenteredState
        title="Session expired"
        description="Sign in again to continue."
        action={
          <Button
            onClick={() => {
              clearSession()
              setSession(null)
            }}
          >
            Sign out
          </Button>
        }
      />
    )
  }

  if (!me.data?.console_admin) {
    return (
      <CenteredState
        title="Access required"
        description="This account is not a Console administrator."
        icon={<ShieldAlert className="size-5" />}
        action={
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => bootstrap.mutate()}
              disabled={bootstrap.isPending}
            >
              {bootstrap.isPending && <RefreshCw className="size-4 animate-spin" />}
              Initialize admin access
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                clearSession()
                setSession(null)
              }}
            >
              Sign out
            </Button>
          </div>
        }
      />
    )
  }

  return (
    <div className="grid min-h-svh grid-cols-[240px_1fr] bg-background">
      <aside className="border-r bg-card px-4 py-5">
        <div className="mb-8 flex items-center gap-2">
          <div className="flex size-9 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <KeyRound className="size-4" />
          </div>
          <div>
            <div className="text-sm font-semibold">Dondone Console</div>
            <div className="text-xs text-muted-foreground">{session.email}</div>
          </div>
        </div>

        <nav className="grid gap-1">
          <NavButton active={view === 'users'} onClick={() => setView('users')} icon={<Users />}>
            Users
          </NavButton>
          <NavButton active={view === 'services'} onClick={() => setView('services')} icon={<Boxes />}>
            Services
          </NavButton>
          <NavButton active={view === 'activity'} onClick={() => setView('activity')} icon={<BadgeCheck />}>
            Activity
          </NavButton>
          <NavButton active={view === 'settings'} onClick={() => setView('settings')} icon={<KeyRound />}>
            Settings
          </NavButton>
        </nav>

        <Button
          variant="ghost"
          className="mt-8 w-full justify-start"
          onClick={() => {
            clearSession()
            setSession(null)
          }}
        >
          <LogOut className="size-4" />
          Sign out
        </Button>
      </aside>

      <main className="min-w-0 px-8 py-6">
        {view === 'users' && <UsersView session={session} />}
        {view === 'services' && <ServicesView session={session} />}
        {view === 'activity' && <Placeholder title="Activity" description="Audit events will appear here after the audit log table is added." />}
        {view === 'settings' && <Placeholder title="Settings" description="Bootstrap and deployment settings are managed with Cloudflare environment variables." />}
      </main>
    </div>
  )
}

function NavButton(props: {
  active: boolean
  onClick: () => void
  icon: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <button
      className={cn(
        'flex h-10 items-center gap-2 rounded-md px-3 text-left text-sm transition-colors',
        props.active
          ? 'bg-accent text-accent-foreground'
          : 'text-muted-foreground hover:bg-muted hover:text-foreground'
      )}
      onClick={props.onClick}
    >
      <span className="[&_svg]:size-4">{props.icon}</span>
      {props.children}
    </button>
  )
}

function UsersView({ session }: { session: Session }) {
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

  const selectedUser = users.data?.users.find((user) => user.id === selected) ?? users.data?.users[0]

  return (
    <div className="grid gap-5">
      <PageHeader title="Users" description="Manage service permission groups for Dondone users." />
      <div className="flex max-w-md items-center gap-2">
        <Search className="size-4 text-muted-foreground" />
        <Input placeholder="Search by email" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>
      <div className="grid grid-cols-[minmax(0,1fr)_380px] gap-5">
        <Card>
          <CardContent className="p-0">
            <div className="grid grid-cols-[1fr_110px_160px] border-b px-4 py-3 text-xs font-medium text-muted-foreground">
              <span>Email</span>
              <span>Status</span>
              <span>Created</span>
            </div>
            {(users.data?.users ?? []).map((user) => (
              <button
                key={user.id}
                className={cn(
                  'grid w-full grid-cols-[1fr_110px_160px] border-b px-4 py-3 text-left text-sm hover:bg-muted',
                  selectedUser?.id === user.id && 'bg-accent'
                )}
                onClick={() => setSelected(user.id)}
              >
                <span className="truncate">{user.email}</span>
                <span>{user.status}</span>
                <span className="text-muted-foreground">{new Date(user.created_at).toLocaleDateString()}</span>
              </button>
            ))}
          </CardContent>
        </Card>
        {selectedUser && <UserGroups key={selectedUser.id} session={session} user={selectedUser} />}
      </div>
    </div>
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
  const activeGroupIds = useMemo(
    () => new Set((detail.data?.groups ?? []).filter((g) => g.status === 'active').map((g) => g.group_id)),
    [detail.data]
  )
  const [draft, setDraft] = useState<Set<string> | null>(null)
  const selectedGroups = draft ?? activeGroupIds

  const save = useMutation({
    mutationFn: () =>
      apiFetch<UserDetail>(session, `/api/users/${user.id}/groups`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          grants: [...selectedGroups].map((groupId) => ({ group_id: groupId, expires_at: null })),
        }),
      }),
    onSuccess: () => {
      setDraft(null)
      queryClient.invalidateQueries({ queryKey: ['user-detail', user.id] })
    },
  })

  return (
    <Card>
      <CardHeader>
        <CardTitle>{user.email}</CardTitle>
        <CardDescription>Effective permissions: {(detail.data?.permissions ?? []).join(', ') || 'none'}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        {(services.data?.services ?? []).map((service) => (
          <div key={service.key} className="grid gap-2">
            <div className="text-sm font-medium">{service.name}</div>
            {service.groups.map((group) => {
              const checked = selectedGroups.has(group.id)
              return (
                <label key={group.id} className="flex items-center justify-between rounded-md border px-3 py-2 text-sm">
                  <span>
                    {group.name}
                    <span className="ml-2 text-xs text-muted-foreground">{group.permissions.join(', ')}</span>
                  </span>
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => {
                      const next = new Set(selectedGroups)
                      if (checked) next.delete(group.id)
                      else next.add(group.id)
                      setDraft(next)
                    }}
                  />
                </label>
              )
            })}
          </div>
        ))}
        <Button onClick={() => save.mutate()} disabled={save.isPending}>
          {save.isPending && <RefreshCw className="size-4 animate-spin" />}
          Save groups
        </Button>
      </CardContent>
    </Card>
  )
}

function ServicesView({ session }: { session: Session }) {
  const queryClient = useQueryClient()
  const [serviceKey, setServiceKey] = useState('')
  const [serviceName, setServiceName] = useState('')
  const [serviceDescription, setServiceDescription] = useState('')
  const [groupServiceKey, setGroupServiceKey] = useState('')
  const [groupKey, setGroupKey] = useState('')
  const [groupName, setGroupName] = useState('')
  const [groupPermissions, setGroupPermissions] = useState('')
  const services = useQuery({
    queryKey: ['services'],
    queryFn: () => apiFetch<{ services: Service[] }>(session, '/api/services'),
  })
  const createService = useMutation({
    mutationFn: () =>
      apiFetch<Service>(session, '/api/services', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          key: serviceKey,
          name: serviceName,
          description: serviceDescription || null,
        }),
      }),
    onSuccess: () => {
      setServiceKey('')
      setServiceName('')
      setServiceDescription('')
      queryClient.invalidateQueries({ queryKey: ['services'] })
    },
  })
  const createGroup = useMutation({
    mutationFn: () =>
      apiFetch<Service>(session, `/api/services/${groupServiceKey}/groups`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          key: groupKey,
          name: groupName,
          description: null,
          permission_keys: splitPermissionKeys(groupPermissions),
        }),
      }),
    onSuccess: () => {
      setGroupKey('')
      setGroupName('')
      setGroupPermissions('')
      queryClient.invalidateQueries({ queryKey: ['services'] })
    },
  })

  return (
    <div className="grid gap-5">
      <PageHeader title="Services" description="Review services, permission groups, and group permissions." />
      <div className="grid grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Create service</CardTitle>
            <CardDescription>Add a top-level product or API surface.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3">
            <Input placeholder="service key, e.g. billing" value={serviceKey} onChange={(e) => setServiceKey(e.target.value)} />
            <Input placeholder="display name" value={serviceName} onChange={(e) => setServiceName(e.target.value)} />
            <Input placeholder="description" value={serviceDescription} onChange={(e) => setServiceDescription(e.target.value)} />
            <Button onClick={() => createService.mutate()} disabled={!serviceKey || !serviceName || createService.isPending}>
              {createService.isPending && <RefreshCw className="size-4 animate-spin" />}
              Create service
            </Button>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Create group</CardTitle>
            <CardDescription>Attach existing permission keys to a service group.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3">
            <Input placeholder="service key" value={groupServiceKey} onChange={(e) => setGroupServiceKey(e.target.value)} />
            <Input placeholder="group key, e.g. premium" value={groupKey} onChange={(e) => setGroupKey(e.target.value)} />
            <Input placeholder="group name" value={groupName} onChange={(e) => setGroupName(e.target.value)} />
            <Input placeholder="permissions, e.g. api:echo, tier:vip" value={groupPermissions} onChange={(e) => setGroupPermissions(e.target.value)} />
            <Button onClick={() => createGroup.mutate()} disabled={!groupServiceKey || !groupKey || !groupName || createGroup.isPending}>
              {createGroup.isPending && <RefreshCw className="size-4 animate-spin" />}
              Create group
            </Button>
          </CardContent>
        </Card>
      </div>
      <div className="grid gap-4">
        {(services.data?.services ?? []).map((service) => (
          <Card key={service.key}>
            <CardHeader>
              <CardTitle>{service.name}</CardTitle>
              <CardDescription>{service.description ?? service.key}</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3">
              {service.groups.map((group) => (
                <GroupEditor key={group.id} session={session} service={service} group={group} />
              ))}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}

function GroupEditor({
  session,
  service,
  group,
}: {
  session: Session
  service: Service
  group: Service['groups'][number]
}) {
  const queryClient = useQueryClient()
  const [name, setName] = useState(group.name)
  const [description, setDescription] = useState(group.description ?? '')
  const [status, setStatus] = useState(group.status)
  const [permissions, setPermissions] = useState(group.permissions.join(', '))
  const update = useMutation({
    mutationFn: () =>
      apiFetch<Service>(session, `/api/services/${service.key}/groups/${group.key}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          description: description || null,
          status,
          permission_keys: splitPermissionKeys(permissions),
        }),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['services'] }),
  })

  return (
    <div className="grid gap-2 rounded-md border px-3 py-3">
      <div className="grid grid-cols-[1fr_120px] gap-2">
        <Input value={name} onChange={(e) => setName(e.target.value)} />
        <select
          className="rounded-md border border-input bg-background px-3 text-sm"
          value={status}
          onChange={(event) => setStatus(event.target.value as 'active' | 'disabled')}
        >
          <option value="active">active</option>
          <option value="disabled">disabled</option>
        </select>
      </div>
      <Input value={description} placeholder="description" onChange={(e) => setDescription(e.target.value)} />
      <Input value={permissions} onChange={(e) => setPermissions(e.target.value)} />
      <div className="flex justify-between text-xs text-muted-foreground">
        <span>{service.key}/{group.key}</span>
        <Button size="sm" variant="outline" onClick={() => update.mutate()} disabled={update.isPending || !name}>
          {update.isPending && <RefreshCw className="size-4 animate-spin" />}
          Save
        </Button>
      </div>
    </div>
  )
}

function splitPermissionKeys(value: string): string[] {
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
}

function PageHeader({ title, description }: { title: string; description: string }) {
  return (
    <header>
      <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
      <p className="text-sm text-muted-foreground">{description}</p>
    </header>
  )
}

function Placeholder({ title, description }: { title: string; description: string }) {
  return (
    <div className="grid gap-5">
      <PageHeader title={title} description={description} />
      <Card>
        <CardContent className="py-10 text-sm text-muted-foreground">Not configured yet.</CardContent>
      </Card>
    </div>
  )
}

function CenteredState(props: {
  title: string
  description: string
  icon?: React.ReactNode
  action?: React.ReactNode
}) {
  return (
    <div className="flex min-h-svh items-center justify-center p-6">
      <Card className="w-full max-w-md">
        <CardHeader>
          <div className="mb-2 flex size-9 items-center justify-center rounded-md bg-muted text-muted-foreground">
            {props.icon ?? <ShieldAlert className="size-5" />}
          </div>
          <CardTitle>{props.title}</CardTitle>
          <CardDescription>{props.description}</CardDescription>
        </CardHeader>
        {props.action && <CardContent>{props.action}</CardContent>}
      </Card>
    </div>
  )
}
