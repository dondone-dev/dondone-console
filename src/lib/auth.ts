const AUTH_BASE = import.meta.env.VITE_AUTH_BASE as string
const CLIENT_ID = import.meta.env.VITE_AUTH_CLIENT_ID as string

export interface Session {
  accessToken: string
  refreshToken: string
  email: string
}

const SESSION_KEY = 'dondone_console_session'

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

export async function startLogin(): Promise<void> {
  const state = randomValue(16)
  const verifier = randomValue(32)
  const challenge = await deriveChallenge(verifier)
  sessionStorage.setItem('pkce_state', state)
  sessionStorage.setItem('pkce_verifier', verifier)

  const redirectUri = `${window.location.origin}/auth/callback`
  const url = new URL(`${AUTH_BASE}/`)
  url.searchParams.set('client_id', CLIENT_ID)
  url.searchParams.set('redirect_uri', redirectUri)
  url.searchParams.set('state', state)
  url.searchParams.set('code_challenge', challenge)
  url.searchParams.set('code_challenge_method', 'S256')
  window.location.href = url.toString()
}

export async function handleCallback(): Promise<Session> {
  const params = new URLSearchParams(window.location.search)
  const code = params.get('code')
  const returnedState = params.get('state')
  const state = sessionStorage.getItem('pkce_state')
  const verifier = sessionStorage.getItem('pkce_verifier')
  sessionStorage.removeItem('pkce_state')
  sessionStorage.removeItem('pkce_verifier')

  if (!code || !returnedState || returnedState !== state || !verifier) {
    throw new Error('Invalid authorization response.')
  }

  const redirectUri = `${window.location.origin}/auth/callback`
  const response = await fetch(`${AUTH_BASE}/api/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: CLIENT_ID,
      redirect_uri: redirectUri,
      code,
      code_verifier: verifier,
    }),
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
