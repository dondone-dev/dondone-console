// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import type { Service, UserDetail } from '@/lib/api'
import { UserOverviewTab } from './user-overview-tab'

afterEach(cleanup)

function detail(overrides: Partial<UserDetail['profile']> = {}, permissions: string[] = []): UserDetail {
  return {
    profile: {
      id: 'u1',
      email: 'alice@test.com',
      display_name: 'Alice',
      avatar_url: null,
      status: 'active',
      created_at: '2025-01-01T00:00:00Z',
      ...overrides,
    },
    groups: [],
    permissions,
  }
}

function service(key: string, groupIds: string[]): Service {
  return {
    key,
    name: key,
    description: null,
    status: 'active',
    redirect_uris: [],
    groups: groupIds.map((id) => ({
      id,
      service_key: key,
      key: `${key}-g`,
      name: `Group ${id}`,
      description: null,
      status: 'active' as const,
      is_system: false,
      usage_policy_id: null,
      permissions: [],
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

describe('UserOverviewTab', () => {
  it('renders account fields', () => {
    render(<UserOverviewTab detail={detail()} services={[]} />)
    expect(screen.getByText('alice@test.com')).toBeTruthy()
    expect(screen.getByText('Alice')).toBeTruthy()
    expect(screen.getByText('u1')).toBeTruthy()
  })

  it('shows Not provided for missing fields', () => {
    render(
      <UserOverviewTab
        detail={detail({ email: null, display_name: null })}
        services={[]}
      />
    )
    expect(screen.getAllByText('Not provided')).toHaveLength(2)
  })

  it('sorts permissions alphabetically', () => {
    render(
      <UserOverviewTab
        detail={detail({}, ['z:write', 'a:read'])}
        services={[]}
      />
    )
    const badges = screen.getAllByText(/^[az]:/)
    expect(badges[0].textContent).toBe('a:read')
    expect(badges[1].textContent).toBe('z:write')
  })

  it('shows empty permissions message', () => {
    render(<UserOverviewTab detail={detail()} services={[]} />)
    expect(screen.getByText('No effective permissions.')).toBeTruthy()
  })

  it('counts effective service assignments', () => {
    const d = detail()
    d.groups = [
      { id: 'g-1', user_id: 'u1', group_id: 'g1', status: 'active', expires_at: null },
    ]
    const s = service('s1', ['g1'])
    render(<UserOverviewTab detail={d} services={[s]} nowMs={Date.now()} />)
    expect(screen.getByText('1 active service access assignment.')).toBeTruthy()
  })

  it('pluralises assignment count', () => {
    const d = detail()
    d.groups = [
      { id: 'g-1', user_id: 'u1', group_id: 'g1', status: 'active', expires_at: null },
      { id: 'g-2', user_id: 'u1', group_id: 'g2', status: 'active', expires_at: null },
    ]
    const s1 = service('s1', ['g1'])
    const s2 = service('s2', ['g2'])
    render(<UserOverviewTab detail={d} services={[s1, s2]} nowMs={Date.now()} />)
    expect(screen.getByText('2 active service access assignments.')).toBeTruthy()
  })
})
