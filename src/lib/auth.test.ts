import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  buildAuthorizationUrl,
  buildTokenExchangeBody,
  handleCallback,
  normalizeScopes,
  startLogin,
  type OAuthTransaction,
} from './auth'

class MemoryStorage {
  private readonly values = new Map<string, string>()

  getItem(key: string) {
    return this.values.get(key) ?? null
  }

  setItem(key: string, value: string) {
    this.values.set(key, value)
  }

  removeItem(key: string) {
    this.values.delete(key)
  }
}

const transaction: OAuthTransaction = {
  state: 'fixed-state',
  verifier: 'fixed-verifier',
  resource: 'https://api.dondone.dev',
  scopes: ['api:echo'],
}

describe('resource-aware OAuth flow', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('normalizes scopes by whitespace and removes duplicates', () => {
    expect(normalizeScopes('  api:echo\tapi:echo\n risk:read  ')).toEqual([
      'api:echo',
      'risk:read',
    ])
  })

  it('binds the configured resource and normalized scopes to authorization', () => {
    const url = buildAuthorizationUrl({
      authBase: 'https://auth.dondone.dev',
      clientId: 'console',
      redirectUri: 'https://console.dondone.dev/auth/callback',
      challenge: 'fixed-challenge',
      transaction,
    })

    expect(url.origin).toBe('https://auth.dondone.dev')
    expect(url.searchParams.get('client_id')).toBe('console')
    expect(url.searchParams.get('state')).toBe(transaction.state)
    expect(url.searchParams.get('code_challenge')).toBe('fixed-challenge')
    expect(url.searchParams.get('code_challenge_method')).toBe('S256')
    expect(url.searchParams.get('resource')).toBe(transaction.resource)
    expect(url.searchParams.get('scope')).toBe('api:echo')
  })

  it('exchanges the code with exactly the resource and scopes bound at authorization', () => {
    const body = buildTokenExchangeBody({
      clientId: 'console',
      redirectUri: 'https://console.dondone.dev/auth/callback',
      code: 'authorization-code',
      transaction,
    })

    expect(body).toEqual({
      client_id: 'console',
      redirect_uri: 'https://console.dondone.dev/auth/callback',
      code: 'authorization-code',
      code_verifier: transaction.verifier,
      resource: transaction.resource,
      scope: 'api:echo',
    })
  })

  it('preserves state, PKCE, resource, and scope through the browser callback', async () => {
    const location = {
      origin: 'https://console.dondone.dev',
      search: '',
      href: '',
    }
    vi.stubGlobal('window', { location })
    vi.stubGlobal('sessionStorage', new MemoryStorage())
    vi.stubGlobal('localStorage', new MemoryStorage())

    const accessToken = `header.${btoa(JSON.stringify({ email: 'admin@example.com' }))}.sig`
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ access_token: accessToken, refresh_token: 'refresh' }),
    })
    vi.stubGlobal('fetch', fetchMock)

    const config = {
      authBase: 'https://auth.dondone.dev',
      clientId: 'console',
      resource: 'https://api.dondone.dev',
      scopes: ['api:echo'],
    }
    await startLogin(config)
    const authorizationUrl = new URL(location.href)
    location.search = `?code=code&state=${authorizationUrl.searchParams.get('state')}&resource=https%3A%2F%2Fevil.example&scope=admin%3Aall`

    await handleCallback(config)

    const request = fetchMock.mock.calls[0][1] as RequestInit
    const body = JSON.parse(request.body as string) as Record<string, string>
    expect(body.code_verifier).toBeTruthy()
    expect(body.resource).toBe(authorizationUrl.searchParams.get('resource'))
    expect(body.scope).toBe(authorizationUrl.searchParams.get('scope'))
  })

  it('uses deployable defaults when Vite auth variables are absent', async () => {
    const location = {
      origin: 'https://console.dondone.dev',
      search: '',
      href: '',
    }
    vi.stubGlobal('window', { location })
    vi.stubGlobal('sessionStorage', new MemoryStorage())

    await startLogin()

    const url = new URL(location.href)
    expect(url.toString()).not.toContain('undefined')
    expect(url.origin).toBe('https://auth.dondone.dev')
    expect(url.searchParams.get('client_id')).toBe('console')
    expect(url.searchParams.get('resource')).toBe('https://api.dondone.dev')
    expect(url.searchParams.get('scope')).toBe('api:echo')
  })

  it('rejects a state mismatch without exchanging the code', async () => {
    const location = {
      origin: 'https://console.dondone.dev',
      search: '',
      href: '',
    }
    vi.stubGlobal('window', { location })
    vi.stubGlobal('sessionStorage', new MemoryStorage())
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    await startLogin({
      authBase: 'https://auth.dondone.dev',
      clientId: 'console',
      resource: 'https://api.dondone.dev',
      scopes: ['api:echo'],
    })
    location.search = '?code=code&state=wrong-state'

    await expect(handleCallback()).rejects.toThrow('Invalid authorization response.')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('consumes the OAuth transaction so a callback cannot be replayed', async () => {
    const location = {
      origin: 'https://console.dondone.dev',
      search: '',
      href: '',
    }
    vi.stubGlobal('window', { location })
    vi.stubGlobal('sessionStorage', new MemoryStorage())
    vi.stubGlobal('localStorage', new MemoryStorage())
    const accessToken = `header.${btoa(JSON.stringify({ email: 'admin@example.com' }))}.sig`
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ access_token: accessToken, refresh_token: 'refresh' }),
    })
    vi.stubGlobal('fetch', fetchMock)
    const config = {
      authBase: 'https://auth.dondone.dev',
      clientId: 'console',
      resource: 'https://api.dondone.dev',
      scopes: ['api:echo'],
    }

    await startLogin(config)
    const authorizationUrl = new URL(location.href)
    location.search = `?code=code&state=${authorizationUrl.searchParams.get('state')}`
    await handleCallback(config)

    await expect(handleCallback(config)).rejects.toThrow(
      'Invalid authorization response.'
    )
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('fails closed for the legacy split PKCE storage format', async () => {
    const location = {
      origin: 'https://console.dondone.dev',
      search: '?code=code&state=legacy-state',
      href: '',
    }
    const storage = new MemoryStorage()
    storage.setItem('pkce_state', 'legacy-state')
    storage.setItem('pkce_verifier', 'legacy-verifier')
    vi.stubGlobal('window', { location })
    vi.stubGlobal('sessionStorage', storage)
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    await expect(handleCallback()).rejects.toThrow('Invalid authorization response.')
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
