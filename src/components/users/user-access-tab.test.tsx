// @vitest-environment jsdom
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { Service, UserDetail } from '@/lib/api'
import { UserAccessTab } from './user-access-tab'

const { toastSuccess, toastError } = vi.hoisted(() => ({
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}))

vi.mock('sonner', () => ({
  toast: { success: toastSuccess, error: toastError },
}))

afterEach(cleanup)

beforeAll(() => {
  vi.stubGlobal('PointerEvent', MouseEvent)
  HTMLElement.prototype.hasPointerCapture = () => false
  HTMLElement.prototype.setPointerCapture = () => undefined
  HTMLElement.prototype.releasePointerCapture = () => undefined
  HTMLElement.prototype.scrollIntoView = () => undefined
})
afterAll(() => vi.unstubAllGlobals())

const session = { accessToken: 'test-token', refreshToken: 'test-refresh', email: 'admin@test.com' }

function mkService(key: string, groups: Array<{ id: string; name: string; status?: 'active' | 'disabled'; permissions?: string[] }>, status: 'active' | 'disabled' = 'active'): Service {
  return {
    key,
    name: key.charAt(0).toUpperCase() + key.slice(1),
    description: null,
    status,
    redirect_uris: [],
    groups: groups.map((g) => ({
      id: g.id,
      service_key: key,
      key: `${key}-${g.name.toLowerCase()}`,
      name: g.name,
      description: null,
      status: g.status ?? 'active',
      is_system: false,
      usage_policy_id: null,
      permissions: g.permissions ?? [],
    })),
    resource_uri: null,
    capability_sync_status: 'not_configured',
    active_capability_version: null,
    capability_last_synced_at: null,
    capability_last_error: null,
    has_capability_versions: false,
    default_group_id: null,
  }
}

function mkDetail(grants: Array<{ group_id: string; status?: 'active' | 'revoked'; expires_at?: string | null }>): UserDetail {
  return {
    profile: {
      id: 'u1',
      email: 'alice@test.com',
      display_name: 'Alice',
      avatar_url: null,
      status: 'active',
      created_at: '2025-01-01T00:00:00Z',
    },
    groups: grants.map((g, i) => ({
      id: `grant-${i}`,
      user_id: 'u1',
      group_id: g.group_id,
      status: g.status ?? 'active',
      expires_at: g.expires_at ?? null,
    })),
    permissions: [],
  }
}

function renderAccess(detail: UserDetail, services: Service[]) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  const result = render(
    <QueryClientProvider client={queryClient}>
      <UserAccessTab session={session} userId="u1" detail={detail} services={services} />
    </QueryClientProvider>
  )
  return { ...result, queryClient }
}

beforeEach(() => {
  vi.restoreAllMocks()
  toastSuccess.mockReset()
  toastError.mockReset()
})

describe('UserAccessTab', () => {
  it('renders service access heading', () => {
    renderAccess(mkDetail([]), [])
    expect(screen.getByText('Service access')).toBeTruthy()
  })

  it('renders services sorted: active first, then by name', () => {
    const s1 = mkService('beta', [{ id: 'g1', name: 'G1' }], 'disabled')
    const s2 = mkService('alpha', [{ id: 'g2', name: 'G2' }])
    renderAccess(mkDetail([]), [s1, s2])

    const cells = screen.getAllByText(/^(Alpha|Beta)$/)
    expect(cells[0].textContent).toBe('Alpha')
    expect(cells[1].textContent).toBe('Beta')
  })

  it('renders active Groups sorted by name', async () => {
    const user = userEvent.setup()
    const svc = mkService('app', [
      { id: 'g-zulu', name: 'Zulu' },
      { id: 'g-alpha', name: 'Alpha' },
    ])
    renderAccess(mkDetail([]), [svc])

    await user.click(screen.getAllByRole('combobox', { name: 'Group for App' })[0])
    expect(screen.getAllByRole('option').map((option) => option.textContent)).toEqual([
      'No access',
      'Alpha',
      'Zulu',
    ])
  })

  it('keeps an assigned disabled Group visible and unavailable', async () => {
    const user = userEvent.setup()
    const svc = mkService('app', [
      { id: 'g-disabled', name: 'Legacy', status: 'disabled' },
    ])
    renderAccess(mkDetail([{ group_id: 'g-disabled' }]), [svc])

    await user.click(screen.getAllByRole('combobox', { name: 'Group for App' })[0])
    const option = screen.getByRole('option', { name: 'Legacy (disabled)' })
    expect(option.getAttribute('aria-disabled')).toBe('true')
  })

  it('shows discard and save buttons disabled initially', () => {
    const svc = mkService('app', [{ id: 'g1', name: 'Viewer' }])
    renderAccess(mkDetail([]), [svc])
    expect(screen.getByRole('button', { name: 'Discard changes' }).hasAttribute('disabled')).toBe(true)
    expect(screen.getByRole('button', { name: 'Save changes' }).hasAttribute('disabled')).toBe(true)
  })

  it('enables buttons after changing a group', async () => {
    const user = userEvent.setup()
    const svc = mkService('app', [{ id: 'g1', name: 'Viewer' }])
    renderAccess(mkDetail([]), [svc])

    const combos = screen.getAllByRole('combobox', { name: 'Group for App' })
    await user.click(combos[0])
    await user.click(screen.getByRole('option', { name: 'Viewer' }))

    expect(screen.getByRole('button', { name: 'Discard changes' }).hasAttribute('disabled')).toBe(false)
    expect(screen.getByRole('button', { name: 'Save changes' }).hasAttribute('disabled')).toBe(false)
  })

  it('discard restores original state', async () => {
    const user = userEvent.setup()
    const svc = mkService('app', [{ id: 'g1', name: 'Viewer' }])
    renderAccess(mkDetail([{ group_id: 'g1' }]), [svc])

    const combos = screen.getAllByRole('combobox', { name: 'Group for App' })
    await user.click(combos[0])
    await user.click(screen.getByRole('option', { name: 'No access' }))

    await user.click(screen.getByRole('button', { name: 'Discard changes' }))

    expect(screen.getByRole('button', { name: 'Discard changes' }).hasAttribute('disabled')).toBe(true)
  })

  it('sends correct save payload', async () => {
    const user = userEvent.setup()
    const svc = mkService('app', [{ id: 'g1', name: 'Viewer' }])
    renderAccess(mkDetail([]), [svc])

    const combos = screen.getAllByRole('combobox', { name: 'Group for App' })
    await user.click(combos[0])
    await user.click(screen.getByRole('option', { name: 'Viewer' }))

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify(mkDetail([{ group_id: 'g1' }])), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    )

    await user.click(screen.getByRole('button', { name: 'Save changes' }))

    const call = vi.mocked(globalThis.fetch).mock.calls[0]
    const url = call[0] as string
    expect(url).toBe('/api/users/u1/groups')
    const body = JSON.parse((call[1] as RequestInit).body as string)
    expect(body).toEqual({ grants: [{ group_id: 'g1', expires_at: null }] })
  })

  it('replaces the existing Group from the same Service in the save payload', async () => {
    const user = userEvent.setup()
    const svc = mkService('app', [
      { id: 'g-viewer', name: 'Viewer' },
      { id: 'g-admin', name: 'Admin' },
    ])
    renderAccess(mkDetail([{ group_id: 'g-viewer' }]), [svc])

    await user.click(screen.getAllByRole('combobox', { name: 'Group for App' })[0])
    await user.click(screen.getByRole('option', { name: 'Admin' }))

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify(mkDetail([{ group_id: 'g-admin' }])), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    )
    await user.click(screen.getByRole('button', { name: 'Save changes' }))

    const body = JSON.parse(
      (vi.mocked(globalThis.fetch).mock.calls[0][1] as RequestInit).body as string
    )
    expect(body).toEqual({ grants: [{ group_id: 'g-admin', expires_at: null }] })
  })

  it('serializes an edited expiry and updates the detail cache after success', async () => {
    const user = userEvent.setup()
    const svc = mkService('app', [{ id: 'g1', name: 'Viewer' }])
    const returned = mkDetail([
      { group_id: 'g1', expires_at: new Date('2026-08-01T00:00').toISOString() },
    ])
    const { queryClient } = renderAccess(mkDetail([{ group_id: 'g1' }]), [svc])

    await user.clear(screen.getAllByLabelText('Expiry for App')[0])
    await user.type(
      screen.getAllByLabelText('Expiry for App')[0],
      '2026-08-01T00:00'
    )
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify(returned), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    )
    await user.click(screen.getByRole('button', { name: 'Save changes' }))

    await waitFor(() => {
      expect(queryClient.getQueryData(['user-detail', 'u1'])).toEqual(returned)
    })
    const body = JSON.parse(
      (vi.mocked(globalThis.fetch).mock.calls[0][1] as RequestInit).body as string
    )
    expect(body).toEqual({
      grants: [{ group_id: 'g1', expires_at: new Date('2026-08-01T00:00').toISOString() }],
    })
    expect(toastSuccess).toHaveBeenCalledWith('Service access updated')
  })

  it('retains draft on save error', async () => {
    const user = userEvent.setup()
    const svc = mkService('app', [{ id: 'g1', name: 'Viewer' }])
    renderAccess(mkDetail([]), [svc])

    const combos = screen.getAllByRole('combobox', { name: 'Group for App' })
    await user.click(combos[0])
    await user.click(screen.getByRole('option', { name: 'Viewer' }))

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ error: 'internal_error' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      })
    )

    await user.click(screen.getByRole('button', { name: 'Save changes' }))

    await screen.findByRole('button', { name: 'Save changes' })
    expect(screen.getByRole('button', { name: 'Discard changes' }).hasAttribute('disabled')).toBe(false)
    expect(toastError).toHaveBeenCalledWith(
      'Failed to update service access',
      expect.objectContaining({ description: 'internal_error' })
    )
  })

  it('shows unresolved grant warning and disables save', () => {
    const svc = mkService('app', [{ id: 'g1', name: 'Viewer' }])
    const detail = mkDetail([{ group_id: 'g-missing' }])
    renderAccess(detail, [svc])

    expect(screen.getByText('Unresolved access assignment')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Save changes' }).hasAttribute('disabled')).toBe(true)
  })
})
