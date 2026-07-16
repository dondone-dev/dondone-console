import { Link, useLocation, useParams, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft } from 'lucide-react'
import { apiFetch, type Service, type UserDetail } from '@/lib/api'
import { useConsole } from '@/lib/console-context'
import { DetailTabPanel, DetailTabs, type DetailTabItem } from '@/components/detail-tabs'
import { UserOverviewTab } from '@/components/users/user-overview-tab'
import { UserAccessTab } from '@/components/users/user-access-tab'
import { Badge, StatusDot } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'

type UserDetailTab = 'overview' | 'access'

const TAB_ITEMS: DetailTabItem<UserDetailTab>[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'access', label: 'Access' },
]

export function UserDetailPage() {
  const { userId } = useParams<{ userId: string }>()
  const { session } = useConsole()
  const location = useLocation()
  const [searchParams, setSearchParams] = useSearchParams()

  const fromState = location.state as { from?: unknown } | null
  const backTo =
    typeof fromState?.from === 'string' && fromState.from.startsWith('/users')
      ? fromState.from
      : '/users'

  const rawTab = searchParams.get('tab')
  const activeTab: UserDetailTab = rawTab === 'access' ? 'access' : 'overview'

  const detail = useQuery({
    queryKey: ['user-detail', userId],
    queryFn: () => apiFetch<UserDetail>(session, `/api/users/${userId}`),
    enabled: !!userId,
  })

  const services = useQuery({
    queryKey: ['services'],
    queryFn: () => apiFetch<{ services: Service[] }>(session, '/api/services'),
  })

  function handleTabChange(tab: UserDetailTab) {
    const next = new URLSearchParams(searchParams)
    if (tab === 'access') {
      next.set('tab', 'access')
    } else {
      next.delete('tab')
    }
    setSearchParams(next)
  }

  if (!userId) {
    return <NotFoundState backTo="/users" />
  }

  if (detail.isLoading) {
    return (
      <div className="grid gap-6">
        <BackLink to={backTo} />
        <HeaderSkeleton />
        <div className="grid gap-4">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-40 w-full" />
        </div>
      </div>
    )
  }

  if (detail.isError) {
    const status = (detail.error as { status?: number })?.status
    if (status === 404) {
      return <NotFoundState backTo={backTo} />
    }
    return (
      <div className="grid gap-6">
        <BackLink to={backTo} />
        <div className="grid gap-2">
          <h1 className="text-2xl font-bold">Failed to load user</h1>
          <p className="text-sm text-muted-foreground">
            The user details could not be loaded.
          </p>
          <div className="flex gap-2 pt-2">
            <Button variant="outline" size="sm" onClick={() => void detail.refetch()}>
              Retry
            </Button>
            <Button variant="ghost" size="sm" asChild>
              <Link to="/users">Back to users</Link>
            </Button>
          </div>
        </div>
      </div>
    )
  }

  const userData = detail.data!
  const { profile } = userData
  const initial = (profile.display_name ?? profile.email ?? '?').charAt(0).toUpperCase()
  const title = profile.display_name || profile.email || 'Unnamed user'
  const serviceList = services.data?.services ?? []

  return (
    <div className="grid gap-6">
      <BackLink to={backTo} />

      <div className="flex items-start gap-4">
        <div className="flex size-12 shrink-0 items-center justify-center rounded-full bg-primary/10 text-lg font-semibold text-primary">
          {initial}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h1 className="truncate text-2xl font-bold">{title}</h1>
            <Badge variant="outline" className="capitalize text-muted-foreground">
              <StatusDot active={profile.status === 'active'} />
              {profile.status}
            </Badge>
          </div>
          {profile.display_name && profile.email && (
            <p className="text-sm text-muted-foreground">{profile.email}</p>
          )}
          <p className="font-mono text-xs text-muted-foreground">{profile.id}</p>
          <p className="text-xs text-muted-foreground">
            Created {new Date(profile.created_at).toLocaleDateString()}
          </p>
        </div>
      </div>

      <DetailTabs
        items={TAB_ITEMS}
        value={activeTab}
        ariaLabel="User detail tabs"
        idPrefix="user-detail"
        onValueChange={handleTabChange}
      />

      <DetailTabPanel
        active={activeTab === 'overview'}
        id="user-detail-panel-overview"
        tabId="user-detail-tab-overview"
      >
        <UserOverviewTab
          detail={userData}
          services={serviceList}
          servicesError={services.isError}
          onRetryServices={() => void services.refetch()}
        />
      </DetailTabPanel>

      <DetailTabPanel
        active={activeTab === 'access'}
        id="user-detail-panel-access"
        tabId="user-detail-tab-access"
      >
        {services.isError ? (
          <ServiceErrorBlock onRetry={() => void services.refetch()} />
        ) : services.isLoading ? (
          <div className="grid gap-4">
            <Skeleton className="h-6 w-32" />
            <Skeleton className="h-40 w-full" />
          </div>
        ) : (
          <UserAccessTab
            session={session}
            userId={userId}
            detail={userData}
            services={serviceList}
          />
        )}
      </DetailTabPanel>
    </div>
  )
}

function BackLink({ to }: { to: string }) {
  return (
    <Link
      to={to}
      className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
    >
      <ArrowLeft className="size-4" />
      Users
    </Link>
  )
}

function HeaderSkeleton() {
  return (
    <div className="flex items-start gap-4">
      <Skeleton className="size-12 rounded-full" />
      <div className="grid gap-2">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-3 w-64" />
      </div>
    </div>
  )
}

function NotFoundState({ backTo }: { backTo: string }) {
  return (
    <div className="grid gap-6">
      <BackLink to={backTo} />
      <div className="grid gap-2">
        <h1 className="text-2xl font-bold">User not found</h1>
        <p className="text-sm text-muted-foreground">
          This user no longer exists or is unavailable.
        </p>
        <div className="pt-2">
          <Button variant="outline" size="sm" asChild>
            <Link to="/users">Back to users</Link>
          </Button>
        </div>
      </div>
    </div>
  )
}

function ServiceErrorBlock({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="rounded-lg border p-6 text-center text-sm text-muted-foreground">
      Failed to load services.
      <Button variant="link" size="sm" onClick={onRetry}>
        Retry
      </Button>
    </div>
  )
}
