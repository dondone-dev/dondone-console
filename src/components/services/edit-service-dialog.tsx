import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { RefreshCw } from 'lucide-react'
import { toast } from 'sonner'
import { apiFetch, type Service } from '@/lib/api'
import type { Session } from '@/lib/auth'
import { cn } from '@/lib/utils'
import { ServiceGroupsTab } from '@/components/services/service-groups-tab'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
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
import { Textarea } from '@/components/ui/textarea'

export function EditServiceDialog({
  session,
  service,
  open,
  onOpenChange,
}: {
  session: Session
  service: Service
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const [tab, setTab] = useState<'details' | 'groups'>('details')

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{service.name}</DialogTitle>
          <DialogDescription>
            <span className="font-mono">{service.key}</span>
          </DialogDescription>
        </DialogHeader>
        <div className="flex gap-1 border-b">
          <TabButton active={tab === 'details'} onClick={() => setTab('details')}>
            Details
          </TabButton>
          <TabButton active={tab === 'groups'} onClick={() => setTab('groups')}>
            Groups ({service.groups.length})
          </TabButton>
        </div>
        {tab === 'details' ? (
          <DetailsTab session={session} service={service} />
        ) : (
          <ServiceGroupsTab session={session} service={service} />
        )}
      </DialogContent>
    </Dialog>
  )
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      className={cn(
        'border-b-2 px-3 py-2 text-sm font-medium transition-colors',
        active
          ? 'border-primary text-foreground'
          : 'border-transparent text-muted-foreground hover:text-foreground'
      )}
      onClick={onClick}
    >
      {children}
    </button>
  )
}

function DetailsTab({ session, service }: { session: Session; service: Service }) {
  const queryClient = useQueryClient()
  const [name, setName] = useState(service.name)
  const [description, setDescription] = useState(service.description ?? '')
  const [status, setStatus] = useState(service.status)
  const [redirectUris, setRedirectUris] = useState(service.redirect_uris.join('\n'))

  const dirty =
    name !== service.name ||
    description !== (service.description ?? '') ||
    status !== service.status ||
    redirectUris !== service.redirect_uris.join('\n')

  const update = useMutation({
    mutationFn: () =>
      apiFetch<Service>(session, `/api/services/${service.key}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          description: description || null,
          status,
          redirect_uris: splitLines(redirectUris),
        }),
      }),
    onSuccess: () => {
      toast.success(`Service "${name}" saved`)
      void queryClient.invalidateQueries({ queryKey: ['services'] })
    },
    onError: (error) =>
      toast.error('Failed to save service', {
        description: error instanceof Error ? error.message : undefined,
      }),
  })

  return (
    <>
      <div className="grid gap-4">
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_140px]">
          <div className="grid gap-1.5">
            <Label htmlFor={`service-name-${service.key}`}>Name</Label>
            <Input
              id={`service-name-${service.key}`}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="grid gap-1.5">
            <Label>Status</Label>
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
          <Label htmlFor={`service-description-${service.key}`}>Description</Label>
          <Input
            id={`service-description-${service.key}`}
            placeholder="Optional"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor={`service-redirect-uris-${service.key}`}>Callback URLs</Label>
          <Textarea
            id={`service-redirect-uris-${service.key}`}
            className="font-mono"
            placeholder="One per line"
            value={redirectUris}
            onChange={(e) => setRedirectUris(e.target.value)}
          />
        </div>
      </div>
      <DialogFooter>
        <Button onClick={() => update.mutate()} disabled={update.isPending || !name || !dirty}>
          {update.isPending && <RefreshCw className="animate-spin" />}
          {dirty ? 'Save' : 'Saved'}
        </Button>
      </DialogFooter>
    </>
  )
}

function splitLines(value: string): string[] {
  const seen = new Set<string>()
  for (const line of value.split('\n')) {
    const trimmed = line.trim()
    if (trimmed) seen.add(trimmed)
  }
  return [...seen]
}
