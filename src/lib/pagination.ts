export interface PageResult<T> {
  items: T[]
  page: number
  pageCount: number
  total: number
}

export function paginate<T>(items: T[], page: number, pageSize: number): PageResult<T> {
  const total = items.length
  const pageCount = Math.max(1, Math.ceil(total / pageSize))
  const clampedPage = Math.min(Math.max(1, page), pageCount)
  const start = (clampedPage - 1) * pageSize
  return {
    items: items.slice(start, start + pageSize),
    page: clampedPage,
    pageCount,
    total,
  }
}
