import { describe, expect, it } from 'vitest'
import { paginate } from './pagination'

describe('paginate', () => {
  it('slices the first page', () => {
    const result = paginate([1, 2, 3, 4, 5], 1, 2)
    expect(result).toEqual({ items: [1, 2], page: 1, pageCount: 3, total: 5 })
  })

  it('slices the last, partial page', () => {
    const result = paginate([1, 2, 3, 4, 5], 3, 2)
    expect(result).toEqual({ items: [5], page: 3, pageCount: 3, total: 5 })
  })

  it('clamps a page number above pageCount down to the last page', () => {
    const result = paginate([1, 2, 3], 99, 2)
    expect(result.page).toBe(2)
    expect(result.items).toEqual([3])
  })

  it('clamps a page number below 1 up to 1', () => {
    const result = paginate([1, 2, 3], 0, 2)
    expect(result.page).toBe(1)
  })

  it('returns pageCount 1 and an empty items array for an empty list', () => {
    const result = paginate([], 1, 10)
    expect(result).toEqual({ items: [], page: 1, pageCount: 1, total: 0 })
  })
})
