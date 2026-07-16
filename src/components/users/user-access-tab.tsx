import { useMemo, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'
import { apiFetch, type Service, type UserDetail } from '@/lib/api'
import type { Session } from '@/lib/auth'
import type { UserAccessDraft } from '@/lib/user-access-model'
import {
  buildUserAccessDraft,
  replaceServiceGroup,
  resolveServiceAccess,
  serializeUserAccessDraft,
  unresolvedGrantIds,
  updateServiceExpiry,
} from '@/lib/user-access-model'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

export function UserAccessTab(props: {
  session: Session
  userId: string
  detail: UserDetail
  services: Service[]
}): React.ReactElement {
  const { session, userId, detail, services } = props
  const queryClient = useQueryClient()

  const serverDraft = useMemo(() => buildUserAccessDraft(detail.groups), [detail.groups])
  const [draft, setDraft] = useState<UserAccessDraft | null>(null)
  const selected = draft ?? serverDraft

  const unresolved = useMemo(() => unresolvedGrantIds(selected, services), [selected, services])
  const hasDraft = draft !== null
  const hasUnresolved = unresolved.length > 0

  const sortedServices = useMemo(() => {
    return [...services].sort((a, b) => {
      if (a.status !== b.status) return a.status === 'active' ? -1 : 1
      return a.name.localeCompare(b.name)
    })
  }, [services])

  const save = useMutation({
    mutationFn: () =>
      apiFetch<UserDetail>(session, `/api/users/${userId}/groups`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ grants: serializeUserAccessDraft(selected) }),
      }),
    onSuccess: (data) => {
      queryClient.setQueryData(['user-detail', userId], data)
      setDraft(null)
      toast.success('Service access updated')
    },
    onError: (error) =>
      toast.error('Failed to update service access', {
        description: error instanceof Error ? error.message : undefined,
      }),
  })

  function handleGroupChange(service: Service, groupId: string | null) {
    setDraft(replaceServiceGroup(draft ?? serverDraft, service, groupId))
  }

  function handleExpiryChange(groupId: string, value: string) {
    setDraft(updateServiceExpiry(draft ?? serverDraft, groupId, fromDateTimeLocal(value)))
  }

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold">Service access</h3>
          <p className="text-sm text-muted-foreground">
            Assign at most one Group per Service. Group permissions and usage policies are managed from Services.
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={!hasDraft}
            onClick={() => setDraft(null)}
          >
            Discard changes
          </Button>
          <Button
            size="sm"
            disabled={!hasDraft || save.isPending || hasUnresolved}
            onClick={() => save.mutate()}
          >
            {save.isPending && <RefreshCw className="mr-1 size-3 animate-spin" />}
            Save changes
          </Button>
        </div>
      </div>

      {hasUnresolved && (
        <Card className="border-destructive/50 bg-destructive/5">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm text-destructive">
              <AlertTriangle className="size-4" />
              Unresolved access assignment
            </CardTitle>
            <CardDescription>
              One or more assigned Groups are missing from the current Service catalog. Saving is disabled to avoid removing them.
            </CardDescription>
          </CardHeader>
        </Card>
      )}

      {/* Desktop table */}
      <Card className="hidden overflow-hidden py-0 md:block">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>Service</TableHead>
              <TableHead>Group</TableHead>
              <TableHead>Effective permissions</TableHead>
              <TableHead className="w-48">Expires</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortedServices.map((svc) => (
              <ServiceRow
                key={svc.key}
                service={svc}
                selected={selected}
                onGroupChange={handleGroupChange}
                onExpiryChange={handleExpiryChange}
              />
            ))}
          </TableBody>
        </Table>
      </Card>

      {/* Mobile stacked */}
      <div className="grid gap-3 md:hidden">
        {sortedServices.map((svc) => (
          <ServiceCard
            key={svc.key}
            service={svc}
            selected={selected}
            onGroupChange={handleGroupChange}
            onExpiryChange={handleExpiryChange}
          />
        ))}
      </div>
    </div>
  )
}

function ServiceRow(props: {
  service: Service
  selected: UserAccessDraft
  onGroupChange: (service: Service, groupId: string | null) => void
  onExpiryChange: (groupId: string, value: string) => void
}) {
  const { service, selected, onGroupChange, onExpiryChange } = props
  const resolved = resolveServiceAccess(service, selected)
  const selectedGroup = service.groups.find((g) => g.id === resolved.groupId)
  const permissions = selectedGroup?.permissions ?? []

  return (
    <TableRow>
      <TableCell>
        <div className="font-medium">{service.name}</div>
        <div className="font-mono text-xs text-muted-foreground">{service.key}</div>
        {service.status === 'disabled' && (
          <Badge variant="outline" className="mt-1 text-muted-foreground">Disabled</Badge>
        )}
      </TableCell>
      <TableCell>
        <GroupSelect
          service={service}
          selected={selected}
          onChange={onGroupChange}
        />
      </TableCell>
      <TableCell>
        {permissions.length === 0 ? (
          <span className="text-xs text-muted-foreground">No permissions</span>
        ) : (
          <div className="flex flex-wrap gap-1">
            {[...permissions].sort().map((p) => (
              <Badge key={p} variant="secondary" className="font-mono text-[11px]">{p}</Badge>
            ))}
          </div>
        )}
      </TableCell>
      <TableCell>
        <ExpiryInput
          groupId={resolved.groupId}
          expiresAt={resolved.expiresAt}
          serviceName={service.name}
          onExpiryChange={onExpiryChange}
        />
      </TableCell>
    </TableRow>
  )
}

function ServiceCard(props: {
  service: Service
  selected: UserAccessDraft
  onGroupChange: (service: Service, groupId: string | null) => void
  onExpiryChange: (groupId: string, value: string) => void
}) {
  const { service, selected, onGroupChange, onExpiryChange } = props
  const resolved = resolveServiceAccess(service, selected)
  const selectedGroup = service.groups.find((g) => g.id === resolved.groupId)
  const permissions = selectedGroup?.permissions ?? []

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm">
          {service.name}
          {service.status === 'disabled' && (
            <Badge variant="outline" className="ml-2 text-muted-foreground">Disabled</Badge>
          )}
        </CardTitle>
        <CardDescription className="font-mono text-xs">{service.key}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3">
        <div className="grid gap-1">
          <label className="text-xs font-medium text-muted-foreground">Group</label>
          <GroupSelect
            service={service}
            selected={selected}
            onChange={onGroupChange}
          />
        </div>
        <div className="grid gap-1">
          <label className="text-xs font-medium text-muted-foreground">Effective permissions</label>
          {permissions.length === 0 ? (
            <span className="text-xs text-muted-foreground">No permissions</span>
          ) : (
            <div className="flex flex-wrap gap-1">
              {[...permissions].sort().map((p) => (
                <Badge key={p} variant="secondary" className="font-mono text-[11px]">{p}</Badge>
              ))}
            </div>
          )}
        </div>
        <div className="grid gap-1">
          <label className="text-xs font-medium text-muted-foreground">Expires</label>
          <ExpiryInput
            groupId={resolved.groupId}
            expiresAt={resolved.expiresAt}
            serviceName={service.name}
            onExpiryChange={onExpiryChange}
          />
        </div>
      </CardContent>
    </Card>
  )
}

function GroupSelect(props: {
  service: Service
  selected: UserAccessDraft
  onChange: (service: Service, groupId: string | null) => void
}) {
  const { service, selected, onChange } = props
  const resolved = resolveServiceAccess(service, selected)
  const activeGroups = service.groups
    .filter((g) => g.status === 'active')
    .sort((a, b) => a.name.localeCompare(b.name))
  const disabledAssigned = service.groups.filter(
    (g) => g.status === 'disabled' && selected.has(g.id)
  ).sort((a, b) => a.name.localeCompare(b.name))

  return (
    <Select
      value={resolved.groupId ?? '__none__'}
      onValueChange={(v) => onChange(service, v === '__none__' ? null : v)}
    >
      <SelectTrigger aria-label={`Group for ${service.name}`}>
        <SelectValue placeholder="No access" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="__none__">No access</SelectItem>
        {activeGroups.map((g) => (
          <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>
        ))}
        {disabledAssigned.map((g) => (
          <SelectItem key={g.id} value={g.id} disabled>
            {g.name} (disabled)
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

function ExpiryInput(props: {
  groupId: string | null
  expiresAt: string | null
  serviceName: string
  onExpiryChange: (groupId: string, value: string) => void
}) {
  const { groupId, expiresAt, serviceName, onExpiryChange } = props
  const [mountMs] = useState(Date.now)
  const isExpired = expiresAt ? Date.parse(expiresAt) <= mountMs : false

  if (!groupId) {
    return <Input type="datetime-local" disabled value="" aria-label={`Expiry for ${serviceName}`} />
  }

  return (
    <div className="grid gap-1">
      <Input
        type="datetime-local"
        value={toDateTimeLocal(expiresAt)}
        onChange={(e) => onExpiryChange(groupId, e.target.value)}
        aria-label={`Expiry for ${serviceName}`}
      />
      {isExpired && (
        <Badge variant="outline" className="w-fit text-destructive">Expired</Badge>
      )}
    </div>
  )
}

function toDateTimeLocal(value: string | null): string {
  if (!value) return ''
  const date = new Date(value)
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
  return local.toISOString().slice(0, 16)
}

function fromDateTimeLocal(value: string): string | null {
  if (!value) return null
  return new Date(value).toISOString()
}
