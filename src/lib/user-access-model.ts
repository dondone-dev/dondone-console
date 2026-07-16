import type { Service, UserGroupGrant } from './api'

export type UserAccessDraft = Map<string, string | null>

export interface ResolvedServiceAccess {
  service: Service
  groupId: string | null
  expiresAt: string | null
}

export function buildUserAccessDraft(grants: UserGroupGrant[]): UserAccessDraft {
  const draft: UserAccessDraft = new Map()
  for (const g of grants) {
    if (g.status === 'active') draft.set(g.group_id, g.expires_at)
  }
  return draft
}

export function resolveServiceAccess(
  service: Service,
  draft: UserAccessDraft
): ResolvedServiceAccess {
  for (const group of service.groups) {
    if (draft.has(group.id)) {
      return { service, groupId: group.id, expiresAt: draft.get(group.id) ?? null }
    }
  }
  return { service, groupId: null, expiresAt: null }
}

export function replaceServiceGroup(
  draft: UserAccessDraft,
  service: Service,
  nextGroupId: string | null
): UserAccessDraft {
  const next = new Map(draft)
  for (const group of service.groups) next.delete(group.id)
  if (nextGroupId) next.set(nextGroupId, null)
  return next
}

export function updateServiceExpiry(
  draft: UserAccessDraft,
  groupId: string,
  expiresAt: string | null
): UserAccessDraft {
  const next = new Map(draft)
  next.set(groupId, expiresAt)
  return next
}

export function unresolvedGrantIds(
  draft: UserAccessDraft,
  services: Service[]
): string[] {
  const allGroupIds = new Set<string>()
  for (const s of services) {
    for (const g of s.groups) allGroupIds.add(g.id)
  }
  return [...draft.keys()].filter((id) => !allGroupIds.has(id))
}

export function serializeUserAccessDraft(
  draft: UserAccessDraft
): Array<{ group_id: string; expires_at: string | null }> {
  return [...draft.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([group_id, expires_at]) => ({ group_id, expires_at }))
}

export function countEffectiveServiceAssignments(
  grants: UserGroupGrant[],
  services: Service[],
  nowMs: number
): number {
  const groupIndex = new Map<string, { service: Service; group: Service['groups'][number] }>()
  for (const s of services) {
    for (const g of s.groups) groupIndex.set(g.id, { service: s, group: g })
  }

  let count = 0
  for (const grant of grants) {
    if (grant.status !== 'active') continue
    if (grant.expires_at && Date.parse(grant.expires_at) <= nowMs) continue
    const entry = groupIndex.get(grant.group_id)
    if (!entry) continue
    if (entry.service.status !== 'active') continue
    if (entry.group.status !== 'active') continue
    count++
  }
  return count
}
