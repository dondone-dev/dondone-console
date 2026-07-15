# Developer OAuth Onboarding MVP — Integration Tab & Config Download

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a Console administrator generate a reliable, secret-free OAuth integration package for a third-party developer: inspect readiness, copy or download `dondone.config.json`, and copy a browser-compatible PKCE quick start.

**Architecture:** Add a read-only Integration tab to the existing Service dialog. A pure `oauth-integration.ts` module owns the exported JSON schema, readiness rules, serialization, and snippet generation; the React tab only fetches approved scopes and renders the results. This MVP changes only `dondone-console`: runtime client discovery, a published SDK, and an end-to-end OAuth test runner are explicitly deferred.

**Tech Stack:** React 19, TypeScript, Vite, TanStack Query, Vitest, shadcn/ui primitives, Web Crypto.

## Product Positioning

This is an **administrator-generated developer handoff**, not public self-service onboarding. The Console user owns or administers the service, downloads or copies the integration package, and gives it to the developer building the client application. A developer without Console access cannot discover arbitrary client configuration in this MVP.

## Resolved Questions

### `.well-known` client discovery

Deferred. `/.well-known/oauth-client/:client_id` is a custom protocol, not OAuth Authorization Server Metadata. The standard server-level endpoint is `/.well-known/oauth-authorization-server`; it may be introduced separately when auth-server metadata is needed. A client-specific public endpoint should only be designed after a concrete runtime-discovery consumer exists and its schema, versioning, caching, CORS, disabled-service behavior, and redirect-URI exposure have been decided.

### Integration self-check

Replaced with a local **Integration readiness** checklist. The previous proposal did not execute an end-to-end OAuth flow and generated a PKCE challenge that could never pass token exchange. A real E2E test requires a dedicated registered callback, persistent verifier/state, an interactive login, and isolation from production callbacks; that is outside this MVP.

## Global Constraints

- This plan changes only the `dondone-console` repository. Do not modify `../dondone-auth`.
- The Integration tab is read-only and uses the same Console authorization boundary as the existing Service dialog.
- Never include `client_secret`, access tokens, refresh tokens, authorization codes, or PKCE verifiers in exported configuration.
- The exported filename is exactly `dondone.config.json`.
- The JSON schema has an explicit `schema_version: 1` and uses snake_case keys.
- Service-owned values in snippets (`auth_base`, `client_id`, `resource`, `scopes`) come from current data. Runtime values such as authorization codes are variables, not hard-coded placeholders.
- Do not expose copy or download actions until the service is active, redirect URIs are present, a resource URI is configured, an active capability catalog exists, and approved scopes loaded successfully with at least one OAuth scope.
- Treat scope loading as a required state: loading and failure must never look like an empty valid scope list.
- Use the browser Web Crypto API for PKCE. Do not import `node:crypto` in client snippets.
- Do not reference a `dondone-auth` npm package; no consumable package exists yet.
- `OAuthClientConfig` in `src/lib/auth.ts` remains the runtime camelCase shape used by the Console login client. `OAuthIntegrationConfig` is the canonical versioned handoff schema; conversion between the two shapes must be explicit.
- Follow the repository's existing Vitest style. The repository does not currently include a DOM component-testing library, so automated tests target pure builders and serializers; UI behavior receives a manual smoke test.

## Exported JSON Contract

```json
{
  "schema_version": 1,
  "client_id": "my-service-key",
  "auth_base": "https://auth.dondone.dev",
  "redirect_uris": ["https://my.app/auth/callback"],
  "resource": "https://api.my.app",
  "scopes": ["api:read", "api:write"],
  "token_endpoint_auth_method": "none"
}
```

`redirect_uris` documents the server registration and helps the recipient choose the correct application origin. The quick start derives its current callback as `${window.location.origin}/auth/callback`; that exact URL must be one of the exported entries before the flow will be accepted.

---

### Task 1: Add the canonical integration config and readiness model

**Files:**
- Create: `src/lib/oauth-integration.ts`
- Create: `src/lib/oauth-integration.test.ts`

**Interfaces:**
- Consumes: `Service` and `ActiveCapability` from `src/lib/api.ts`.
- Produces: `OAuthIntegrationConfig`, `IntegrationReadinessItem`, `buildOAuthIntegrationConfig()`, `assessIntegrationReadiness()`, `serializeOAuthIntegrationConfig()`, and `buildBrowserQuickStart()`.

- [ ] **Step 1: Write failing tests for config construction and serialization**

Create `src/lib/oauth-integration.test.ts` with a `Service` fixture and assertions covering:

```ts
import { describe, expect, it } from 'vitest'
import type { Service } from './api'
import {
  assessIntegrationReadiness,
  buildBrowserQuickStart,
  buildOAuthIntegrationConfig,
  serializeOAuthIntegrationConfig,
} from './oauth-integration'

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
```

- [ ] **Step 2: Write failing tests for every readiness rule**

Add table-driven cases proving that readiness fails independently when the service is disabled, redirect URIs are empty, resource URI is absent, active catalog is absent, scope loading failed, or the approved OAuth scope list is empty. Also prove that the complete fixture is ready:

```ts
describe('assessIntegrationReadiness', () => {
  it('is ready only when every required condition passes', () => {
    const items = assessIntegrationReadiness(service, {
      scopesStatus: 'success',
      scopes: ['notes:read'],
    })
    expect(items.every((item) => item.ok)).toBe(true)
  })

  it.each([
    ['Service active', { ...service, status: 'disabled' as const }, 'success', ['notes:read']],
    ['Callback URLs configured', { ...service, redirect_uris: [] }, 'success', ['notes:read']],
    ['Resource URI configured', { ...service, resource_uri: null }, 'success', ['notes:read']],
    ['Approved catalog active', { ...service, active_capability_version: null }, 'success', ['notes:read']],
    ['Approved OAuth scopes loaded', service, 'error', ['notes:read']],
    ['At least one OAuth scope available', service, 'success', []],
  ] as const)('fails %s independently', (label, candidate, scopesStatus, scopes) => {
    const item = assessIntegrationReadiness(candidate, { scopesStatus, scopes })
      .find((result) => result.label === label)
    expect(item?.ok).toBe(false)
  })
})
```

- [ ] **Step 3: Write a failing quick-start safety test**

```ts
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
  expect(snippet).toContain("sessionStorage.setItem('dondone_oauth_transaction'")
  expect(snippet).not.toContain('node:crypto')
  expect(snippet).not.toContain('YOUR_REDIRECT_URI')
  expect(snippet).not.toContain('client_secret')
})
```

- [ ] **Step 4: Run the tests to verify they fail**

Run: `pnpm vitest run src/lib/oauth-integration.test.ts`

Expected: FAIL because `./oauth-integration` does not exist.

- [ ] **Step 5: Implement the types, config builder, readiness rules, and serializer**

Create `src/lib/oauth-integration.ts` with these public shapes:

```ts
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
    throw new Error('Cannot build OAuth integration config without a resource URI.')
  }
  return {
    schema_version: 1,
    client_id: service.key,
    auth_base: authBase.replace(/\/+$/, ''),
    redirect_uris: [...service.redirect_uris],
    resource: service.resource_uri,
    scopes: [...new Set(scopeKeys)].sort(),
    token_endpoint_auth_method: 'none',
  }
}

export function serializeOAuthIntegrationConfig(
  config: OAuthIntegrationConfig
): string {
  return `${JSON.stringify(config, null, 2)}\n`
}
```

Implement `assessIntegrationReadiness()` as six explicit items matching the labels in Step 2. Scope loading is successful only when `scopesStatus === 'success'`; an error must remain distinct from an empty approved list.

- [ ] **Step 6: Implement a complete browser PKCE snippet generator**

`buildBrowserQuickStart(config)` must return standalone browser TypeScript/JavaScript that:

1. Embeds the live `authBase`, `clientId`, `resource`, and `scopes` values.
2. Uses `crypto.getRandomValues()` and `crypto.subtle.digest('SHA-256', ...)`.
3. Stores `{ state, verifier }` in `sessionStorage` before redirecting.
4. Uses `${window.location.origin}/auth/callback` as `redirect_uri`.
5. Sends `resource` and space-delimited `scope` in both authorization and token requests.
6. Checks returned state before token exchange and removes the transaction after reading it.
7. Throws on a callback URL not listed in `config.redirect_uris` before starting login.

Do not shorten the generated sample with comments such as “implementation omitted.” It must be copyable as a complete helper.

- [ ] **Step 7: Run the focused tests**

Run: `pnpm vitest run src/lib/oauth-integration.test.ts`

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/lib/oauth-integration.ts src/lib/oauth-integration.test.ts
git commit -m "feat: define OAuth integration handoff model"
```

---

### Task 2: Add the Integration tab and readiness UI

**Files:**
- Create: `src/components/services/integration-tab.tsx`
- Modify: `src/components/services/edit-service-dialog.tsx`

**Interfaces:**
- Consumes: `Session`, `Service`, `ActiveCapability`, `apiFetch()`, and the pure helpers from Task 1.
- Produces: `IntegrationTab({ session, service })`, rendered as the fourth Service dialog tab.

- [ ] **Step 1: Add the tab to `EditServiceDialog`**

Extend the tab state union with `'integration'`, render an `Integration` `TabButton` after `Capabilities`, and render:

```tsx
{tab === 'integration' && (
  <IntegrationTab session={session} service={service} />
)}
```

Import `IntegrationTab` from `@/components/services/integration-tab`. Add `max-h-[85svh] overflow-y-auto` to `DialogContent` so the additional content remains usable on a small laptop.

- [ ] **Step 2: Implement capability loading in `IntegrationTab`**

Use the session already passed to `EditServiceDialog`; do not introduce a second session source:

```tsx
const capabilities = useQuery({
  queryKey: ['active-capabilities', service.key],
  queryFn: () =>
    apiFetch<{ capabilities: ActiveCapability[] }>(
      session,
      `/api/services/${service.key}/capabilities`
    ),
  enabled: service.status === 'active',
})

const scopeKeys = useMemo(
  () =>
    (capabilities.data?.capabilities ?? [])
      .filter((capability) => capability.oauth_scope)
      .map((capability) => capability.key),
  [capabilities.data]
)
```

Map query state to `ScopeLoadState` as follows:

- disabled query or pending query → `pending`;
- query error → `error`;
- successful query, including an empty array → `success`.

- [ ] **Step 3: Render the readiness checklist**

Render all six readiness items at all times. Use `ShieldCheck` for passing items and `ShieldX` for failing items. While scopes are loading, the scopes item detail says `Loading approved OAuth scopes…`. On query failure, show a `Retry` button wired to `capabilities.refetch()`.

If any readiness item fails, render no config JSON, download button, or quick-start snippet. Instead show:

```text
Complete the failed readiness checks before sharing integration configuration.
```

This prevents a disabled or partially configured service from producing a package that the auth backend will reject.

- [ ] **Step 4: Build the config only after readiness succeeds**

Read `VITE_AUTH_BASE` directly at the composition boundary:

```tsx
const isReady = readiness.every((item) => item.ok)
const config = isReady
  ? buildOAuthIntegrationConfig(
      service,
      import.meta.env.VITE_AUTH_BASE as string,
      scopeKeys
    )
  : null
```

Do not export or relocate the private `AUTH_BASE` constant in `src/lib/api.ts`; the integration builder receives its value explicitly and stays easy to test.

- [ ] **Step 5: Type-check**

Run: `pnpm tsc -b --noEmit`

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/components/services/integration-tab.tsx src/components/services/edit-service-dialog.tsx
git commit -m "feat: add OAuth integration readiness tab"
```

---

### Task 3: Add config summary, copy, and download

**Files:**
- Modify: `src/components/services/integration-tab.tsx`

**Interfaces:**
- Consumes: a non-null `OAuthIntegrationConfig` created only after readiness succeeds.
- Produces: `ConfigCard`, clipboard feedback, and an exact `dondone.config.json` download.

- [ ] **Step 1: Add a resilient copy button**

Implement a local `CopyButton({ value, label })` using the existing `Button`, `Copy`, and `Check` components. Await `navigator.clipboard.writeText(value)`. Show the checked state only after success; on rejection, call `toast.error('Copy failed')`. Clear the feedback timer on unmount.

- [ ] **Step 2: Render the canonical config values**

Show `client_id`, `auth_base`, `redirect_uris`, `resource`, `scopes`, and `token_endpoint_auth_method`. Arrays are displayed one item per line rather than comma-flattened, so redirect URIs and scope names remain unambiguous. Each row copies its underlying scalar or newline-delimited array value.

- [ ] **Step 3: Add copy-all and download actions**

Use `serializeOAuthIntegrationConfig(config)` for both actions so the clipboard and downloaded bytes cannot drift.

The download helper must:

```ts
function downloadConfig(config: OAuthIntegrationConfig): void {
  const blob = new Blob([serializeOAuthIntegrationConfig(config)], {
    type: 'application/json;charset=utf-8',
  })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = 'dondone.config.json'
  anchor.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 0)
}
```

- [ ] **Step 4: Type-check and lint the changed files**

Run: `pnpm tsc -b --noEmit && pnpm eslint src/components/services/integration-tab.tsx src/lib/oauth-integration.ts`

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/components/services/integration-tab.tsx
git commit -m "feat: add OAuth config copy and download"
```

---

### Task 4: Add the browser PKCE quick start

**Files:**
- Modify: `src/components/services/integration-tab.tsx`

**Interfaces:**
- Consumes: `buildBrowserQuickStart(config)` from Task 1.
- Produces: a copyable, syntax-preserving browser helper generated from the same config shown in the card.

- [ ] **Step 1: Render the quick-start section only when ready**

Render a `Browser PKCE` section below the config card when `config !== null`. Its explanatory copy must state:

```text
This helper uses Web Crypto and stores the PKCE transaction in sessionStorage.
The current app callback must be registered as /auth/callback for its origin.
```

Render `buildBrowserQuickStart(config)` inside an overflow-safe `<pre><code>` block and copy it with the same resilient `CopyButton` behavior.

- [ ] **Step 2: Do not add misleading framework or curl tabs**

Do not include:

- a React import from a nonexistent `dondone-auth` package;
- a browser sample importing `node:crypto`;
- a curl flow using fixed `test` verifier/challenge values;
- fake authorization codes or access tokens.

A framework SDK and a CLI-driven full-flow test are separate future deliverables.

- [ ] **Step 3: Run the focused tests and type-check**

Run:

```bash
pnpm vitest run src/lib/oauth-integration.test.ts
pnpm tsc -b --noEmit
```

Expected: tests pass and TypeScript reports no errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/services/integration-tab.tsx src/lib/oauth-integration.ts src/lib/oauth-integration.test.ts
git commit -m "feat: add browser PKCE onboarding snippet"
```

---

### Task 5: Final verification

- [ ] **Step 1: Run all automated checks**

```bash
pnpm test
pnpm tsc -b --noEmit
pnpm lint
pnpm build
```

Expected: all commands exit successfully.

- [ ] **Step 2: Smoke-test a ready service**

Run `pnpm dev`, open an active service with a callback URL, resource URI, active capability version, and approved OAuth scopes, then verify:

- all six readiness checks pass;
- displayed client ID, auth base, callback URLs, resource, and scopes match the selected service;
- copy-one and copy-all work;
- the downloaded file is named `dondone.config.json` and parses as the documented schema;
- no secret, token, authorization code, or verifier appears in the file;
- the browser sample contains the selected service values and uses Web Crypto;
- the dialog remains scrollable and usable at a 1366×768 viewport.

- [ ] **Step 3: Smoke-test every blocked state**

Verify separately that configuration and snippet actions remain hidden when:

- the service is disabled;
- redirect URIs are empty;
- resource URI is absent;
- no capability catalog is active;
- the approved catalog contains no OAuth scopes;
- the capabilities request is loading or fails.

On request failure, confirm Retry performs a new request and the UI never briefly exposes an empty-scope download.

## Deferred Follow-ups

These are intentionally not implementation tasks in this plan:

1. Publish standard OAuth Authorization Server Metadata at `/.well-known/oauth-authorization-server`.
2. Validate demand before designing any client-specific discovery endpoint.
3. Extract and publish a supported framework SDK before showing package-based React examples.
4. Build a genuine E2E OAuth tester only with a dedicated registered callback and complete PKCE transaction lifecycle.
5. If developers must onboard without administrator handoff, design a separate authenticated developer portal rather than making the Console tab public.
