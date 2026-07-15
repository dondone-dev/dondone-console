export interface OAuthTransaction {
  state: string
  verifier: string
  resource: string
  scopes: string[]
}

export interface OAuthClientConfig {
  authBase: string
  clientId: string
  resource: string
  scopes: string[]
}

export function normalizeScopes(scope: string): string[] {
  return [...new Set(scope.split(/\s+/).filter(Boolean))]
}

function requiredOAuthEnv(env: Record<string, unknown>, name: string): string {
  const value = env[name]
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`Missing required OAuth configuration: ${name}.`)
  }
  return value.trim()
}

export function oauthClientConfigFromEnv(env: Record<string, unknown>): OAuthClientConfig {
  const authBase = requiredOAuthEnv(env, 'VITE_AUTH_BASE')
  const clientId = requiredOAuthEnv(env, 'VITE_AUTH_CLIENT_ID')
  const resource = requiredOAuthEnv(env, 'VITE_AUTH_RESOURCE')
  const scopes = normalizeScopes(requiredOAuthEnv(env, 'VITE_AUTH_SCOPE'))
  return { authBase, clientId, resource, scopes }
}

export interface Session {
  accessToken: string
  refreshToken: string
  email: string
}

const SESSION_KEY = 'dondone_console_session'
const OAUTH_TRANSACTION_KEY = 'dondone_console_oauth_transaction'

function base64url(input: ArrayBuffer | Uint8Array): string {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input)
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

async function deriveChallenge(verifier: string): Promise<string> {
  const data = new TextEncoder().encode(verifier)
  return base64url(await crypto.subtle.digest('SHA-256', data))
}

function randomValue(size: number): string {
  return base64url(crypto.getRandomValues(new Uint8Array(size)))
}

export function buildAuthorizationUrl(params: {
  authBase: string
  clientId: string
  redirectUri: string
  challenge: string
  transaction: OAuthTransaction
}): URL {
  const url = new URL(`${params.authBase}/`)
  url.searchParams.set('client_id', params.clientId)
  url.searchParams.set('redirect_uri', params.redirectUri)
  url.searchParams.set('state', params.transaction.state)
  url.searchParams.set('code_challenge', params.challenge)
  url.searchParams.set('code_challenge_method', 'S256')
  url.searchParams.set('resource', params.transaction.resource)
  url.searchParams.set('scope', params.transaction.scopes.join(' '))
  return url
}

export function buildTokenExchangeBody(params: {
  clientId: string
  redirectUri: string
  code: string
  transaction: OAuthTransaction
}) {
  return {
    client_id: params.clientId,
    redirect_uri: params.redirectUri,
    code: params.code,
    code_verifier: params.transaction.verifier,
    resource: params.transaction.resource,
    scope: params.transaction.scopes.join(' '),
  }
}

function readOAuthTransaction(): OAuthTransaction | null {
  try {
    const raw = sessionStorage.getItem(OAUTH_TRANSACTION_KEY)
    if (!raw) return null
    const value = JSON.parse(raw) as Partial<OAuthTransaction>
    if (
      typeof value.state !== 'string' ||
      typeof value.verifier !== 'string' ||
      typeof value.resource !== 'string' ||
      !Array.isArray(value.scopes) ||
      !value.scopes.every((scope) => typeof scope === 'string')
    ) {
      return null
    }
    return {
      state: value.state,
      verifier: value.verifier,
      resource: value.resource,
      scopes: normalizeScopes(value.scopes.join(' ')),
    }
  } catch {
    return null
  }
}

export async function startLogin(
  config?: OAuthClientConfig
): Promise<void> {
  const resolvedConfig = config ?? oauthClientConfigFromEnv(import.meta.env)
  const transaction: OAuthTransaction = {
    state: randomValue(16),
    verifier: randomValue(32),
    resource: resolvedConfig.resource,
    scopes: resolvedConfig.scopes,
  }
  const challenge = await deriveChallenge(transaction.verifier)
  sessionStorage.setItem(OAUTH_TRANSACTION_KEY, JSON.stringify(transaction))

  const redirectUri = `${window.location.origin}/auth/callback`
  const url = buildAuthorizationUrl({
    authBase: resolvedConfig.authBase,
    clientId: resolvedConfig.clientId,
    redirectUri,
    challenge,
    transaction,
  })
  window.location.href = url.toString()
}

export async function handleCallback(
  config?: OAuthClientConfig
): Promise<Session> {
  const params = new URLSearchParams(window.location.search)
  const code = params.get('code')
  const returnedState = params.get('state')
  const transaction = readOAuthTransaction()
  sessionStorage.removeItem(OAUTH_TRANSACTION_KEY)

  if (
    !code ||
    !returnedState ||
    !transaction ||
    returnedState !== transaction.state
  ) {
    throw new Error('Invalid authorization response.')
  }

  const resolvedConfig = config ?? oauthClientConfigFromEnv(import.meta.env)

  const redirectUri = `${window.location.origin}/auth/callback`
  const response = await fetch(`${resolvedConfig.authBase}/api/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(
      buildTokenExchangeBody({
        clientId: resolvedConfig.clientId,
        redirectUri,
        code,
        transaction,
      })
    ),
  })
  const body = (await response.json()) as {
    access_token?: string
    refresh_token?: string
    error?: string
    message?: string
  }
  if (!response.ok || !body.access_token || !body.refresh_token) {
    throw new Error(body.message ?? body.error ?? 'Token exchange failed.')
  }

  const session = {
    accessToken: body.access_token,
    refreshToken: body.refresh_token,
    email: decodeEmail(body.access_token) ?? '',
  }
  saveSession(session)
  return session
}

export function loadSession(): Session | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY)
    return raw ? (JSON.parse(raw) as Session) : null
  } catch {
    return null
  }
}

export function saveSession(session: Session): void {
  localStorage.setItem(SESSION_KEY, JSON.stringify(session))
}

export function clearSession(): void {
  localStorage.removeItem(SESSION_KEY)
}

function decodeEmail(accessToken: string): string | null {
  try {
    const payload = JSON.parse(
      atob(accessToken.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))
    ) as { email?: unknown }
    return typeof payload.email === 'string' ? payload.email : null
  } catch {
    return null
  }
}
