// @vitest-environment jsdom
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Outlet, Route, Routes, useLocation } from 'react-router-dom'
import type { ConsoleContext } from '@/lib/console-context'
import { UsersPage } from './users'

afterEach(cleanup)

const session = { accessToken: 'test-token', refreshToken: 'test-refresh', email: 'admin@test.com' }
const consoleContext: ConsoleContext = {
  session,
  me: { user: { id: 'admin' }, profile: null, console_admin: true, permissions: [] },
  signOut: () => {},
}

beforeAll(() => {
  vi.stubGlobal('PointerEvent', MouseEvent)
  HTMLElement.prototype.hasPointerCapture = () => false
  HTMLElement.prototype.setPointerCapture = () => undefined
  HTMLElement.prototype.releasePointerCapture = () => undefined
  HTMLElement.prototype.scrollIntoView = () => undefined
})
afterAll(() => vi.unstubAllGlobals())

function LocationProbe() {
  const location = useLocation()
  return (
    <output data-testid="location">
      {JSON.stringify({
        pathname: location.pathname,
        search: location.search,
        state: location.state,
      })}
    </output>
  )
}

function renderUsers(initialUrl = '/users') {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialUrl]}>
        <Routes>
          <Route element={<Outlet context={consoleContext} />}>
            <Route path="/users" element={<><UsersPage /><LocationProbe /></>} />
            <Route path="/users/:userId" element={<LocationProbe />} />
          </Route>
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  )
}

function mockFetchSuccess(users: unknown[], total: number) {
  vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
    new Response(JSON.stringify({ users, total }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  )
}

function mockFetchError() {
  vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
    new Response(JSON.stringify({ error: 'internal_error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  )
}

function mockFetchPersistent(users: unknown[], total: number) {
  vi.spyOn(globalThis, 'fetch').mockImplementation(async () =>
    new Response(JSON.stringify({ users, total }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  )
}

const user1 = {
  id: '11111111-1111-1111-1111-111111111111',
  email: 'alice@test.com',
  display_name: 'Alice',
  avatar_url: null,
  status: 'active',
  created_at: '2025-01-01T00:00:00Z',
}

const user2 = {
  id: '22222222-2222-2222-2222-222222222222',
  email: 'bob@test.com',
  display_name: null,
  avatar_url: null,
  status: 'disabled',
  created_at: '2025-02-01T00:00:00Z',
}

beforeEach(() => vi.restoreAllMocks())

describe('UsersPage', () => {
  it('builds API path from URL params', async () => {
    mockFetchSuccess([user1], 1)
    renderUsers('/users?search=alice&status=active&page=1')

    await screen.findByText('Alice')

    const call = vi.mocked(globalThis.fetch).mock.calls[0]
    const url = call[0] as string
    expect(url).toContain('/api/users?')
    expect(url).toContain('search=alice')
    expect(url).toContain('status=active')
    expect(url).toContain('limit=20')
    expect(url).toContain('offset=0')
  })

  it('renders user rows with detail links', async () => {
    mockFetchSuccess([user1, user2], 2)
    renderUsers()

    await screen.findByText('Alice')
    const link = screen.getByRole('link', { name: 'Alice' })
    expect(link.getAttribute('href')).toBe('/users/11111111-1111-1111-1111-111111111111')

    expect(screen.getByText('bob@test.com')).toBeTruthy()
  })

  it('resets page when search changes and replaces URL state', async () => {
    const user = userEvent.setup()
    mockFetchPersistent([user1], 60)
    renderUsers('/users?page=3')

    const search = await screen.findByPlaceholderText('Search by email')
    await user.type(search, 'alice')

    await waitFor(() => {
      const location = JSON.parse(screen.getByTestId('location').textContent ?? '{}')
      expect(location.search).toBe('?search=alice')
    })
  })

  it('resets page when status changes', async () => {
    const user = userEvent.setup()
    mockFetchPersistent([user1], 60)
    renderUsers('/users?page=3')

    await screen.findByText('Alice')
    await user.click(screen.getByRole('combobox'))
    await user.click(screen.getByRole('option', { name: 'Disabled' }))

    await waitFor(() => {
      const location = JSON.parse(screen.getByTestId('location').textContent ?? '{}')
      expect(location.search).toBe('?status=disabled')
    })
  })

  it('moves to the next server page through URL state', async () => {
    const user = userEvent.setup()
    mockFetchPersistent([user1], 45)
    renderUsers()

    await screen.findByText('Showing 1-20 of 45 users')
    await user.click(screen.getByRole('button', { name: /Next/ }))

    await waitFor(() => {
      const location = JSON.parse(screen.getByTestId('location').textContent ?? '{}')
      expect(location.search).toBe('?page=2')
    })
  })

  it('stores the originating list URL in detail link state', async () => {
    const user = userEvent.setup()
    mockFetchSuccess([user1], 40)
    renderUsers('/users?search=alice&page=2')

    await user.click(await screen.findByRole('link', { name: 'Alice' }))

    const location = JSON.parse(screen.getByTestId('location').textContent ?? '{}')
    expect(location.pathname).toBe('/users/11111111-1111-1111-1111-111111111111')
    expect(location.state).toEqual({ from: '/users?search=alice&page=2' })
  })

  it('shows user with display_name: primary name, secondary email', async () => {
    mockFetchSuccess([user1], 1)
    renderUsers()

    await screen.findByText('Alice')
    expect(screen.getByText('alice@test.com')).toBeTruthy()
  })

  it('shows user without display_name: primary email, secondary UUID', async () => {
    mockFetchSuccess([user2], 1)
    renderUsers()

    await screen.findByText('bob@test.com')
    expect(screen.getByText('22222222-2222-2222-2222-222222222222')).toBeTruthy()
  })

  it('renders chevron detail link with accessible name', async () => {
    mockFetchSuccess([user1], 1)
    renderUsers()

    await screen.findByText('Alice')
    const chevronLink = screen.getByRole('link', { name: 'View alice@test.com' })
    expect(chevronLink.getAttribute('href')).toBe('/users/11111111-1111-1111-1111-111111111111')
  })

  it('shows error state with retry', async () => {
    mockFetchError()
    renderUsers()

    await screen.findByText('Failed to load users.')
    expect(screen.getByRole('button', { name: /Retry/i })).toBeTruthy()
  })

  it('shows empty state with no filters', async () => {
    mockFetchSuccess([], 0)
    renderUsers()

    await screen.findByText('Users appear here after they sign in with Dondone Auth.')
  })

  it('shows filtered empty state with clear filters', async () => {
    mockFetchSuccess([], 0)
    renderUsers('/users?search=nomatch')

    await screen.findByText('No users match the current filters.')
    expect(screen.getByRole('button', { name: 'Clear filters' })).toBeTruthy()
  })

  it('does not request user detail or services', async () => {
    mockFetchSuccess([user1], 1)
    renderUsers()

    await screen.findByText('Alice')

    const calls = vi.mocked(globalThis.fetch).mock.calls
    expect(calls).toHaveLength(1)
    const url = calls[0][0] as string
    expect(url).toContain('/api/users?')
    expect(url).not.toContain('/api/users/')
    expect(url).not.toContain('/api/services')
  })
})
