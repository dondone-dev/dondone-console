import { describe, expect, it } from 'vitest'
import type { Service } from './api'
import {
  assessIntegrationReadiness,
  buildBrowserQuickStart,
  buildOAuthIntegrationConfig,
  serializeOAuthIntegrationConfig,
} from './oauth-integration'
import type { ScopeLoadState } from './oauth-integration'

const service: Service = {
  key: 'notes',
  name: 'Notes',
  description: null,
  status: 'active',
  redirect_uris: ['https://notes.example/auth/callback'],
  groups: [],
  resource_uri: 'https://api.notes.example',
  capability_sync_status: 'active',
  active_capability_version: '2026-07-15',
  capability_last_synced_at: null,
  capability_last_error: null,
  has_capability_versions: true,
  default_group_id: null,
}

describe('buildOAuthIntegrationConfig', () => {
  it('builds a deterministic secret-free export', () => {
    expect(
      buildOAuthIntegrationConfig(service, 'https://auth.dondone.dev/', [
        'notes:write',
        'notes:read',
        'notes:read',
      ])
    ).toEqual({
      schema_version: 1,
      client_id: 'notes',
      auth_base: 'https://auth.dondone.dev',
      redirect_uris: ['https://notes.example/auth/callback'],
      resource: 'https://api.notes.example',
      scopes: ['notes:read', 'notes:write'],
      token_endpoint_auth_method: 'none',
    })
  })

  it('rejects a service without a resource URI', () => {
    expect(() =>
      buildOAuthIntegrationConfig(
        { ...service, resource_uri: null },
        'https://auth.dondone.dev',
        ['notes:read']
      )
    ).toThrow('without a resource URI')
  })

  it.each(['', '   ', 'not a URL'])(
    'rejects an invalid auth base %j',
    (authBase) => {
      expect(() =>
        buildOAuthIntegrationConfig(service, authBase, ['notes:read'])
      ).toThrow('valid auth base URL')
    }
  )

  it('normalizes whitespace and trailing slashes in the auth base', () => {
    const config = buildOAuthIntegrationConfig(
      service,
      '  https://auth.dondone.dev///  ',
      ['notes:read']
    )
    expect(config.auth_base).toBe('https://auth.dondone.dev')
  })

  it('serializes with a trailing newline', () => {
    const config = buildOAuthIntegrationConfig(
      service,
      'https://auth.dondone.dev',
      ['notes:read']
    )
    expect(serializeOAuthIntegrationConfig(config)).toBe(
      `${JSON.stringify(config, null, 2)}\n`
    )
  })
})

describe('assessIntegrationReadiness', () => {
  it('is ready only when every required condition passes', () => {
    const items = assessIntegrationReadiness(service, {
      scopesStatus: 'success',
      scopes: ['notes:read'],
    })
    expect(items.every((item) => item.ok)).toBe(true)
  })

  const readinessCases: Array<
    [string, Service, ScopeLoadState['scopesStatus'], string[]]
  > = [
    [
      'Service active',
      { ...service, status: 'disabled' as const },
      'success',
      ['notes:read'],
    ],
    [
      'Callback URLs configured',
      { ...service, redirect_uris: [] },
      'success',
      ['notes:read'],
    ],
    [
      'Resource URI configured',
      { ...service, resource_uri: null },
      'success',
      ['notes:read'],
    ],
    [
      'Approved catalog active',
      { ...service, active_capability_version: null },
      'success',
      ['notes:read'],
    ],
    ['Approved OAuth scopes loaded', service, 'error', ['notes:read']],
    ['At least one OAuth scope available', service, 'success', []],
  ]

  it.each(readinessCases)(
    'fails %s independently',
    (label, candidate, scopesStatus, scopes) => {
      const item = assessIntegrationReadiness(candidate, {
        scopesStatus,
        scopes: [...scopes],
      }).find((result) => result.label === label)
      expect(item?.ok).toBe(false)
    }
  )

  it('keeps pending scope loading distinct from an empty scope list', () => {
    const pending = assessIntegrationReadiness(service, {
      scopesStatus: 'pending',
      scopes: [],
    })
    expect(
      pending.find((item) => item.label === 'Approved OAuth scopes loaded')
    ).toMatchObject({ ok: false, detail: 'Loading approved OAuth scopes…' })
  })
})

describe('buildBrowserQuickStart', () => {
  it('generates browser-compatible PKCE code from live config', () => {
    const config = buildOAuthIntegrationConfig(
      service,
      'https://auth.dondone.dev',
      ['notes:read']
    )
    const snippet = buildBrowserQuickStart(config)
    expect(snippet).toContain("clientId: 'notes'")
    expect(snippet).toContain("resource: 'https://api.notes.example'")
    expect(snippet).toContain("scopes: ['notes:read']")
    expect(snippet).toContain('crypto.subtle.digest')
    expect(snippet).toContain(
      "sessionStorage.setItem('dondone_oauth_transaction'"
    )
    expect(snippet).toContain('allowedRedirectUris.includes(redirectUri)')
    expect(snippet).toContain("url.searchParams.set('scope'")
    expect(snippet).not.toContain('node:crypto')
    expect(snippet).not.toContain('YOUR_REDIRECT_URI')
    expect(snippet).not.toContain('client_secret')
  })
})
