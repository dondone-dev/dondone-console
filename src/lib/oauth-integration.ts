import type { Service } from './api'

export interface OAuthIntegrationConfig {
  schema_version: 1
  client_id: string
  auth_base: string
  redirect_uris: string[]
  resource: string
  scopes: string[]
  token_endpoint_auth_method: 'none'
}

export interface IntegrationReadinessItem {
  label: string
  ok: boolean
  detail: string
}

export interface ScopeLoadState {
  scopesStatus: 'pending' | 'success' | 'error'
  scopes: string[]
}

export function buildOAuthIntegrationConfig(
  service: Service,
  authBase: string,
  scopeKeys: string[]
): OAuthIntegrationConfig {
  if (!service.resource_uri) {
    throw new Error(
      'Cannot build OAuth integration config without a resource URI.'
    )
  }

  const normalizedAuthBase = normalizeAuthBase(authBase)

  return {
    schema_version: 1,
    client_id: service.key,
    auth_base: normalizedAuthBase,
    redirect_uris: [...service.redirect_uris],
    resource: service.resource_uri,
    scopes: [...new Set(scopeKeys)].sort(),
    token_endpoint_auth_method: 'none',
  }
}

function normalizeAuthBase(value: string): string {
  let url: URL
  try {
    url = new URL(value.trim().replace(/\/+$/, ''))
  } catch {
    throw new Error('OAuth integration requires a valid auth base URL.')
  }
  if (
    !['https:', 'http:'].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== '/'
  ) {
    throw new Error('OAuth integration requires a valid auth base URL.')
  }
  return url.origin
}

export function assessIntegrationReadiness(
  service: Service,
  scopeState: ScopeLoadState
): IntegrationReadinessItem[] {
  const scopesLoaded = scopeState.scopesStatus === 'success'

  return [
    {
      label: 'Service active',
      ok: service.status === 'active',
      detail:
        service.status === 'active'
          ? 'The OAuth client is active.'
          : 'Activate this service in the Details tab.',
    },
    {
      label: 'Callback URLs configured',
      ok: service.redirect_uris.length > 0,
      detail:
        service.redirect_uris.length > 0
          ? service.redirect_uris.join(', ')
          : 'Add at least one callback URL in the Details tab.',
    },
    {
      label: 'Resource URI configured',
      ok: Boolean(service.resource_uri),
      detail:
        service.resource_uri ?? 'Set a protected resource URI in the Details tab.',
    },
    {
      label: 'Approved catalog active',
      ok: Boolean(service.active_capability_version),
      detail: service.active_capability_version
        ? `Active version: ${service.active_capability_version}`
        : 'Sync and approve a capability catalog.',
    },
    {
      label: 'Approved OAuth scopes loaded',
      ok: scopesLoaded,
      detail:
        scopeState.scopesStatus === 'pending'
          ? 'Loading approved OAuth scopes…'
          : scopeState.scopesStatus === 'error'
            ? 'Could not load approved OAuth scopes.'
            : `${scopeState.scopes.length} OAuth scope${scopeState.scopes.length === 1 ? '' : 's'} loaded.`,
    },
    {
      label: 'At least one OAuth scope available',
      ok: scopesLoaded && scopeState.scopes.length > 0,
      detail:
        scopesLoaded && scopeState.scopes.length > 0
          ? scopeState.scopes.join(', ')
          : 'Approve a catalog containing at least one OAuth scope.',
    },
  ]
}

export function serializeOAuthIntegrationConfig(
  config: OAuthIntegrationConfig
): string {
  return `${JSON.stringify(config, null, 2)}\n`
}

function javascriptString(value: string): string {
  return `'${value
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/\r/g, '\\r')
    .replace(/\n/g, '\\n')}'`
}

export function buildBrowserQuickStart(
  config: OAuthIntegrationConfig
): string {
  const redirectUris = config.redirect_uris.map(javascriptString).join(', ')
  const scopes = config.scopes.map(javascriptString).join(', ')

  return `const dondoneConfig = {
  authBase: ${javascriptString(config.auth_base)},
  clientId: ${javascriptString(config.client_id)},
  resource: ${javascriptString(config.resource)},
  scopes: [${scopes}],
  allowedRedirectUris: [${redirectUris}],
}

const transactionKey = 'dondone_oauth_transaction'

function base64url(bytes) {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
    .replace(/\\+/g, '-')
    .replace(/\\//g, '_')
    .replace(/=+$/g, '')
}

function randomValue(size) {
  return base64url(crypto.getRandomValues(new Uint8Array(size)))
}

async function deriveChallenge(verifier) {
  const data = new TextEncoder().encode(verifier)
  const digest = await crypto.subtle.digest('SHA-256', data)
  return base64url(new Uint8Array(digest))
}

export async function startDondoneLogin() {
  const redirectUri = \`\${window.location.origin}/auth/callback\`
  const { authBase, clientId, resource, scopes, allowedRedirectUris } = dondoneConfig

  if (!allowedRedirectUris.includes(redirectUri)) {
    throw new Error(\`OAuth callback is not registered: \${redirectUri}\`)
  }

  const state = randomValue(16)
  const verifier = randomValue(32)
  const challenge = await deriveChallenge(verifier)
  sessionStorage.setItem('dondone_oauth_transaction', JSON.stringify({ state, verifier }))

  const url = new URL(\`\${authBase}/\`)
  url.searchParams.set('client_id', clientId)
  url.searchParams.set('redirect_uri', redirectUri)
  url.searchParams.set('state', state)
  url.searchParams.set('code_challenge', challenge)
  url.searchParams.set('code_challenge_method', 'S256')
  url.searchParams.set('resource', resource)
  url.searchParams.set('scope', scopes.join(' '))
  window.location.assign(url.toString())
}

export async function handleDondoneCallback() {
  const params = new URLSearchParams(window.location.search)
  const code = params.get('code')
  const returnedState = params.get('state')
  const rawTransaction = sessionStorage.getItem(transactionKey)
  sessionStorage.removeItem(transactionKey)

  if (!code || !returnedState || !rawTransaction) {
    throw new Error('Invalid OAuth callback.')
  }

  const transaction = JSON.parse(rawTransaction)
  if (returnedState !== transaction.state || typeof transaction.verifier !== 'string') {
    throw new Error('OAuth state validation failed.')
  }

  const redirectUri = \`\${window.location.origin}/auth/callback\`
  const { authBase, clientId, resource, scopes } = dondoneConfig
  const response = await fetch(\`\${authBase}/api/token\`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: clientId,
      redirect_uri: redirectUri,
      code,
      code_verifier: transaction.verifier,
      resource,
      scope: scopes.join(' '),
    }),
  })
  const tokens = await response.json()
  if (!response.ok) {
    throw new Error(tokens.message ?? tokens.error ?? 'Token exchange failed.')
  }
  return tokens
}
`
}
