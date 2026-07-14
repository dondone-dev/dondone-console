import type { Service } from './api'

export type ServiceStatusFilter = 'all' | 'active' | 'disabled'

export function filterServices(
  services: Service[],
  search: string,
  statusFilter: ServiceStatusFilter
): Service[] {
  const term = search.trim().toLowerCase()
  return services.filter((service) => {
    if (statusFilter !== 'all' && service.status !== statusFilter) return false
    if (!term) return true
    return (
      service.name.toLowerCase().includes(term) ||
      service.key.toLowerCase().includes(term) ||
      (service.description ?? '').toLowerCase().includes(term)
    )
  })
}
