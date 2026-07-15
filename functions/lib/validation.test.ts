import { describe, expect, it } from 'vitest'
import {
  assertValidRedirectUris,
  assertValidServiceKey,
  normalizeResourceUri,
  requireFoundRow,
} from './validation'
import { ApiError } from './types'

describe('assertValidServiceKey', () => {
  it('accepts lowercase alphanumeric keys with dots, underscores, hyphens', () => {
    expect(() => assertValidServiceKey('time')).not.toThrow()
    expect(() => assertValidServiceKey('api-v2')).not.toThrow()
    expect(() => assertValidServiceKey('my.service_key')).not.toThrow()
  })

  it('rejects a key that is just a dot or double dot (would break the URL path)', () => {
    expect(() => assertValidServiceKey('.')).toThrow(ApiError)
    expect(() => assertValidServiceKey('..')).toThrow(ApiError)
  })

  it('rejects a key starting or ending with a separator', () => {
    expect(() => assertValidServiceKey('.time')).toThrow(ApiError)
    expect(() => assertValidServiceKey('time.')).toThrow(ApiError)
    expect(() => assertValidServiceKey('-time')).toThrow(ApiError)
    expect(() => assertValidServiceKey('time-')).toThrow(ApiError)
  })

  it('rejects a key containing a slash', () => {
    expect(() => assertValidServiceKey('time/plus')).toThrow(ApiError)
  })

  it('rejects uppercase letters', () => {
    expect(() => assertValidServiceKey('Time')).toThrow(ApiError)
  })

  it('rejects an empty key', () => {
    expect(() => assertValidServiceKey('')).toThrow(ApiError)
  })

  it('rejects a key over 64 characters', () => {
    expect(() => assertValidServiceKey('a'.repeat(65))).toThrow(ApiError)
  })

  it('accepts a key at exactly 64 characters', () => {
    expect(() => assertValidServiceKey('a'.repeat(64))).not.toThrow()
  })
})

describe('assertValidRedirectUris', () => {
  it('accepts an https URL', () => {
    expect(() =>
      assertValidRedirectUris(['https://time.dondone.dev/auth/callback'])
    ).not.toThrow()
  })

  it('accepts http on localhost or 127.0.0.1', () => {
    expect(() => assertValidRedirectUris(['http://localhost:3001/auth/callback'])).not.toThrow()
    expect(() => assertValidRedirectUris(['http://127.0.0.1:3001/auth/callback'])).not.toThrow()
  })

  it('rejects http on a non-loopback host', () => {
    expect(() =>
      assertValidRedirectUris(['http://time.dondone.dev/auth/callback'])
    ).toThrow(ApiError)
  })

  it('rejects a URL containing a fragment', () => {
    expect(() =>
      assertValidRedirectUris(['https://time.dondone.dev/auth/callback#token'])
    ).toThrow(ApiError)
  })

  it('rejects a URL containing user info', () => {
    expect(() =>
      assertValidRedirectUris(['https://user:pass@time.dondone.dev/auth/callback'])
    ).toThrow(ApiError)
  })

  it('rejects a value that is not an absolute URL', () => {
    expect(() => assertValidRedirectUris(['/auth/callback'])).toThrow(ApiError)
    expect(() => assertValidRedirectUris(['not a url'])).toThrow(ApiError)
  })
})

describe('requireFoundRow', () => {
  it('returns the row when present', () => {
    expect(requireFoundRow({ key: 'time' }, null)).toEqual({ key: 'time' })
  })

  it('throws the underlying error when one is present, even if data is also present', () => {
    const dbError = new Error('connection reset')
    expect(() => requireFoundRow({ key: 'time' }, dbError)).toThrow(dbError)
  })

  it('throws ApiError(404) when there is no row and no error', () => {
    expect(() => requireFoundRow(null, null)).toThrow(ApiError)
    try {
      requireFoundRow(null, null)
      throw new Error('expected requireFoundRow to throw')
    } catch (caught) {
      expect(caught).toBeInstanceOf(ApiError)
      expect((caught as InstanceType<typeof ApiError>).status).toBe(404)
    }
  })
})

describe('normalizeResourceUri', () => {
  it('normalizes an HTTPS resource URI without changing its path identity', () => {
    expect(normalizeResourceUri('  https://api.dondone.dev/v1  ')).toBe(
      'https://api.dondone.dev/v1'
    )
    expect(normalizeResourceUri('https://api.dondone.dev/')).toBe(
      'https://api.dondone.dev/'
    )
    expect(normalizeResourceUri('https://api.dondone.dev')).toBe(
      'https://api.dondone.dev'
    )
  })

  it('accepts null and an empty field as an unconfigured resource', () => {
    expect(normalizeResourceUri(null)).toBeNull()
    expect(normalizeResourceUri('  ')).toBeNull()
  })

  it('rejects non-HTTPS, query, fragment, and user-info resource URIs', () => {
    for (const value of [
      'http://api.dondone.dev',
      'https://api.dondone.dev?tenant=one',
      'https://api.dondone.dev/#fragment',
      'https://user:pass@api.dondone.dev',
    ]) {
      expect(() => normalizeResourceUri(value)).toThrow(ApiError)
    }
  })
})
