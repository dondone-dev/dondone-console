import { describe, expect, it } from 'vitest'
import type { Service, UserGroupGrant } from './api'
import {
  buildUserAccessDraft,
  countEffectiveServiceAssignments,
  replaceServiceGroup,
  resolveServiceAccess,
  serializeUserAccessDraft,
  unresolvedGrantIds,
  updateServiceExpiry,
} from './user-access-model'

function grant(
  groupId: string,
  status: 'active' | 'revoked' = 'active',
  expiresAt: string | null = null
): UserGroupGrant {
  return { id: `grant-${groupId}`, user_id: 'u1', group_id: groupId, status, expires_at: expiresAt }
}

function service(key: string, groupIds: string[], status: 'active' | 'disabled' = 'active'): Service {
  return {
    key,
    name: key.charAt(0).toUpperCase() + key.slice(1),
    description: null,
    status,
    redirect_uris: [],
    groups: groupIds.map((id) => ({
      id,
      service_key: key,
      key: `${key}-group`,
      name: `Group ${id}`,
      description: null,
      status: 'active' as const,
      is_system: false,
      usage_policy_id: null,
      permissions: [`${key}:read`],
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

describe('buildUserAccessDraft', () => {
  it('includes active grants', () => {
    const draft = buildUserAccessDraft([grant('g1'), grant('g2', 'active', '2099-01-01T00:00:00Z')])
    expect(draft.size).toBe(2)
    expect(draft.get('g1')).toBeNull()
    expect(draft.get('g2')).toBe('2099-01-01T00:00:00Z')
  })

  it('includes expired but active grants', () => {
    const draft = buildUserAccessDraft([grant('g1', 'active', '2020-01-01T00:00:00Z')])
    expect(draft.has('g1')).toBe(true)
  })

  it('excludes revoked grants', () => {
    const draft = buildUserAccessDraft([grant('g1', 'revoked')])
    expect(draft.size).toBe(0)
  })
})

describe('resolveServiceAccess', () => {
  it('returns the matching group and expiry', () => {
    const s = service('s1', ['g1', 'g2'])
    const draft = new Map([['g1', '2099-01-01T00:00:00Z'] as const])
    const result = resolveServiceAccess(s, draft)
    expect(result).toEqual({
      service: s,
      groupId: 'g1',
      expiresAt: '2099-01-01T00:00:00Z',
    })
  })

  it('returns null group when no match', () => {
    const s = service('s1', ['g1'])
    const draft = new Map<string, string | null>()
    const result = resolveServiceAccess(s, draft)
    expect(result.groupId).toBeNull()
    expect(result.expiresAt).toBeNull()
  })
})

describe('replaceServiceGroup', () => {
  it('removes all groups from the target service and adds new one', () => {
    const s = service('s1', ['g1', 'g2'])
    const draft = new Map<string, string | null>([
      ['g1', null],
      ['g3', '2099-01-01T00:00:00Z'],
    ])
    const next = replaceServiceGroup(draft, s, 'g2')
    expect(next.has('g1')).toBe(false)
    expect(next.get('g2')).toBeNull()
    expect(next.get('g3')).toBe('2099-01-01T00:00:00Z')
  })

  it('preserves groups from other services', () => {
    const s1 = service('s1', ['g1'])
    const draft = new Map<string, string | null>([
      ['g1', null],
      ['other-g', 'some-date'],
    ])
    const next = replaceServiceGroup(draft, s1, null)
    expect(next.has('g1')).toBe(false)
    expect(next.get('other-g')).toBe('some-date')
  })

  it('new group expiry is null', () => {
    const s = service('s1', ['g1'])
    const draft = new Map<string, string | null>()
    const next = replaceServiceGroup(draft, s, 'g1')
    expect(next.get('g1')).toBeNull()
  })

  it('selecting no access removes all service groups', () => {
    const s = service('s1', ['g1', 'g2'])
    const draft = new Map<string, string | null>([['g1', null]])
    const next = replaceServiceGroup(draft, s, null)
    expect(next.has('g1')).toBe(false)
    expect(next.has('g2')).toBe(false)
  })
})

describe('updateServiceExpiry', () => {
  it('returns a new Map without mutating the source', () => {
    const draft = new Map<string, string | null>([['g1', null]])
    const next = updateServiceExpiry(draft, 'g1', '2099-01-01T00:00:00Z')
    expect(next.get('g1')).toBe('2099-01-01T00:00:00Z')
    expect(draft.get('g1')).toBeNull()
    expect(next).not.toBe(draft)
  })
})

describe('unresolvedGrantIds', () => {
  it('returns IDs absent from every service group catalog', () => {
    const draft = new Map<string, string | null>([
      ['g1', null],
      ['g-missing', null],
    ])
    const services = [service('s1', ['g1'])]
    expect(unresolvedGrantIds(draft, services)).toEqual(['g-missing'])
  })

  it('returns empty when all IDs resolve', () => {
    const draft = new Map<string, string | null>([['g1', null]])
    const services = [service('s1', ['g1'])]
    expect(unresolvedGrantIds(draft, services)).toEqual([])
  })
})

describe('serializeUserAccessDraft', () => {
  it('is sorted by group_id', () => {
    const draft = new Map<string, string | null>([
      ['z-group', null],
      ['a-group', '2099-01-01T00:00:00Z'],
    ])
    const result = serializeUserAccessDraft(draft)
    expect(result).toEqual([
      { group_id: 'a-group', expires_at: '2099-01-01T00:00:00Z' },
      { group_id: 'z-group', expires_at: null },
    ])
  })

  it('returns empty array for empty draft', () => {
    expect(serializeUserAccessDraft(new Map())).toEqual([])
  })
})

describe('countEffectiveServiceAssignments', () => {
  const now = new Date('2025-06-01T00:00:00Z').getTime()

  it('counts active, unexpired grants on active services with active groups', () => {
    const grants = [grant('g1')]
    const s = service('s1', ['g1'])
    expect(countEffectiveServiceAssignments(grants, [s], now)).toBe(1)
  })

  it('excludes expired grants', () => {
    const grants = [grant('g1', 'active', '2020-01-01T00:00:00Z')]
    const s = service('s1', ['g1'])
    expect(countEffectiveServiceAssignments(grants, [s], now)).toBe(0)
  })

  it('excludes revoked grants', () => {
    const grants = [grant('g1', 'revoked')]
    const s = service('s1', ['g1'])
    expect(countEffectiveServiceAssignments(grants, [s], now)).toBe(0)
  })

  it('excludes grants on disabled services', () => {
    const grants = [grant('g1')]
    const s = service('s1', ['g1'], 'disabled')
    expect(countEffectiveServiceAssignments(grants, [s], now)).toBe(0)
  })

  it('excludes grants with disabled groups', () => {
    const grants = [grant('g1')]
    const s = service('s1', ['g1'])
    s.groups[0].status = 'disabled'
    expect(countEffectiveServiceAssignments(grants, [s], now)).toBe(0)
  })

  it('excludes unresolved groups', () => {
    const grants = [grant('g-missing')]
    const s = service('s1', ['g1'])
    expect(countEffectiveServiceAssignments(grants, [s], now)).toBe(0)
  })

  it('includes grants with null expiry', () => {
    const grants = [grant('g1', 'active', null)]
    const s = service('s1', ['g1'])
    expect(countEffectiveServiceAssignments(grants, [s], now)).toBe(1)
  })

  it('includes grants with future expiry', () => {
    const grants = [grant('g1', 'active', '2099-01-01T00:00:00Z')]
    const s = service('s1', ['g1'])
    expect(countEffectiveServiceAssignments(grants, [s], now)).toBe(1)
  })
})
