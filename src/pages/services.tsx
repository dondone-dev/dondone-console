import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Boxes, Plus, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'
import { apiFetch, type Service } from '@/lib/api'
import type { Session } from '@/lib/auth'
import { useConsole } from '@/lib/console-context'
import { PageHeader } from '@/components/page-header'
import { EmptyState } from '@/components/empty-state'
import { Badge, StatusDot } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'

export function ServicesPage() {
  const { session } = useConsole()
  const services = useQuery({
    queryKey: ['services'],
    queryFn: () => apiFetch<{ services: Service[] }>(session, '/api/services'),
  })
  const list = services.data?.services ?? []

  return (
    <>
      <PageHeader
        title="Services"
        description="Review services, permission groups, and group permissions."
        action={<CreateServiceDialog session={session} />}
      />

      {services.isLoading && (
        <div className="grid gap-4">
          <Skeleton className="h-40 w-full rounded-xl" />
          <Skeleton className="h-40 w-full rounded-xl" />
        </div>
      )}

      {services.isSuccess && list.length === 0 && (
        <EmptyState
          icon={<Boxes />}
          title="No services yet"
          description="Create your first service to start defining permission groups."
          action={<CreateServiceDialog session={session} />}
        />
      )}

      <div className="grid gap-4">
        {list.map((service) => (
          <Card key={service.key}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                {service.name}
                <Badge variant="outline" className="font-mono font-normal text-muted-foreground">
                  {service.key}
                </Badge>
              </CardTitle>
              <CardDescription>{service.description ?? 'No description.'}</CardDescription>
              <CardAction>
                <CreateGroupDialog session={session} service={service} />
              </CardAction>
            </CardHeader>
            <CardContent className="grid gap-3">
              {service.groups.length === 0 && (
                <p className="text-sm text-muted-foreground">No permission groups yet.</p>
              )}
              {service.groups.map((group) => (
                <GroupEditor key={group.id} session={session} service={service} group={group} />
              ))}
            </CardContent>
          </Card>
        ))}
      </div>
    </>
  )
}

function CreateServiceDialog({ session }: { session: Session }) {
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const [key, setKey] = useState('')
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')

  const create = useMutation({
    mutationFn: () =>
      apiFetch<Service>(session, '/api/services', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key, name, description: description || null }),
      }),
    onSuccess: () => {
      toast.success(`Service "${name}" created`)
      setOpen(false)
      setKey('')
      setName('')
      setDescription('')
      void queryClient.invalidateQueries({ queryKey: ['services'] })
    },
    onError: (error) =>
      toast.error('Failed to create service', {
        description: error instanceof Error ? error.message : undefined,
      }),
  })

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus />
          New service
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create service</DialogTitle>
          <DialogDescription>Add a top-level product or API surface.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="service-key">Key</Label>
            <Input
              id="service-key"
              placeholder="e.g. billing"
              value={key}
              onChange={(e) => setKey(e.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="service-name">Display name</Label>
            <Input
              id="service-name"
              placeholder="e.g. Billing"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="service-description">Description</Label>
            <Input
              id="service-description"
              placeholder="Optional"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={() => create.mutate()} disabled={!key || !name || create.isPending}>
            {create.isPending && <RefreshCw className="animate-spin" />}
            Create service
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function CreateGroupDialog({ session, service }: { session: Session; service: Service }) {
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const [key, setKey] = useState('')
  const [name, setName] = useState('')
  const [permissions, setPermissions] = useState('')

  const create = useMutation({
    mutationFn: () =>
      apiFetch<Service>(session, `/api/services/${service.key}/groups`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          key,
          name,
          description: null,
          permission_keys: splitPermissionKeys(permissions),
        }),
      }),
    onSuccess: () => {
      toast.success(`Group "${name}" created`)
      setOpen(false)
      setKey('')
      setName('')
      setPermissions('')
      void queryClient.invalidateQueries({ queryKey: ['services'] })
    },
    onError: (error) =>
      toast.error('Failed to create group', {
        description: error instanceof Error ? error.message : undefined,
      }),
  })

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Plus />
          Add group
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create group in {service.name}</DialogTitle>
          <DialogDescription>Attach permission keys to a new group.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="group-key">Key</Label>
            <Input
              id="group-key"
              placeholder="e.g. premium"
              value={key}
              onChange={(e) => setKey(e.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="group-name">Name</Label>
            <Input
              id="group-name"
              placeholder="e.g. Premium tier"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="group-permissions">Permissions</Label>
            <Input
              id="group-permissions"
              placeholder="Comma separated, e.g. api:echo, tier:vip"
              value={permissions}
              onChange={(e) => setPermissions(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={() => create.mutate()} disabled={!key || !name || create.isPending}>
            {create.isPending && <RefreshCw className="animate-spin" />}
            Create group
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
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

  const dirty =
    name !== group.name ||
    description !== (group.description ?? '') ||
    status !== group.status ||
    permissions !== group.permissions.join(', ')

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
    onSuccess: () => {
      toast.success(`Group "${name}" saved`)
      void queryClient.invalidateQueries({ queryKey: ['services'] })
    },
    onError: (error) =>
      toast.error('Failed to save group', {
        description: error instanceof Error ? error.message : undefined,
      }),
  })

  return (
    <div className="grid gap-3 rounded-lg border bg-muted/30 p-4 dark:bg-muted/10">
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 font-mono text-xs text-muted-foreground">
          <StatusDot active={status === 'active'} />
          {service.key}/{group.key}
        </span>
        <Button size="sm" variant="secondary" onClick={() => update.mutate()} disabled={update.isPending || !name || !dirty}>
          {update.isPending && <RefreshCw className="animate-spin" />}
          {dirty ? 'Save' : 'Saved'}
        </Button>
      </div>
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_140px]">
        <div className="grid gap-1.5">
          <Label htmlFor={`group-name-${group.id}`} className="text-xs text-muted-foreground">
            Name
          </Label>
          <Input id={`group-name-${group.id}`} value={name} onChange={(e) => setName(e.target.value)} />
        </div>
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
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor={`group-description-${group.id}`} className="text-xs text-muted-foreground">
          Description
        </Label>
        <Input
          id={`group-description-${group.id}`}
          placeholder="Optional"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor={`group-permissions-${group.id}`} className="text-xs text-muted-foreground">
          Permissions
        </Label>
        <Input
          id={`group-permissions-${group.id}`}
          className="font-mono"
          placeholder="Comma separated"
          value={permissions}
          onChange={(e) => setPermissions(e.target.value)}
        />
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
