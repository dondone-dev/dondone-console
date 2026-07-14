import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Boxes, Pencil, Plus, RefreshCw, Search } from 'lucide-react'
import { toast } from 'sonner'
import { apiFetch, type Service } from '@/lib/api'
import type { Session } from '@/lib/auth'
import { useConsole } from '@/lib/console-context'
import { paginate } from '@/lib/pagination'
import { filterServices, type ServiceStatusFilter } from '@/lib/service-filters'
import { EditServiceDialog } from '@/components/services/edit-service-dialog'
import { PageHeader } from '@/components/page-header'
import { EmptyState } from '@/components/empty-state'
import { Badge, StatusDot } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
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
import { Textarea } from '@/components/ui/textarea'

const PAGE_SIZE = 10

export function ServicesPage() {
  const { session } = useConsole()
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<ServiceStatusFilter>('all')
  const [page, setPage] = useState(1)
  const [editingKey, setEditingKey] = useState<string | null>(null)

  const services = useQuery({
    queryKey: ['services'],
    queryFn: () => apiFetch<{ services: Service[] }>(session, '/api/services'),
  })
  const list = services.data?.services ?? []
  const filtered = useMemo(() => filterServices(list, search, statusFilter), [list, search, statusFilter])
  const {
    items: pageItems,
    page: currentPage,
    pageCount,
    total,
  } = paginate(filtered, page, PAGE_SIZE)
  const editingService = editingKey ? list.find((service) => service.key === editingKey) ?? null : null

  function updateSearch(value: string) {
    setSearch(value)
    setPage(1)
  }

  function updateStatusFilter(value: ServiceStatusFilter) {
    setStatusFilter(value)
    setPage(1)
  }

  function clearFilters() {
    setSearch('')
    setStatusFilter('all')
    setPage(1)
  }

  return (
    <>
      <PageHeader
        title="Services"
        description="Review services, permission groups, and group permissions."
        action={<CreateServiceDialog session={session} />}
      />

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative max-w-xs flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-8"
            placeholder="Search by name, key, or description"
            value={search}
            onChange={(e) => updateSearch(e.target.value)}
          />
        </div>
        <Select value={statusFilter} onValueChange={(value) => updateStatusFilter(value as ServiceStatusFilter)}>
          <SelectTrigger className="w-36">
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
              <TableHead>Service</TableHead>
              <TableHead className="w-28">Status</TableHead>
              <TableHead className="w-28">Groups</TableHead>
              <TableHead className="w-32">Callback URLs</TableHead>
              <TableHead className="w-16" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {services.isLoading &&
              Array.from({ length: 5 }, (_, index) => (
                <TableRow key={index}>
                  <TableCell><Skeleton className="h-4 w-48" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-8" /></TableCell>
                </TableRow>
              ))}
            {services.isError && (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={5} className="py-8 text-center text-sm text-muted-foreground">
                  Failed to load services.
                  <Button variant="link" size="sm" onClick={() => void services.refetch()}>
                    Retry
                  </Button>
                </TableCell>
              </TableRow>
            )}
            {services.isSuccess && list.length === 0 && (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={5} className="p-0">
                  <EmptyState
                    className="rounded-none border-0"
                    icon={<Boxes />}
                    title="No services yet"
                    description="Create your first service to start defining permission groups."
                    action={<CreateServiceDialog session={session} />}
                  />
                </TableCell>
              </TableRow>
            )}
            {services.isSuccess && list.length > 0 && filtered.length === 0 && (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={5} className="py-8 text-center text-sm text-muted-foreground">
                  No services match your filters.
                  <Button variant="link" size="sm" onClick={clearFilters}>
                    Clear filters
                  </Button>
                </TableCell>
              </TableRow>
            )}
            {pageItems.map((service) => (
              <TableRow key={service.key}>
                <TableCell className="max-w-0">
                  <div className="grid gap-0.5">
                    <span className="flex items-center gap-2 font-medium">
                      {service.name}
                      <Badge variant="outline" className="font-mono font-normal text-muted-foreground">
                        {service.key}
                      </Badge>
                    </span>
                    <span className="truncate text-sm text-muted-foreground">
                      {service.description ?? 'No description.'}
                    </span>
                  </div>
                </TableCell>
                <TableCell>
                  <Badge variant="outline" className="capitalize text-muted-foreground">
                    <StatusDot active={service.status === 'active'} />
                    {service.status}
                  </Badge>
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {service.groups.length} {service.groups.length === 1 ? 'group' : 'groups'}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {service.redirect_uris.length} {service.redirect_uris.length === 1 ? 'URL' : 'URLs'}
                </TableCell>
                <TableCell>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Edit ${service.name}`}
                    onClick={() => setEditingKey(service.key)}
                  >
                    <Pencil />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      {total > 0 && (
        <Pagination
          page={currentPage}
          pageCount={pageCount}
          total={total}
          pageSize={PAGE_SIZE}
          onPageChange={setPage}
          itemLabel="services"
        />
      )}

      {editingService && (
        <EditServiceDialog
          key={editingService.key}
          session={session}
          service={editingService}
          open
          onOpenChange={(open) => {
            if (!open) setEditingKey(null)
          }}
        />
      )}
    </>
  )
}

function CreateServiceDialog({ session }: { session: Session }) {
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const [key, setKey] = useState('')
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [redirectUris, setRedirectUris] = useState('')

  const create = useMutation({
    mutationFn: () =>
      apiFetch<Service>(session, '/api/services', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          key,
          name,
          description: description || null,
          redirect_uris: splitLines(redirectUris),
        }),
      }),
    onSuccess: () => {
      toast.success(`Service "${name}" created`)
      setOpen(false)
      setKey('')
      setName('')
      setDescription('')
      setRedirectUris('')
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
          <div className="grid gap-2">
            <Label htmlFor="service-redirect-uris">Callback URLs</Label>
            <Textarea
              id="service-redirect-uris"
              className="font-mono"
              placeholder={'One per line, e.g.\nhttps://time.dondone.dev/auth/callback'}
              value={redirectUris}
              onChange={(e) => setRedirectUris(e.target.value)}
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

function splitLines(value: string): string[] {
  const seen = new Set<string>()
  for (const line of value.split('\n')) {
    const trimmed = line.trim()
    if (trimmed) seen.add(trimmed)
  }
  return [...seen]
}
