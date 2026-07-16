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
    resource_uri: null,
    capability_sync_status: 'unknown',
    active_capability_version: null,
    capability_last_synced_at: null,
    capability_last_error: null,
    has_capability_versions: false,
    default_group_id: null,
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
