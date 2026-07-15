import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'
import { apiFetch, type ActiveCapability, type Service } from '@/lib/api'
import { capabilitySelectionState } from '@/lib/capability-model'
import type { Session } from '@/lib/auth'
import { Badge, StatusDot } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

type Group = Service['groups'][number]

export function ServiceGroupsTab({ session, service }: { session: Session; service: Service }) {
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)

  return (
    <div className="grid gap-3">
      {service.groups.length === 0 && !adding && (
        <p className="text-sm text-muted-foreground">No permission groups yet.</p>
      )}
      {service.groups.map((group) =>
        editingGroupId === group.id ? (
          <GroupForm
            key={group.id}
            session={session}
            service={service}
            group={group}
            onDone={() => setEditingGroupId(null)}
          />
        ) : (
          <GroupSummaryRow
            key={group.id}
            group={group}
            onEdit={group.is_system ? undefined : () => setEditingGroupId(group.id)}
          />
        )
      )}
      {adding ? (
        <GroupForm session={session} service={service} onDone={() => setAdding(false)} />
      ) : (
        <Button
          variant="outline"
          size="sm"
          className="justify-self-start"
          onClick={() => setAdding(true)}
        >
          <Plus />
          Add group
        </Button>
      )}
    </div>
  )
}

function GroupSummaryRow({ group, onEdit }: { group: Group; onEdit?: () => void }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border p-3">
      <div className="grid gap-0.5 text-sm leading-tight">
        <span className="flex items-center gap-1.5 font-medium">
          <StatusDot active={group.status === 'active'} />
          {group.name}
          <Badge variant="outline" className="font-mono font-normal text-muted-foreground">
            {group.key}
          </Badge>
          {group.is_system && <Badge variant="secondary">Service manifest</Badge>}
        </span>
        <span className="font-mono text-xs text-muted-foreground">
          {group.permissions.join(', ') || 'no permissions'}
        </span>
      </div>
      {onEdit && <Button size="sm" variant="ghost" onClick={onEdit}>Edit</Button>}
    </div>
  )
}

function GroupForm({
  session,
  service,
  group,
  onDone,
}: {
  session: Session
  service: Service
  group?: Group
  onDone: () => void
}) {
  const queryClient = useQueryClient()
  const [key, setKey] = useState(group?.key ?? '')
  const [name, setName] = useState(group?.name ?? '')
  const [description, setDescription] = useState(group?.description ?? '')
  const [status, setStatus] = useState<'active' | 'disabled'>(group?.status ?? 'active')
  const [selectedPermissions, setSelectedPermissions] = useState<Set<string>>(
    new Set(group?.permissions ?? [])
  )

  const activeCaps = useQuery({
    queryKey: ['active-capabilities', service.key],
    queryFn: () =>
      apiFetch<{ capabilities: ActiveCapability[] }>(
        session,
        `/api/services/${service.key}/capabilities`
      ),
  })

  const capList = activeCaps.data?.capabilities ?? []
  const queryStatus = activeCaps.isLoading ? 'loading' : activeCaps.isError ? 'error' : 'success'
  const selection = capabilitySelectionState(
    queryStatus,
    capList.map((cap) => cap.key),
    [...selectedPermissions]
  )

  function togglePermission(permKey: string) {
    setSelectedPermissions((prev) => {
      const next = new Set(prev)
      if (next.has(permKey)) {
        next.delete(permKey)
      } else {
        next.add(permKey)
      }
      return next
    })
  }

  const save = useMutation({
    mutationFn: () => {
      const permKeys = [...selectedPermissions]
      return group
        ? apiFetch<Service>(session, `/api/services/${service.key}/groups/${group.key}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              name,
              description: description || null,
              status,
              permission_keys: permKeys,
            }),
          })
        : apiFetch<Service>(session, `/api/services/${service.key}/groups`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              key,
              name,
              description: description || null,
              permission_keys: permKeys,
            }),
          })
    },
    onSuccess: () => {
      toast.success(`Group "${name}" ${group ? 'saved' : 'created'}`)
      void queryClient.invalidateQueries({ queryKey: ['services'] })
      onDone()
    },
    onError: (error) =>
      toast.error(`Failed to ${group ? 'save' : 'create'} group`, {
        description: error instanceof Error ? error.message : undefined,
      }),
  })

  return (
    <div className="grid gap-3 rounded-lg border bg-muted/30 p-4 dark:bg-muted/10">
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_140px]">
        <div className="grid gap-1.5">
          <Label htmlFor={`group-name-${group?.id ?? 'new'}`} className="text-xs text-muted-foreground">
            Name
          </Label>
          <Input
            id={`group-name-${group?.id ?? 'new'}`}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        {group ? (
          <div className="grid gap-1.5">
            <Label className="text-xs text-muted-foreground">Status</Label>
            <Select value={status} onValueChange={(value) => setStatus(value as 'active' | 'disabled')}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="disabled">Disabled</SelectItem>
              </SelectContent>
            </Select>
          </div>
        ) : (
          <div className="grid gap-1.5">
            <Label htmlFor="group-key-new" className="text-xs text-muted-foreground">
              Key
            </Label>
            <Input
              id="group-key-new"
              placeholder="e.g. premium"
              value={key}
              onChange={(e) => setKey(e.target.value)}
            />
          </div>
        )}
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor={`group-description-${group?.id ?? 'new'}`} className="text-xs text-muted-foreground">
          Description
        </Label>
        <Input
          id={`group-description-${group?.id ?? 'new'}`}
          placeholder="Optional"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </div>
      <div className="grid gap-1.5">
        <Label className="text-xs text-muted-foreground">Permissions</Label>
        {selection.kind === 'loading' && <p className="text-xs text-muted-foreground">Loading active catalog…</p>}
        {selection.kind === 'error' && (
          <div className="flex items-center gap-2 text-xs text-destructive">
            Failed to load the active catalog.
            <Button size="sm" variant="outline" onClick={() => void activeCaps.refetch()}>Retry</Button>
          </div>
        )}
        {selection.kind === 'ready' && (
          <div className="grid gap-1.5 rounded border p-2">
            {capList.map((cap) => (
              <label
                key={cap.key}
                className="flex cursor-pointer items-center gap-2 rounded p-1 text-sm hover:bg-muted/50"
              >
                <Checkbox
                  checked={selectedPermissions.has(cap.key)}
                  onCheckedChange={() => togglePermission(cap.key)}
                />
                <span className="font-mono text-xs">{cap.key}</span>
                <span className="flex-1 truncate text-xs text-muted-foreground">{cap.description}</span>
              </label>
            ))}
          </div>
        )}
        {selection.kind === 'empty' && (
          <p className="text-xs text-muted-foreground">
            The loaded active capability catalog is empty. Sync and approve a catalog first.
          </p>
        )}
        {selection.unavailable.length > 0 && (
          <div className="grid gap-1 rounded border border-destructive/30 p-2 text-xs text-destructive">
            <span>These permissions are no longer in the active catalog. Remove them before saving:</span>
            {selection.unavailable.map((key) => (
              <label key={key} className="flex items-center gap-2">
                <Checkbox checked onCheckedChange={() => togglePermission(key)} />
                <span className="font-mono">{key}</span>
              </label>
            ))}
          </div>
        )}
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="outline" size="sm" onClick={onDone}>
          Cancel
        </Button>
        <Button size="sm" onClick={() => save.mutate()} disabled={!name || (!group && !key) || !selection.canSave || save.isPending}>
          {save.isPending && <RefreshCw className="animate-spin" />}
          {group ? 'Save' : 'Create group'}
        </Button>
      </div>
    </div>
  )
}
