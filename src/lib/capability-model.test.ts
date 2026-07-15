import { describe, expect, it } from 'vitest'
import {
  approvalRequest,
  capabilitySelectionState,
  rejectionRequest,
  capabilityDiffRows,
  pendingScopeKeys,
} from './capability-model'

describe('capabilitySelectionState', () => {
  it('distinguishes loading, error, and an approved empty catalog', () => {
    expect(capabilitySelectionState('loading', [], [])).toEqual({ kind: 'loading', canSave: false, unavailable: [] })
    expect(capabilitySelectionState('error', [], [])).toEqual({ kind: 'error', canSave: false, unavailable: [] })
    expect(capabilitySelectionState('success', [], [])).toEqual({ kind: 'empty', canSave: false, unavailable: [] })
  })

  it('blocks resubmission when a previously selected permission is no longer active', () => {
    expect(capabilitySelectionState('success', ['api:echo'], ['api:echo', 'api:removed'])).toEqual({
      kind: 'ready',
      canSave: false,
      unavailable: ['api:removed'],
    })
  })

  it('allows saving only selections fully contained in the loaded active catalog', () => {
    expect(capabilitySelectionState('success', ['api:echo'], ['api:echo'])).toEqual({
      kind: 'ready',
      canSave: true,
      unavailable: [],
    })
  })
})

describe('capability review model', () => {
  it('shows scope-only additions and removals as visible changes', () => {
    expect(capabilityDiffRows({
      change_type: 'breaking',
      added_permissions: [], removed_permissions: [], added_scopes: ['api:read'], removed_scopes: ['api:write'],
      added_roles: [], removed_roles: [], changed_role_memberships: [], description_changes: [],
    })).toEqual([
      { label: '+ OAuth scopes', items: ['api:read'], tone: 'add' },
      { label: '- OAuth scopes', items: ['api:write'], tone: 'remove' },
    ])
  })

  it('normalizes pending scopes for manifest review', () => {
    expect(pendingScopeKeys(['api:read', 'api:echo', 'api:read'])).toEqual(['api:echo', 'api:read'])
  })
})

describe('approval request model', () => {
  it('requires and preserves a reason for a breaking approval', () => {
    expect(() => approvalRequest('breaking', '  ')).toThrow('change_reason_required')
    expect(approvalRequest('breaking', '  planned migration  ')).toEqual({
      allow_breaking_change: true,
      change_reason: 'planned migration',
    })
  })

  it('does not send a breaking override for additive or benign changes', () => {
    expect(approvalRequest('additive', '')).toEqual({})
    expect(approvalRequest('benign', 'ignored')).toEqual({})
  })

  it('requires a non-empty rejection reason', () => {
    expect(() => rejectionRequest(' ')).toThrow('rejection_reason_required')
    expect(rejectionRequest('  wrong namespace  ')).toEqual({ reason: 'wrong namespace' })
  })
})
