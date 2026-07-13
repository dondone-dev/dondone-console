# Services Page List Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the flat, always-expanded card list on the Services page with a searchable, filterable, paginated table, moving service and permission-group editing into a modal.

**Architecture:** Extract two pure, unit-testable helpers (`filterServices`, `paginate`) that the page composes with `@tanstack/react-query`'s existing `['services']` query. The page renders a `Table` (mirroring the existing pattern in `src/pages/users.tsx`) with a search box, a status `Select`, and a new `Pagination` UI component. Each row's Edit button opens a new `EditServiceDialog` (built from two new files under `src/components/services/`) that reuses the existing `Dialog` primitive with two hand-rolled tabs — Details and Groups — replacing today's always-visible inline `ServiceEditor`/`GroupEditor`/`CreateGroupDialog`.

**Tech Stack:** React 19, TypeScript, `@tanstack/react-query`, Radix UI primitives (`@radix-ui/react-dialog`, `-select`), Tailwind CSS v4, `lucide-react` icons, `sonner` toasts, Vitest.

## Global Constraints

- No backend/API changes. `GET /api/services` keeps returning the full, unpaginated list; all filtering, search, and pagination happen client-side.
- No new npm dependencies — the two-tab modal is built with plain `useState` toggle buttons, not a new Tabs primitive.
- Fixed page size of 10, no page-size selector, no numbered page buttons (Prev/Next only).
- No optimistic UI — mutations keep the exact existing behavior: `sonner` toast on success/error, `queryClient.invalidateQueries({ queryKey: ['services'] })` on success.
- `POST /api/services` and its `CreateServiceDialog` UI are unchanged.

---

### Task 1: `filterServices` helper

**Files:**
- Create: `src/lib/service-filters.ts`
- Test: `src/lib/service-filters.test.ts`

**Interfaces:**
- Consumes: `Service` type from `src/lib/api.ts` (`key: string; name: string; description: string | null; status: 'active' | 'disabled'; redirect_uris: string[]; groups: PermissionGroup[]`).
- Produces: `filterServices(services: Service[], search: string, statusFilter: ServiceStatusFilter): Service[]` and `type ServiceStatusFilter = 'all' | 'active' | 'disabled'`, both exported from `src/lib/service-filters.ts`. Task 6 imports both.

- [ ] **Step 1: Write the failing test**

Create `src/lib/service-filters.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { filterServices } from './service-filters'
import type { Service } from './api'

function makeService(overrides: Partial<Service> = {}): Service {
  return {
    key: 'billing',
    name: 'Billing',
    description: 'Handles invoices',
    status: 'active',
    redirect_uris: [],
    groups: [],
    ...overrides,
  }
}

describe('filterServices', () => {
  it('returns all services when search is empty and filter is all', () => {
    const services = [makeService(), makeService({ key: 'auth', name: 'Auth' })]
    expect(filterServices(services, '', 'all')).toHaveLength(2)
  })

  it('matches on name, case-insensitively', () => {
    const services = [makeService({ name: 'Billing' })]
    expect(filterServices(services, 'bill', 'all')).toHaveLength(1)
    expect(filterServices(services, 'nomatch', 'all')).toHaveLength(0)
  })

  it('matches on key', () => {
    const services = [makeService({ key: 'billing-v2' })]
    expect(filterServices(services, 'v2', 'all')).toHaveLength(1)
  })

  it('matches on description', () => {
    const services = [makeService({ description: 'Handles invoices' })]
    expect(filterServices(services, 'invoices', 'all')).toHaveLength(1)
  })

  it('treats a null description as no match rather than throwing', () => {
    const services = [makeService({ description: null })]
    expect(() => filterServices(services, 'anything', 'all')).not.toThrow()
    expect(filterServices(services, 'anything', 'all')).toHaveLength(0)
  })

  it('filters by status', () => {
    const services = [
      makeService({ key: 'a', status: 'active' }),
      makeService({ key: 'b', status: 'disabled' }),
    ]
    expect(filterServices(services, '', 'active')).toHaveLength(1)
    expect(filterServices(services, '', 'disabled')).toHaveLength(1)
    expect(filterServices(services, '', 'all')).toHaveLength(2)
  })

  it('applies both search and status filter together', () => {
    const services = [
      makeService({ key: 'a', name: 'Billing', status: 'active' }),
      makeService({ key: 'b', name: 'Billing', status: 'disabled' }),
    ]
    expect(filterServices(services, 'billing', 'active')).toHaveLength(1)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- service-filters`
Expected: FAIL — `Cannot find module './service-filters'` (the file doesn't exist yet).

- [ ] **Step 3: Write minimal implementation**

Create `src/lib/service-filters.ts`:

```ts
import type { Service } from './api'

export type ServiceStatusFilter = 'all' | 'active' | 'disabled'

export function filterServices(
  services: Service[],
  search: string,
  statusFilter: ServiceStatusFilter
): Service[] {
  const term = search.trim().toLowerCase()
  return services.filter((service) => {
    if (statusFilter !== 'all' && service.status !== statusFilter) return false
    if (!term) return true
    return (
      service.name.toLowerCase().includes(term) ||
      service.key.toLowerCase().includes(term) ||
      (service.description ?? '').toLowerCase().includes(term)
    )
  })
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test -- service-filters`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/service-filters.ts src/lib/service-filters.test.ts
git commit -m "feat: add filterServices helper for the Services page"
```

---

### Task 2: `paginate` helper

**Files:**
- Create: `src/lib/pagination.ts`
- Test: `src/lib/pagination.test.ts`

**Interfaces:**
- Consumes: nothing project-specific — generic over `T[]`.
- Produces: `interface PageResult<T> { items: T[]; page: number; pageCount: number; total: number }` and `paginate<T>(items: T[], page: number, pageSize: number): PageResult<T>`, both exported from `src/lib/pagination.ts`. Task 3 (`Pagination` UI component props) and Task 6 (`ServicesPage`) both rely on the field names `page`, `pageCount`, `total` exactly as declared here.

- [ ] **Step 1: Write the failing test**

Create `src/lib/pagination.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { paginate } from './pagination'

describe('paginate', () => {
  it('slices the first page', () => {
    const result = paginate([1, 2, 3, 4, 5], 1, 2)
    expect(result).toEqual({ items: [1, 2], page: 1, pageCount: 3, total: 5 })
  })

  it('slices the last, partial page', () => {
    const result = paginate([1, 2, 3, 4, 5], 3, 2)
    expect(result).toEqual({ items: [5], page: 3, pageCount: 3, total: 5 })
  })

  it('clamps a page number above pageCount down to the last page', () => {
    const result = paginate([1, 2, 3], 99, 2)
    expect(result.page).toBe(2)
    expect(result.items).toEqual([3])
  })

  it('clamps a page number below 1 up to 1', () => {
    const result = paginate([1, 2, 3], 0, 2)
    expect(result.page).toBe(1)
  })

  it('returns pageCount 1 and an empty items array for an empty list', () => {
    const result = paginate([], 1, 10)
    expect(result).toEqual({ items: [], page: 1, pageCount: 1, total: 0 })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- pagination`
Expected: FAIL — `Cannot find module './pagination'`.

- [ ] **Step 3: Write minimal implementation**

Create `src/lib/pagination.ts`:

```ts
export interface PageResult<T> {
  items: T[]
  page: number
  pageCount: number
  total: number
}

export function paginate<T>(items: T[], page: number, pageSize: number): PageResult<T> {
  const total = items.length
  const pageCount = Math.max(1, Math.ceil(total / pageSize))
  const clampedPage = Math.min(Math.max(1, page), pageCount)
  const start = (clampedPage - 1) * pageSize
  return {
    items: items.slice(start, start + pageSize),
    page: clampedPage,
    pageCount,
    total,
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test -- pagination`
Expected: PASS (5 tests). Note this also re-runs `service-filters.test.ts` since both match the `pagination`/`service-filters` glob loosely — that's fine, total should now be 12 passing tests across both new files plus the 2 pre-existing files (30 tests), i.e. `pnpm test` run in full reports 42 passing tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/pagination.ts src/lib/pagination.test.ts
git commit -m "feat: add generic paginate helper for the Services page"
```

---

### Task 3: `Pagination` UI component

**Files:**
- Create: `src/components/ui/pagination.tsx`

**Interfaces:**
- Consumes: nothing from earlier tasks (plain props, no import of `PageResult`).
- Produces: `Pagination({ page, pageCount, total, pageSize, onPageChange, itemLabel }: { page: number; pageCount: number; total: number; pageSize: number; onPageChange: (page: number) => void; itemLabel?: string })` exported from `src/components/ui/pagination.tsx`. Task 6 imports this and passes it the fields straight from `paginate()`'s return value (`page`, `pageCount`, `total`) plus the constant `PAGE_SIZE`.

This is a presentational component with no logic worth unit-testing (matches the rest of `src/components/ui/`, none of which has tests) — it's exercised in Task 7's manual verification.

- [ ] **Step 1: Write the component**

Create `src/components/ui/pagination.tsx`:

```tsx
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'

export function Pagination({
  page,
  pageCount,
  total,
  pageSize,
  onPageChange,
  itemLabel = 'items',
}: {
  page: number
  pageCount: number
  total: number
  pageSize: number
  onPageChange: (page: number) => void
  itemLabel?: string
}) {
  const start = total === 0 ? 0 : (page - 1) * pageSize + 1
  const end = Math.min(page * pageSize, total)

  return (
    <div className="flex items-center justify-between gap-3 px-2 py-1">
      <p className="text-sm text-muted-foreground">
        Showing {start}-{end} of {total} {itemLabel}
      </p>
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1}
        >
          <ChevronLeft />
          Previous
        </Button>
        <span className="text-sm text-muted-foreground">
          Page {page} of {pageCount}
        </span>
        <Button
          variant="outline"
          size="sm"
          onClick={() => onPageChange(page + 1)}
          disabled={page >= pageCount}
        >
          Next
          <ChevronRight />
        </Button>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Type-check**

Run: `pnpm build`
Expected: succeeds with no new TypeScript errors (this component isn't imported anywhere yet, so it only needs to compile standalone).

- [ ] **Step 3: Commit**

```bash
git add src/components/ui/pagination.tsx
git commit -m "feat: add Pagination UI component"
```

---

### Task 4: `ServiceGroupsTab` component

**Files:**
- Create: `src/components/services/service-groups-tab.tsx`

**Interfaces:**
- Consumes: `Service`, `apiFetch` from `src/lib/api.ts`; `Session` from `src/lib/auth.ts`. Existing endpoints only: `POST /api/services/:key/groups`, `PUT /api/services/:key/groups/:key`.
- Produces: `ServiceGroupsTab({ session, service }: { session: Session; service: Service })` exported from `src/components/services/service-groups-tab.tsx`. Task 5 (`EditServiceDialog`) renders this as the Groups tab's content.

This replaces today's always-visible `GroupEditor` list plus the separate `CreateGroupDialog` (currently in `src/pages/services.tsx:308-497`) with one inline list: each group row shows a summary with an "Edit" toggle that expands the same fields, and an "Add group" toggle at the bottom expands a blank creation form. No dialog-in-dialog.

- [ ] **Step 1: Write the component**

Create `src/components/services/service-groups-tab.tsx`:

```tsx
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
```

- [ ] **Step 2: Type-check**

Run: `pnpm build`
Expected: succeeds with no new TypeScript errors (standalone, not imported yet).

- [ ] **Step 3: Commit**

```bash
git add src/components/services/service-groups-tab.tsx
git commit -m "feat: add ServiceGroupsTab for inline group management"
```

---

### Task 5: `EditServiceDialog` component

**Files:**
- Create: `src/components/services/edit-service-dialog.tsx`

**Interfaces:**
- Consumes: `Service`, `apiFetch` from `src/lib/api.ts`; `Session` from `src/lib/auth.ts`; `cn` from `src/lib/utils.ts`; `ServiceGroupsTab` from `src/components/services/service-groups-tab.tsx` (Task 4). Existing endpoint only: `PUT /api/services/:key`.
- Produces: `EditServiceDialog({ session, service, open, onOpenChange }: { session: Session; service: Service; open: boolean; onOpenChange: (open: boolean) => void })` exported from `src/components/services/edit-service-dialog.tsx`. Task 6 (`ServicesPage`) renders this when a row's Edit button is clicked.

This replaces today's always-visible `ServiceEditor` (currently `src/pages/services.tsx:205-306`) with the same fields and mutation, moved into the dialog's Details tab. Deliberately drops the `useEffect` that resynced local state from the `service` prop after a background refetch (`services.tsx:212-219`) — since `ServicesPage` (Task 6) looks the service up by key from the live query on every render and passes a `key={service.key}` prop, the dialog remounts fresh each time it's opened for a given service, so there's no stale-prop case to guard against.

- [ ] **Step 1: Write the component**

Create `src/components/services/edit-service-dialog.tsx`:

```tsx
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
```

- [ ] **Step 2: Type-check**

Run: `pnpm build`
Expected: succeeds with no new TypeScript errors (standalone, not imported yet).

- [ ] **Step 3: Commit**

```bash
git add src/components/services/edit-service-dialog.tsx
git commit -m "feat: add EditServiceDialog with Details/Groups tabs"
```

---

### Task 6: Rewrite `ServicesPage`

**Files:**
- Modify: `src/pages/services.tsx` (replace lines 1-514 entirely)

**Interfaces:**
- Consumes: `filterServices`, `ServiceStatusFilter` (Task 1); `paginate` (Task 2); `Pagination` (Task 3); `EditServiceDialog` (Task 5).
- Produces: `ServicesPage` (same export name and default usage as today — whatever imports `src/pages/services.tsx` elsewhere, e.g. the router, needs no changes since the exported symbol name is unchanged).

This removes the old `ServiceEditor`, `GroupEditor`, `CreateGroupDialog`, `splitPermissionKeys`, and `splitLines` from this file (their logic now lives in Tasks 4 and 5's files) and replaces the flat `Card` list with a `Table`, search box, status filter, and pagination footer. `CreateServiceDialog` is carried over unchanged.

- [ ] **Step 1: Confirm the router import is unaffected**

Run: `grep -rn "from '@/pages/services'" src --include=*.tsx`
Expected: one or more matches importing `{ ServicesPage }` — confirms the rewrite must keep that exact named export.

- [ ] **Step 2: Replace the file**

Replace the entire contents of `src/pages/services.tsx` with:

```tsx
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
```

- [ ] **Step 3: Type-check and lint**

Run: `pnpm build && pnpm lint`
Expected: both succeed with no errors.

- [ ] **Step 4: Run the full test suite**

Run: `pnpm test`
Expected: PASS, 42 tests across 4 files (the 2 pre-existing `functions/lib/*.test.ts` files plus the 2 new `src/lib/*.test.ts` files from Tasks 1-2; `services.tsx` itself has no test file, consistent with the rest of `src/pages/`).

- [ ] **Step 5: Commit**

```bash
git add src/pages/services.tsx
git commit -m "feat: redesign Services page as a searchable, paginated table"
```

---

### Task 7: Manual verification

**Files:** none (no code changes — this is the verification gate for Tasks 1-6 together).

- [ ] **Step 1: Start the dev server**

Run: `pnpm dev`
Expected: Vite starts and prints a local URL (e.g. `http://localhost:5173`).

- [ ] **Step 2: Sign in and open the Services page**

Open the printed URL in a browser, sign in, and navigate to Services.
Expected: a loading skeleton (5 rows) appears briefly, then the table renders with columns Service / Status / Groups / Callback URLs / (Edit icon).

- [ ] **Step 3: Verify search**

Type a substring of an existing service's name into the search box.
Expected: the table narrows to matching rows only; clearing the box restores the full list.

Repeat with a substring that only matches a service's `key`, and one that only matches its `description`.
Expected: both narrow the table correctly.

Type a string that matches nothing.
Expected: the table shows "No services match your filters." with a working "Clear filters" link.

- [ ] **Step 4: Verify the status filter**

Switch the status `Select` to "Active", then "Disabled", then back to "All statuses".
Expected: the table updates to show only matching rows each time, and combining a search term with a status filter narrows by both.

- [ ] **Step 5: Verify pagination**

If there are 10 or fewer services, expected: "Page 1 of 1", both Previous and Next disabled, "Showing 1-N of N services".
If there are more than 10, expected: Next is enabled, clicking it shows the next page and updates the "Showing X-Y of Z" text; Previous is disabled on page 1 and enabled thereafter.

- [ ] **Step 6: Verify the Edit modal — Details tab**

Click the Edit (pencil) button on any row.
Expected: a modal opens on the "Details" tab showing that service's name, status, description, and callback URLs.

Change the name, click Save.
Expected: a success toast appears, the button label flips to "Saved", and the table's row updates with the new name once the modal is closed (or immediately, since the underlying query refetches).

- [ ] **Step 7: Verify the Edit modal — Groups tab**

In the same modal, click the "Groups" tab.
Expected: existing permission groups are listed with name/key/status/permissions; clicking "Edit" on one expands editable fields with Save/Cancel; clicking "Add group" expands a blank creation form with Key/Name/Description/Permissions fields.

Edit an existing group's permissions and save.
Expected: success toast, the group's summary row reflects the new permissions.

Create a new group with a unique key.
Expected: success toast, the new group appears in the list, and the "Groups (N)" tab label count increments.

- [ ] **Step 8: Verify service creation still works**

Close the edit modal, click "New service" in the page header, fill in Key/Name, and create it.
Expected: unchanged from before this redesign — success toast, dialog closes, the new service appears in the table (on whichever page it sorts to).

- [ ] **Step 9: Final commit check**

Run: `git status`
Expected: working tree clean (everything already committed in Tasks 1-6); no `- [ ]` step in this plan required its own commit since no files changed in this task.
