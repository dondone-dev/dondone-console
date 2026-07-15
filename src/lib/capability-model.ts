export type CapabilityQueryStatus = 'loading' | 'error' | 'success'
export type CapabilitySelectionKind = 'loading' | 'error' | 'empty' | 'ready'

export function capabilitySelectionState(
  status: CapabilityQueryStatus,
  activeKeys: string[],
  selectedKeys: string[]
): { kind: CapabilitySelectionKind; canSave: boolean; unavailable: string[] } {
  if (status !== 'success') {
    return { kind: status, canSave: false, unavailable: [] }
  }
  if (activeKeys.length === 0) {
    return { kind: 'empty', canSave: false, unavailable: [...selectedKeys].sort() }
  }
  const active = new Set(activeKeys)
  const unavailable = [...new Set(selectedKeys.filter((key) => !active.has(key)))].sort()
  return { kind: 'ready', canSave: unavailable.length === 0, unavailable }
}

export function approvalRequest(
  changeType: 'additive' | 'benign' | 'breaking',
  reason: string
): Record<string, unknown> {
  if (changeType !== 'breaking') return {}
  const changeReason = reason.trim()
  if (!changeReason) throw new Error('change_reason_required')
  return { allow_breaking_change: true, change_reason: changeReason }
}

export function rejectionRequest(reason: string): { reason: string } {
  const normalized = reason.trim()
  if (!normalized) throw new Error('rejection_reason_required')
  return { reason: normalized }
}

export type CapabilityDiffRow = {
  label: string
  items: string[]
  tone: 'add' | 'remove' | 'change' | 'neutral'
}

export function capabilityDiffRows(diff: DiffClassification): CapabilityDiffRow[] {
  const candidates: CapabilityDiffRow[] = [
    { label: '+ Permissions', items: diff.added_permissions, tone: 'add' },
    { label: '- Permissions', items: diff.removed_permissions, tone: 'remove' },
    { label: '+ OAuth scopes', items: diff.added_scopes, tone: 'add' },
    { label: '- OAuth scopes', items: diff.removed_scopes, tone: 'remove' },
    { label: '+ Roles', items: diff.added_roles, tone: 'add' },
    { label: '- Roles', items: diff.removed_roles, tone: 'remove' },
    { label: '~ Role memberships', items: diff.changed_role_memberships, tone: 'change' },
    { label: '~ Descriptions', items: diff.description_changes, tone: 'neutral' },
  ]
  return candidates.filter((row) => row.items.length > 0)
}

export function pendingScopeKeys(scopes: string[]): string[] {
  return [...new Set(scopes)].sort()
}
import type { DiffClassification } from './api'
