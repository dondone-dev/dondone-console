# Services page: searchable, paginated list design

## Problem

`src/pages/services.tsx` renders every service as a full-height `Card` in a
flat vertical stack, with the service's own edit fields and its permission
groups' edit fields all inline in the same card. As the number of services
grows, this is slow to scan and scroll through, and there's no way to search
or filter.

## Goals

- Replace the flat card stack with a table: name, status, group count,
  callback URL count, and an Edit action per row.
- Add a search box (matches name, key, description) and a status filter
  (All / Active / Disabled).
- Add pagination (fixed page size of 10, Prev/Next controls).
- Move editing from always-visible inline forms into an "Edit service" modal,
  opened via the row's Edit button.
- Move permission-group management (currently inline `GroupEditor`s per
  service, plus a separate `CreateGroupDialog`) into a "Groups" tab inside
  the same edit modal.

## Non-goals

- No backend changes. `GET /api/services` keeps returning the full,
  unpaginated list; filtering, search, and pagination are all client-side.
  The current service count is small enough (few dozen) that this is
  sufficient; server-side pagination can be added later if that changes.
- No change to `POST /api/services` (service creation) or its
  `CreateServiceDialog` UI — it already uses a modal and stays as-is.
- No numbered page buttons, page-size selector, sorting, or column
  customization — YAGNI for now.
- No optimistic UI — mutations behave exactly as they do today (toast on
  success/error, invalidate the `['services']` query on success).

## Architecture

### Data flow (unchanged fetch, new client-side derivation)

`ServicesPage` keeps the existing:

```ts
const services = useQuery({
  queryKey: ['services'],
  queryFn: () => apiFetch<{ services: Service[] }>(session, '/api/services'),
})
```

New local state in `ServicesPage`:

- `search: string`
- `statusFilter: 'all' | 'active' | 'disabled'`
- `page: number` (1-indexed)
- `editing: Service | null` — the service currently open in the edit modal

Derived via `useMemo`, recomputed when `services.data`, `search`, or
`statusFilter` change:

1. `filtered` — services where `name`, `key`, or `description` contains
   `search` (case-insensitive substring), AND `status === statusFilter`
   (skip the status check when `statusFilter === 'all'`).
2. `pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))`
3. `pageItems = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)`

An effect (or inline clamp during render) resets `page` to 1 whenever
`search` or `statusFilter` changes, and clamps `page` down if it exceeds the
new `pageCount` (e.g. after a filter shrinks the result set).

### Component breakdown

`src/pages/services.tsx` is rewritten to contain:

- `ServicesPage` — page header (unchanged `CreateServiceDialog` in the
  action slot), search input + status `Select`, the `Table`, the pagination
  footer, and the `EditServiceDialog` (rendered when `editing` is non-null).
- `CreateServiceDialog` — unchanged, moved as-is.
- `EditServiceDialog` (new) — replaces `ServiceEditor` and the inline
  `GroupEditor` list + `CreateGroupDialog` trigger. Takes `session` and
  `service: Service`, plus `open`/`onOpenChange`. Internally:
  - Local tab state: `tab: 'details' | 'groups'` (plain `useState`, rendered
    as two toggle buttons — no new Tabs primitive dependency needed for two
    tabs).
  - **Details tab**: the same fields and `PUT /api/services/:key` mutation
    logic currently in `ServiceEditor` (services.tsx:205-306), moved
    verbatim into this tab.
  - **Groups tab**: a compact list of `service.groups`, each row showing
    name, key badge, status dot, and permission count, with an inline
    "Edit" toggle per row that expands the same fields `GroupEditor`
    (services.tsx:397-497) has today. An "+ Add group" control at the
    bottom expands a blank inline form using the same fields/mutation as
    today's `CreateGroupDialog` (services.tsx:308-395), but inline instead
    of in a nested dialog (avoids stacking a second modal on top of the
    edit modal).
- A new small `Pagination` UI component (`src/components/ui/pagination.tsx`
  or inlined in `services.tsx` if it turns out to be only used here):
  Prev/Next buttons (disabled at the bounds) plus "Showing X–Y of Z
  services" text.

### Table columns

Using the existing `Table`/`TableHeader`/`TableBody`/`TableRow`/`TableHead`/
`TableCell` components (same as `users.tsx`), inside a `Card
className="overflow-hidden py-0"`:

1. **Service** — stacked cell: name (bold) + key (`Badge variant="outline"`,
   mono) on one line, truncated description (muted, `"No description."`
   fallback) below.
2. **Status** — `Badge` + `StatusDot`, same as today.
3. **Groups** — `"{n} group(s)"` count.
4. **Callback URLs** — `"{n} URL(s)"` count.
5. **Actions** — a single Edit (pencil) `Button` that sets
   `editing = service`.

### States

- **Loading**: 5 skeleton rows (same pattern as `users.tsx:75-82`).
- **Fetch error**: single row spanning all columns with a retry button
  (same pattern as `users.tsx:83-92`).
- **Truly empty** (`services.data.services.length === 0`): existing
  `EmptyState` (icon `Boxes`, same copy as today), spanning all columns.
- **Empty after filtering** (services exist but `filtered.length === 0`):
  a lighter message — "No services match your filters." — with a "Clear
  filters" button that resets `search` and `statusFilter`. Distinct from
  the truly-empty state so users don't think they have zero services.

## Testing

- Existing test setup: check for existing tests under the project (Vitest is
  configured per `package.json`). If `services.tsx` has no current test
  file, this redesign doesn't need to introduce a full suite, but any new
  pure logic (the filter/paginate `useMemo`, the page-clamping) should be
  extracted into a small testable helper if it grows non-trivial, and
  covered with a couple of Vitest cases (filter matches on each of the three
  fields, status filter, page slicing at boundaries).
- Manual verification: run the dev server, confirm search/filter/pagination
  interplay, confirm the edit modal's Details and Groups tabs both save
  correctly and match the existing mutation behavior (toast, query
  invalidation), confirm empty/error/loading states render.
