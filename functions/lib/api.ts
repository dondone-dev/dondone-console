import { createConsoleStore } from './store'
import { ApiError, type ConsoleEnv, type ConsoleStore, type SupabaseUser } from './types'
import { normalizeResourceUri } from './validation'

export async function handleConsoleApi(
  request: Request,
  env: ConsoleEnv,
  store: ConsoleStore = createConsoleStore(env)
): Promise<Response> {
  if (request.method === 'OPTIONS') return optionsResponse(request)

  try {
    const url = new URL(request.url)
    const path = url.pathname.replace(/^\/api\/?/, '')
    const auth = await requireUser(request, store)
    requireActiveProfile(await store.ensureProfile(auth.user))

    if (request.method === 'GET' && path === 'me') {
      return jsonResponse(request, await mePayload(store, auth.user))
    }

    if (request.method === 'POST' && path === 'bootstrap') {
      return jsonResponse(request, await bootstrap(env, store, auth.user))
    }

    await requireAdmin(store, auth.user.id)

    if (request.method === 'GET' && path === 'users') {
      const limit = numberParam(url.searchParams.get('limit'), 50)
      const offset = numberParam(url.searchParams.get('offset'), 0)
      return jsonResponse(
        request,
        await store.listUsers({
          search: url.searchParams.get('search'),
          status: url.searchParams.get('status'),
          limit,
          offset,
        })
      )
    }

    const userDetailMatch = path.match(/^users\/([^/]+)$/)
    if (request.method === 'GET' && userDetailMatch) {
      const detail = await store.getUserDetail(userDetailMatch[1])
      if (!detail) throw new ApiError(404, 'not_found')
      return jsonResponse(request, detail)
    }

    const userGroupsMatch = path.match(/^users\/([^/]+)\/groups$/)
    if (request.method === 'PUT' && userGroupsMatch) {
      const body = await readJsonObject(request)
      const grants = parseGroupGrants(body.grants)
      return jsonResponse(
        request,
        await store.replaceUserGroups({
          userId: userGroupsMatch[1],
          grants,
          grantedBy: auth.user.id,
        })
      )
    }

    if (request.method === 'GET' && path === 'services') {
      return jsonResponse(request, { services: await store.listServices() })
    }

    if (request.method === 'POST' && path === 'services') {
      const body = await readJsonObject(request)
      return jsonResponse(
        request,
        await store.createService({
          key: stringField(body, 'key'),
          name: stringField(body, 'name'),
          description: optionalStringField(body, 'description'),
          redirect_uris: requireStringArray(body, 'redirect_uris'),
          resource_uri: normalizeResourceUri(optionalStringField(body, 'resource_uri')),
        }),
        { status: 201 }
      )
    }

    const createGroupMatch = path.match(/^services\/([^/]+)\/groups$/)
    if (request.method === 'POST' && createGroupMatch) {
      const body = await readJsonObject(request)
      return jsonResponse(
        request,
        await store.createGroup(createGroupMatch[1], {
          key: stringField(body, 'key'),
          name: stringField(body, 'name'),
          description: optionalStringField(body, 'description'),
          permission_keys: requireStringArray(body, 'permission_keys'),
          actor: auth.user.id,
        }),
        { status: 201 }
      )
    }

    const updateGroupMatch = path.match(/^services\/([^/]+)\/groups\/([^/]+)$/)
    if (request.method === 'PUT' && updateGroupMatch) {
      const body = await readJsonObject(request)
      return jsonResponse(
        request,
        await store.updateGroup(updateGroupMatch[1], updateGroupMatch[2], {
          name: stringField(body, 'name'),
          description: optionalStringField(body, 'description'),
          status: enumField(body, 'status', ['active', 'disabled']),
          permission_keys: requireStringArray(body, 'permission_keys'),
          actor: auth.user.id,
        })
      )
    }

    const updateServiceMatch = path.match(/^services\/([^/]+)$/)
    if (request.method === 'PUT' && updateServiceMatch) {
      const body = await readJsonObject(request)
      return jsonResponse(
        request,
        await store.updateService(updateServiceMatch[1], {
          name: stringField(body, 'name'),
          description: optionalStringField(body, 'description'),
          status: enumField(body, 'status', ['active', 'disabled']),
          redirect_uris: requireStringArray(body, 'redirect_uris'),
          resource_uri: normalizeResourceUri(optionalStringField(body, 'resource_uri')),
        })
      )
    }

    if (request.method === 'DELETE' && updateServiceMatch) {
      await store.deleteService(updateServiceMatch[1])
      return jsonResponse(request, { deleted: true }, { status: 200 })
    }

    const capVersionsMatch = path.match(/^services\/([^/]+)\/capability-versions$/)
    if (request.method === 'GET' && capVersionsMatch) {
      return jsonResponse(
        request,
        { versions: await store.listCapabilityVersions(capVersionsMatch[1]) }
      )
    }

    const activeCapMatch = path.match(/^services\/([^/]+)\/capabilities$/)
    if (request.method === 'GET' && activeCapMatch) {
      return jsonResponse(
        request,
        { capabilities: await store.listActiveCapabilities(activeCapMatch[1]) }
      )
    }

    throw new ApiError(404, 'not_found')
  } catch (error) {
    const apiError = error instanceof ApiError ? error : mapDbError(error)
    if (apiError) {
      const body: { error: string; message?: string } = { error: apiError.error }
      if (apiError.message !== apiError.error) body.message = apiError.message
      return jsonResponse(request, body, { status: apiError.status })
    }
    return jsonResponse(request, { error: 'internal_error' }, { status: 500 })
  }
}

function requireActiveProfile(profile: { status: 'active' | 'disabled' }): void {
  if (profile.status !== 'active') {
    throw new ApiError(403, 'user_disabled')
  }
}

function mapDbError(error: unknown): ApiError | null {
  const pgError = error as { code?: string; message?: string; details?: string; constraint?: string } | null
  if (!pgError || typeof pgError.code !== 'string') return null
  if (pgError.code === '23503') {
    return new ApiError(
      400,
      'invalid_reference',
      pgError.details ?? pgError.message ?? 'A referenced record does not exist.'
    )
  }
  if (pgError.code === '23505') {
    if (
      pgError.constraint === 'services_resource_uri_unique' ||
      pgError.message?.includes('services_resource_uri_unique')
    ) {
      return new ApiError(409, 'resource_uri_already_exists', 'This resource URI is already registered.')
    }
    return new ApiError(
      409,
      'already_exists',
      pgError.details ?? pgError.message ?? 'A record with this key already exists.'
    )
  }
  if (pgError.code === '23514' || pgError.code === '22023') {
    const message = pgError.message ?? 'The requested operation violates an authorization constraint.'
    if (message.includes('resource_uri_locked')) {
      return new ApiError(
        409,
        'resource_uri_locked',
        'Resource URI cannot change after a capability catalog has been activated.'
      )
    }
    return new ApiError(400, message.includes('system_role_read_only') ? 'system_role_read_only' : 'invalid_request', message)
  }
  return null
}

async function requireUser(
  request: Request,
  store: ConsoleStore
): Promise<{ user: SupabaseUser }> {
  const authorization = request.headers.get('Authorization')
  const token = authorization?.match(/^Bearer\s+(.+)$/i)?.[1]
  if (!token) throw new ApiError(401, 'missing_token')

  try {
    const user = await store.getUser(token)
    return { user }
  } catch {
    throw new ApiError(401, 'invalid_token')
  }
}

async function mePayload(store: ConsoleStore, user: SupabaseUser) {
  const profile = await store.getProfile(user.id)
  const permissions = await store.getEffectivePermissions(user.id)
  return {
    user,
    profile,
    console_admin: permissions.includes('console:admin'),
    permissions,
  }
}

async function requireAdmin(store: ConsoleStore, userId: string): Promise<void> {
  const permissions = await store.getEffectivePermissions(userId)
  if (!permissions.includes('console:admin')) {
    throw new ApiError(403, 'forbidden')
  }
}

async function bootstrap(
  env: ConsoleEnv,
  store: ConsoleStore,
  user: SupabaseUser
) {
  const email = user.email?.toLowerCase()
  const allowlist = env.CONSOLE_BOOTSTRAP_EMAILS
    .split(',')
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean)
  if (!email || !allowlist.includes(email)) {
    throw new ApiError(403, 'forbidden')
  }

  const permissions = await store.getEffectivePermissions(user.id)
  if (!permissions.includes('console:admin')) {
    await store.grantConsoleAdmin(user.id)
  }

  return { ok: true, console_admin: true }
}

async function readJsonObject(request: Request): Promise<Record<string, unknown>> {
  try {
    const value = await request.json()
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new Error('invalid')
    }
    return value as Record<string, unknown>
  } catch {
    throw new ApiError(400, 'invalid_json')
  }
}

function parseGroupGrants(value: unknown) {
  if (!Array.isArray(value)) throw new ApiError(400, 'invalid_grants')
  return value.map((grant) => {
    if (!grant || typeof grant !== 'object' || Array.isArray(grant)) {
      throw new ApiError(400, 'invalid_grants')
    }
    const object = grant as Record<string, unknown>
    const groupId = stringField(object, 'group_id')
    const expiresAt = optionalStringField(object, 'expires_at')
    if (expiresAt !== null && (!expiresAt.includes('T') || !Number.isFinite(Date.parse(expiresAt)))) {
      throw new ApiError(400, 'invalid_expiry', 'expires_at must be an ISO 8601 timestamp or null.')
    }
    return { group_id: groupId, expires_at: expiresAt }
  })
}

function stringField(body: Record<string, unknown>, key: string): string {
  const value = body[key]
  if (typeof value !== 'string' || value.trim() === '') {
    throw new ApiError(400, 'missing_field')
  }
  return value.trim()
}

function optionalStringField(
  body: Record<string, unknown>,
  key: string
): string | null {
  const value = body[key]
  if (value === undefined || value === null || value === '') return null
  if (typeof value !== 'string') throw new ApiError(400, 'invalid_field')
  return value
}

function requireStringArray(body: Record<string, unknown>, key: string): string[] {
  const value = body[key]
  if (!Array.isArray(value) || !value.every((item): item is string => typeof item === 'string')) {
    throw new ApiError(400, 'invalid_field', `${key} must be an array of strings.`)
  }
  return value
}

function enumField<T extends string>(
  body: Record<string, unknown>,
  key: string,
  options: readonly T[]
): T {
  const value = body[key]
  if (typeof value !== 'string' || !options.includes(value as T)) {
    throw new ApiError(400, 'invalid_field')
  }
  return value as T
}

function numberParam(value: string | null, fallback: number): number {
  if (!value) return fallback
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function jsonResponse(
  request: Request,
  data: unknown,
  init: ResponseInit = {}
): Response {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: responseHeaders(request, init.headers),
  })
}

function optionsResponse(request: Request): Response {
  return new Response(null, {
    status: 204,
    headers: responseHeaders(request, {
      'Access-Control-Allow-Methods': 'GET,POST,PUT,OPTIONS',
      'Access-Control-Allow-Headers': 'authorization,content-type',
      'Access-Control-Max-Age': '600',
    }),
  })
}

function responseHeaders(request: Request, extra?: HeadersInit): Headers {
  const headers = new Headers(extra)
  headers.set('Content-Type', headers.get('Content-Type') ?? 'application/json')
  headers.set('Cache-Control', 'no-store')
  headers.set('Vary', 'Origin')
  const origin = request.headers.get('Origin')
  if (origin) headers.set('Access-Control-Allow-Origin', origin)
  return headers
}
