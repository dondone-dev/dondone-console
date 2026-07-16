import { describe, expect, it } from 'vitest'
import {
  parseUserListQuery,
  updateUserListQuery,
  userListApiPath,
  USER_PAGE_SIZE,
} from './user-list-query'

describe('USER_PAGE_SIZE', () => {
  it('is 20', () => {
    expect(USER_PAGE_SIZE).toBe(20)
  })
})

describe('parseUserListQuery', () => {
  it('returns defaults for empty params', () => {
    expect(parseUserListQuery(new URLSearchParams())).toEqual({
      search: '',
      status: 'all',
      page: 1,
    })
  })

  it('trims whitespace from search', () => {
    expect(parseUserListQuery(new URLSearchParams('search=%20Ada%20'))).toEqual({
      search: 'Ada',
      status: 'all',
      page: 1,
    })
  })

  it('parses valid status and page', () => {
    expect(
      parseUserListQuery(new URLSearchParams('search=%20Ada%20&status=active&page=2'))
    ).toEqual({ search: 'Ada', status: 'active', page: 2 })
  })

  it('normalises disabled status', () => {
    expect(parseUserListQuery(new URLSearchParams('status=disabled')).status).toBe(
      'disabled'
    )
  })

  it('treats unknown status as all', () => {
    expect(parseUserListQuery(new URLSearchParams('status=banana')).status).toBe('all')
  })

  it('treats non-numeric page as 1', () => {
    expect(parseUserListQuery(new URLSearchParams('page=abc')).page).toBe(1)
  })

  it('treats zero page as 1', () => {
    expect(parseUserListQuery(new URLSearchParams('page=0')).page).toBe(1)
  })

  it('treats negative page as 1', () => {
    expect(parseUserListQuery(new URLSearchParams('page=-3')).page).toBe(1)
  })

  it('floors fractional page', () => {
    expect(parseUserListQuery(new URLSearchParams('page=2.9')).page).toBe(2)
  })
})

describe('updateUserListQuery', () => {
  it('omits default keys from output', () => {
    const result = updateUserListQuery(new URLSearchParams(), {
      search: '',
      status: 'all',
      page: 1,
    })
    expect(result.toString()).toBe('')
  })

  it('sets search and omits default status/page', () => {
    const result = updateUserListQuery(new URLSearchParams(), { search: 'Ada' })
    expect(result.get('search')).toBe('Ada')
    expect(result.has('status')).toBe(false)
    expect(result.has('page')).toBe(false)
  })

  it('preserves existing keys not in patch', () => {
    const result = updateUserListQuery(new URLSearchParams('search=Ada&page=3'), {
      status: 'active',
    })
    expect(result.get('search')).toBe('Ada')
    expect(result.get('status')).toBe('active')
    expect(result.get('page')).toBe('3')
  })

  it('resets page when search changes', () => {
    const result = updateUserListQuery(new URLSearchParams('search=Ada&page=3'), {
      search: 'Bob',
      page: 1,
    })
    expect(result.get('search')).toBe('Bob')
    expect(result.has('page')).toBe(false)
  })

  it('removes keys that return to defaults', () => {
    const result = updateUserListQuery(new URLSearchParams('status=active&page=2'), {
      status: 'all',
      page: 1,
    })
    expect(result.toString()).toBe('')
  })

  it('sets page > 1', () => {
    const result = updateUserListQuery(new URLSearchParams(), { page: 5 })
    expect(result.get('page')).toBe('5')
  })
})

describe('userListApiPath', () => {
  it('builds path with all filters', () => {
    expect(userListApiPath({ search: 'Ada', status: 'disabled', page: 3 })).toBe(
      '/api/users?search=Ada&status=disabled&limit=20&offset=40'
    )
  })

  it('omits search and status when at defaults', () => {
    expect(userListApiPath({ search: '', status: 'all', page: 1 })).toBe(
      '/api/users?limit=20&offset=0'
    )
  })

  it('includes only active status', () => {
    expect(userListApiPath({ search: '', status: 'active', page: 2 })).toBe(
      '/api/users?status=active&limit=20&offset=20'
    )
  })

  it('encodes search with special characters', () => {
    expect(userListApiPath({ search: 'a&b=c', status: 'all', page: 1 })).toBe(
      '/api/users?search=a%26b%3Dc&limit=20&offset=0'
    )
  })
})
