// @vitest-environment jsdom
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Outlet, Route, Routes } from 'react-router-dom'
import type { ConsoleContext } from '@/lib/console-context'
import { UserDetailPage } from './user-detail'

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
const consoleContext: ConsoleContext = {
  session,
  me: { user: { id: 'admin' }, profile: null, console_admin: true, permissions: [] },
  signOut: () => {},
}

const userDetail = {
  profile: {
    id: 'u1',
    email: 'alice@test.com',
    display_name: 'Alice',
    avatar_url: null,
    status: 'active',
    created_at: '2025-01-01T00:00:00Z',
  },
  groups: [],
  permissions: ['app:read'],
}

const servicesResponse = { services: [] }

function renderDetail(url: string, locationState?: unknown) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  const entry = locationState
    ? { pathname: url.split('?')[0], search: url.includes('?') ? `?${url.split('?')[1]}` : '', state: locationState }
    : url
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[entry]}>
        <Routes>
          <Route element={<Outlet context={consoleContext} />}>
            <Route path="/users/:userId" element={<UserDetailPage />} />
          </Route>
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  )
}

function mockResponses(detail: unknown, detailStatus = 200, services: unknown = servicesResponse, servicesStatus = 200) {
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const url = typeof input === 'string' ? input : (input as Request).url
    if (url.includes('/api/services')) {
      return new Response(JSON.stringify(services), {
        status: servicesStatus,
        headers: { 'Content-Type': 'application/json' },
      })
    }
    return new Response(JSON.stringify(detail), {
      status: detailStatus,
      headers: { 'Content-Type': 'application/json' },
    })
  })
}

beforeEach(() => vi.restoreAllMocks())

describe('UserDetailPage', () => {
  it('fetches the exact detail endpoint', async () => {
    mockResponses(userDetail)
    renderDetail('/users/u1')

    await screen.findByRole('heading', { name: 'Alice' })

    const calls = vi.mocked(globalThis.fetch).mock.calls
    const detailCall = calls.find((c) => (c[0] as string).includes('/api/users/u1'))
    expect(detailCall).toBeTruthy()
  })

  it('works on refresh/direct entry without list data', async () => {
    mockResponses(userDetail)
    renderDetail('/users/u1')

    await screen.findByRole('heading', { name: 'Alice' })
    expect(screen.getAllByText('u1').length).toBeGreaterThanOrEqual(1)
  })

  it('selects Access tab with ?tab=access', async () => {
    mockResponses(userDetail)
    renderDetail('/users/u1?tab=access')

    await screen.findByRole('heading', { name: 'Alice' })
    const accessTab = screen.getByRole('tab', { name: 'Access' })
    expect(accessTab.getAttribute('aria-selected')).toBe('true')
  })

  it('renders Overview for unknown tab', async () => {
    mockResponses(userDetail)
    renderDetail('/users/u1?tab=unknown')

    await screen.findByRole('heading', { name: 'Alice' })
    const overviewTab = screen.getByRole('tab', { name: 'Overview' })
    expect(overviewTab.getAttribute('aria-selected')).toBe('true')
  })

  it('uses safe originating list URL from state', async () => {
    mockResponses(userDetail)
    renderDetail('/users/u1', { from: '/users?search=alice&page=2' })

    await screen.findByRole('heading', { name: 'Alice' })
    const backLink = screen.getByRole('link', { name: /Users/ })
    expect(backLink.getAttribute('href')).toBe('/users?search=alice&page=2')
  })

  it('falls back to /users for unsafe from state', async () => {
    mockResponses(userDetail)
    renderDetail('/users/u1', { from: '/evil-site' })

    await screen.findByRole('heading', { name: 'Alice' })
    const backLink = screen.getByRole('link', { name: /Users/ })
    expect(backLink.getAttribute('href')).toBe('/users')
  })

  it('shows 404 state for missing user', async () => {
    mockResponses({ error: 'not_found' }, 404)
    renderDetail('/users/missing')

    await screen.findByText('User not found')
    expect(screen.getByText('This user no longer exists or is unavailable.')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Back to users' })).toBeTruthy()
  })

  it('shows generic error with Retry', async () => {
    mockResponses({ error: 'internal_error' }, 500)
    renderDetail('/users/u1')

    await screen.findByText('Failed to load user')
    expect(screen.getByRole('button', { name: 'Retry' })).toBeTruthy()
  })

  it('services error does not hide user identity', async () => {
    mockResponses(userDetail, 200, { error: 'internal_error' }, 500)
    renderDetail('/users/u1')

    await screen.findByRole('heading', { name: 'Alice' })
    expect(screen.getAllByText('u1').length).toBeGreaterThanOrEqual(1)
    expect(screen.getByRole('heading', { name: 'Account' })).toBeTruthy()
    expect(screen.getByText('Failed to load services.')).toBeTruthy()
  })
})
