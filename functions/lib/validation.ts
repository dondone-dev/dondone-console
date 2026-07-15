import { ApiError } from './types'

const SERVICE_KEY_PATTERN = /^[a-z0-9](?:[a-z0-9._-]{0,62}[a-z0-9])?$/

export function assertValidServiceKey(key: string): void {
  if (!SERVICE_KEY_PATTERN.test(key)) {
    throw new ApiError(
      400,
      'invalid_service_key',
      'Service key must be 1-64 lowercase alphanumeric characters, dots, underscores, or hyphens, and must start and end with a letter or number.'
    )
  }
}

export function assertValidRedirectUris(redirectUris: string[]): void {
  for (const uri of redirectUris) {
    let parsed: URL
    try {
      parsed = new URL(uri)
    } catch {
      throw new ApiError(
        400,
        'invalid_redirect_uri',
        `Invalid redirect URI: ${uri}. Must be an absolute URL.`
      )
    }

    const isLoopback = parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1'
    if (parsed.protocol !== 'https:' && !(parsed.protocol === 'http:' && isLoopback)) {
      throw new ApiError(
        400,
        'invalid_redirect_uri',
        `Invalid redirect URI: ${uri}. Must use https, or http only for localhost/127.0.0.1.`
      )
    }
    if (parsed.hash) {
      throw new ApiError(
        400,
        'invalid_redirect_uri',
        `Invalid redirect URI: ${uri}. Must not contain a fragment.`
      )
    }
    if (parsed.username || parsed.password) {
      throw new ApiError(
        400,
        'invalid_redirect_uri',
        `Invalid redirect URI: ${uri}. Must not contain user info.`
      )
    }
  }
}

export function normalizeResourceUri(value: string | null): string | null {
  const trimmed = value?.trim() ?? ''
  if (!trimmed) return null
  let parsed: URL
  try {
    parsed = new URL(trimmed)
  } catch {
    throw new ApiError(400, 'invalid_resource_uri', 'Resource URI must be an absolute HTTPS URL.')
  }
  if (
    parsed.protocol !== 'https:' ||
    parsed.username ||
    parsed.password ||
    parsed.search ||
    parsed.hash
  ) {
    throw new ApiError(
      400,
      'invalid_resource_uri',
      'Resource URI must use HTTPS and must not contain user info, a query, or a fragment.'
    )
  }
  return trimmed
}

export function requireFoundRow<T>(data: T | null, error: unknown): T {
  if (error) throw error
  if (!data) throw new ApiError(404, 'not_found')
  return data
}
