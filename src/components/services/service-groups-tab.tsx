import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'
import { apiFetch, type Service } from '@/lib/api'
import type { Session } from '@/lib/auth'
import { Badge, StatusDot } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
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
          <GroupSummaryRow key={group.id} group={group} onEdit={() => setEditingGroupId(group.id)} />
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

function GroupSummaryRow({ group, onEdit }: { group: Group; onEdit: () => void }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border p-3">
      <div className="grid gap-0.5 text-sm leading-tight">
        <span className="flex items-center gap-1.5 font-medium">
          <StatusDot active={group.status === 'active'} />
          {group.name}
          <Badge variant="outline" className="font-mono font-normal text-muted-foreground">
            {group.key}
          </Badge>
        </span>
        <span className="font-mono text-xs text-muted-foreground">
          {group.permissions.join(', ') || 'no permissions'}
        </span>
      </div>
      <Button size="sm" variant="ghost" onClick={onEdit}>
        Edit
      </Button>
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
  const [permissions, setPermissions] = useState(group?.permissions.join(', ') ?? '')

  const save = useMutation({
    mutationFn: () =>
      group
        ? apiFetch<Service>(session, `/api/services/${service.key}/groups/${group.key}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              name,
              description: description || null,
              status,
              permission_keys: splitPermissionKeys(permissions),
            }),
          })
        : apiFetch<Service>(session, `/api/services/${service.key}/groups`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              key,
              name,
              description: description || null,
              permission_keys: splitPermissionKeys(permissions),
            }),
          }),
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
        <Label htmlFor={`group-permissions-${group?.id ?? 'new'}`} className="text-xs text-muted-foreground">
          Permissions
        </Label>
        <Input
          id={`group-permissions-${group?.id ?? 'new'}`}
          className="font-mono"
          placeholder="Comma separated"
          value={permissions}
          onChange={(e) => setPermissions(e.target.value)}
        />
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="outline" size="sm" onClick={onDone}>
          Cancel
        </Button>
        <Button size="sm" onClick={() => save.mutate()} disabled={!name || (!group && !key) || save.isPending}>
          {save.isPending && <RefreshCw className="animate-spin" />}
          {group ? 'Save' : 'Create group'}
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
