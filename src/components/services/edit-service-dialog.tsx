import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { RefreshCw, Shield } from 'lucide-react'
import { toast } from 'sonner'
import {
  apiFetch,
  authAdminFetch,
  type ActiveCapability,
  type CapabilityVersion,
  type DiffClassification,
  type Service,
} from '@/lib/api'
import type { Session } from '@/lib/auth'
import {
  approvalRequest,
  capabilityDiffRows,
  pendingScopeKeys,
  rejectionRequest,
} from '@/lib/capability-model'
import { cn } from '@/lib/utils'
import { ServiceGroupsTab } from '@/components/services/service-groups-tab'
import { Badge, StatusDot } from '@/components/ui/badge'
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
  const [tab, setTab] = useState<'details' | 'groups' | 'capabilities'>('details')

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
          <TabButton active={tab === 'capabilities'} onClick={() => setTab('capabilities')}>
            Capabilities
          </TabButton>
        </div>
        {tab === 'details' && <DetailsTab session={session} service={service} />}
        {tab === 'groups' && <ServiceGroupsTab session={session} service={service} />}
        {tab === 'capabilities' && <CapabilitiesTab session={session} service={service} />}
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
  const [resourceUri, setResourceUri] = useState(service.resource_uri ?? '')

  const dirty =
    name !== service.name ||
    description !== (service.description ?? '') ||
    status !== service.status ||
    redirectUris !== service.redirect_uris.join('\n') ||
    resourceUri !== (service.resource_uri ?? '')

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
          resource_uri: resourceUri.trim() || null,
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
          <Label htmlFor={`service-resource-uri-${service.key}`}>Protected resource URI</Label>
          <Input
            id={`service-resource-uri-${service.key}`}
            className="font-mono"
            placeholder="https://api.example.com"
            value={resourceUri}
            disabled={service.has_capability_versions}
            onChange={(e) => setResourceUri(e.target.value)}
          />
          {service.has_capability_versions && (
            <p className="text-xs text-muted-foreground">
              Locked because this service already has imported capability history.
            </p>
          )}
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

function CapabilitiesTab({ session, service }: { session: Session; service: Service }) {
  const queryClient = useQueryClient()
  const [reviewingVersion, setReviewingVersion] = useState<string | null>(null)
  const [rejectVersion, setRejectVersion] = useState<string | null>(null)
  const [rejectReason, setRejectReason] = useState('')

  const versions = useQuery({
    queryKey: ['capability-versions', service.key],
    queryFn: () =>
      apiFetch<{ versions: CapabilityVersion[] }>(
        session,
        `/api/services/${service.key}/capability-versions`
      ),
  })

  const capabilities = useQuery({
    queryKey: ['active-capabilities', service.key],
    queryFn: () =>
      apiFetch<{ capabilities: ActiveCapability[] }>(
        session,
        `/api/services/${service.key}/capabilities`
      ),
  })

  const sync = useMutation({
    mutationFn: () =>
      authAdminFetch<{ catalog_version: string }>(
        session,
        `/api/admin/services/${service.key}/capability-sync`,
        { method: 'POST' }
      ),
    onSuccess: (data) => {
      toast.success(`Synced version ${data.catalog_version}`)
      void queryClient.invalidateQueries({ queryKey: ['capability-versions', service.key] })
      void queryClient.invalidateQueries({ queryKey: ['services'] })
    },
    onError: (error) =>
      toast.error('Sync failed', {
        description: error instanceof Error ? error.message : undefined,
      }),
  })

  const reject = useMutation({
    mutationFn: ({ version, reason }: { version: string; reason: string }) =>
      authAdminFetch(
        session,
        `/api/admin/services/${service.key}/capability-versions/${encodeURIComponent(version)}/reject`,
        { method: 'POST', body: JSON.stringify(rejectionRequest(reason)) }
      ),
    onSuccess: () => {
      toast.success('Version rejected')
      setRejectVersion(null)
      setRejectReason('')
      void queryClient.invalidateQueries({ queryKey: ['capability-versions', service.key] })
    },
    onError: (error) =>
      toast.error('Rejection failed', {
        description: error instanceof Error ? error.message : undefined,
      }),
  })

  const versionList = versions.data?.versions ?? []
  const capList = capabilities.data?.capabilities ?? []

  return (
    <div className="grid gap-4">
      <div className="grid gap-2 text-sm">
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">Resource URI</span>
          <span className="font-mono text-xs">{service.resource_uri ?? 'Not configured'}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">Sync status</span>
          <Badge variant="outline" className="capitalize">
            <StatusDot active={service.capability_sync_status === 'active'} />
            {service.capability_sync_status}
          </Badge>
        </div>
        {service.active_capability_version && (
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Active version</span>
            <span className="font-mono text-xs">{service.active_capability_version}</span>
          </div>
        )}
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">Last sync</span>
          <span className="text-xs">
            {service.capability_last_synced_at
              ? new Date(service.capability_last_synced_at).toLocaleString()
              : 'Never'}
          </span>
        </div>
        {service.capability_last_error && (
          <div className="rounded border border-destructive/30 bg-destructive/5 p-2 text-xs text-destructive">
            {service.capability_last_error}
          </div>
        )}
      </div>

      {service.resource_uri && (
        <Button
          variant="outline"
          size="sm"
          className="justify-self-start"
          onClick={() => sync.mutate()}
          disabled={sync.isPending}
        >
          {sync.isPending && <RefreshCw className="animate-spin" />}
          Sync from service
        </Button>
      )}

      {versions.isLoading && <p className="text-xs text-muted-foreground">Loading catalog versions…</p>}
      {versions.isError && (
        <div className="flex items-center gap-2 text-xs text-destructive">
          Failed to load catalog versions.
          <Button size="sm" variant="outline" onClick={() => void versions.refetch()}>Retry</Button>
        </div>
      )}
      {versions.isSuccess && versionList.length === 0 && (
        <p className="text-xs text-muted-foreground">No imported catalog versions.</p>
      )}

      {versionList.length > 0 && (
        <div className="grid gap-2">
          <Label className="text-xs text-muted-foreground">Versions</Label>
          {versionList.map((v) => (
            <div key={v.id}>
              <div className="flex items-center justify-between rounded-lg border p-2.5 text-sm">
                <div className="grid gap-0.5">
                  <span className="font-mono text-xs">{v.catalog_version}</span>
                  <span className="text-xs text-muted-foreground">
                    {new Date(v.fetched_at).toLocaleString()} &middot; {v.import_status}
                  </span>
                </div>
                {v.import_status === 'pending_review' && (
                  <div className="flex gap-1">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        setReviewingVersion(
                          reviewingVersion === v.catalog_version ? null : v.catalog_version
                        )
                      }
                    >
                      {reviewingVersion === v.catalog_version ? 'Hide Diff' : 'Review'}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setRejectVersion(v.catalog_version)
                        setRejectReason('')
                      }}
                      disabled={reject.isPending}
                    >
                      Reject
                    </Button>
                  </div>
                )}
              </div>
              {v.import_status === 'pending_review' && reviewingVersion === v.catalog_version && (
                <div className="mt-1 rounded-lg border bg-muted/30 p-3">
                  <ManifestReview manifest={v.manifest} />
                  <DiffReviewPanel
                    session={session}
                    serviceKey={service.key}
                    catalogVersion={v.catalog_version}
                    onApproved={() => {
                      setReviewingVersion(null)
                      void queryClient.invalidateQueries({ queryKey: ['capability-versions', service.key] })
                      void queryClient.invalidateQueries({ queryKey: ['active-capabilities', service.key] })
                      void queryClient.invalidateQueries({ queryKey: ['services'] })
                    }}
                  />
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {rejectVersion && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3">
          <Label className="text-xs">Rejection reason for {rejectVersion}</Label>
          <Textarea
            className="mt-1.5 text-sm"
            placeholder="Explain why this version is rejected..."
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
          />
          <div className="mt-2 flex gap-1">
            <Button
              size="sm"
              variant="destructive"
              disabled={!rejectReason.trim() || reject.isPending}
              onClick={() => reject.mutate({ version: rejectVersion, reason: rejectReason.trim() })}
            >
              Confirm Reject
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setRejectVersion(null)}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      {capabilities.isLoading && <p className="text-xs text-muted-foreground">Loading active capabilities…</p>}
      {capabilities.isError && (
        <div className="flex items-center gap-2 text-xs text-destructive">
          Failed to load active capabilities.
          <Button size="sm" variant="outline" onClick={() => void capabilities.refetch()}>Retry</Button>
        </div>
      )}
      {capabilities.isSuccess && capList.length === 0 && (
        <p className="text-xs text-muted-foreground">The active catalog has no capabilities.</p>
      )}
      {capabilities.isSuccess && capList.length > 0 && (
        <div className="grid gap-2">
          <Label className="text-xs text-muted-foreground">Active capabilities</Label>
          {capList.map((cap) => (
            <div key={cap.key} className="flex items-center gap-2 rounded border p-2 text-sm">
              <Shield className="size-3.5 text-muted-foreground" />
              <span className="font-mono text-xs">{cap.key}</span>
              <span className="flex-1 truncate text-xs text-muted-foreground">{cap.description}</span>
              {cap.oauth_scope && (
                <Badge variant="outline" className="text-xs">scope</Badge>
              )}
            </div>
          ))}
        </div>
      )}

      {service.groups.some((group) => group.is_system && group.status === 'active') && (
        <div className="grid gap-2">
          <Label className="text-xs text-muted-foreground">Active built-in roles</Label>
          {service.groups.filter((group) => group.is_system && group.status === 'active').map((group) => (
            <div key={group.id} className="rounded border p-2 text-sm">
              <div className="flex items-center gap-2 font-medium">
                {group.name}<Badge variant="secondary">Service manifest</Badge>
              </div>
              <div className="font-mono text-xs text-muted-foreground">{group.key}: {group.permissions.join(', ')}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function DiffReviewPanel({
  session,
  serviceKey,
  catalogVersion,
  onApproved,
}: {
  session: Session
  serviceKey: string
  catalogVersion: string
  onApproved: () => void
}) {
  const [breakingReason, setBreakingReason] = useState('')

  const diff = useQuery({
    queryKey: ['diff-preview', serviceKey, catalogVersion],
    queryFn: () =>
      authAdminFetch<{ diff: DiffClassification }>(
        session,
        `/api/admin/services/${serviceKey}/capability-versions/${encodeURIComponent(catalogVersion)}/diff`
      ),
  })

  const approve = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      authAdminFetch(
        session,
        `/api/admin/services/${serviceKey}/capability-versions/${encodeURIComponent(catalogVersion)}/approve`,
        { method: 'POST', body: JSON.stringify(body) }
      ),
    onSuccess: () => {
      toast.success('Version approved')
      onApproved()
    },
    onError: (error) =>
      toast.error('Approval failed', {
        description: error instanceof Error ? error.message : undefined,
      }),
  })

  if (diff.isLoading) {
    return <div className="p-2 text-xs text-muted-foreground">Loading diff...</div>
  }
  if (diff.isError || !diff.data) {
    return (
      <div className="p-2 text-xs text-destructive">
        {diff.error instanceof Error ? diff.error.message : 'Failed to load diff'}
      </div>
    )
  }

  const d = diff.data.diff
  const isBreaking = d.change_type === 'breaking'
  const diffRows = capabilityDiffRows(d)
  const isEmpty = diffRows.length === 0

  function handleApprove() {
    approve.mutate(approvalRequest(d.change_type, breakingReason))
  }

  return (
    <div className="mt-3 border-t pt-3 text-sm">
      <div className="mb-2 flex items-center gap-2">
        <span className="text-xs font-medium">Change type:</span>
        <Badge
          variant={isBreaking ? 'destructive' : 'outline'}
          className="capitalize text-xs"
        >
          {d.change_type}
        </Badge>
      </div>

      {isEmpty ? (
        <p className="text-xs text-muted-foreground">No changes detected (initial version).</p>
      ) : (
        <div className="grid gap-1.5 text-xs">
          {diffRows.map((row) => (
            <DiffLine
              key={row.label}
              label={row.label}
              items={row.items}
              className={row.tone === 'add' ? 'text-green-600' : row.tone === 'remove' ? 'text-red-600' : row.tone === 'change' ? 'text-amber-600' : 'text-muted-foreground'}
            />
          ))}
        </div>
      )}

      {isBreaking && (
        <div className="mt-2">
          <Label className="text-xs text-destructive">
            Breaking change — provide a reason to approve:
          </Label>
          <Textarea
            className="mt-1 text-sm"
            placeholder="Explain why this breaking change is acceptable..."
            value={breakingReason}
            onChange={(e) => setBreakingReason(e.target.value)}
          />
        </div>
      )}

      <div className="mt-2">
        <Button
          size="sm"
          onClick={handleApprove}
          disabled={approve.isPending || (isBreaking && !breakingReason.trim())}
        >
          {approve.isPending && <RefreshCw className="animate-spin" />}
          {isBreaking ? 'Approve Breaking Change' : 'Approve'}
        </Button>
      </div>
    </div>
  )
}

function ManifestReview({ manifest }: { manifest: CapabilityVersion['manifest'] }) {
  const catalog = manifest.dondone_capabilities
  const scopes = pendingScopeKeys(manifest.scopes_supported)
  return (
    <div className="grid gap-3 text-xs">
      <div>
        <div className="mb-1 font-medium">Pending OAuth scopes</div>
        {scopes.length === 0 ? (
          <span className="text-muted-foreground">No OAuth scopes.</span>
        ) : (
          <div className="flex flex-wrap gap-1">
            {scopes.map((scope) => <Badge key={scope} variant="outline"><code>{scope}</code></Badge>)}
          </div>
        )}
      </div>
      <div>
        <div className="mb-1 font-medium">Pending permissions</div>
        {catalog.permissions.map((permission) => (
          <div key={permission.key} className="grid grid-cols-[minmax(0,160px)_1fr] gap-2 py-0.5">
            <code>{permission.key}</code><span className="text-muted-foreground">{permission.description}</span>
          </div>
        ))}
      </div>
      <div>
        <div className="mb-1 font-medium">Pending built-in roles</div>
        {catalog.roles.length === 0 && <span className="text-muted-foreground">No built-in roles.</span>}
        {catalog.roles.map((role) => (
          <div key={role.key} className="rounded border p-2">
            <div className="font-medium">{role.name} <code className="font-normal">{role.key}</code></div>
            {role.description && <div className="text-muted-foreground">{role.description}</div>}
            <div className="font-mono text-muted-foreground">{role.permission_keys.join(', ') || 'no permissions'}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

function DiffLine({ label, items, className }: { label: string; items: string[]; className?: string }) {
  return (
    <div className={className}>
      <span className="font-medium">{label}:</span>{' '}
      {items.map((item, i) => (
        <span key={item}>
          {i > 0 && ', '}
          <code className="rounded bg-muted px-1">{item}</code>
        </span>
      ))}
    </div>
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
