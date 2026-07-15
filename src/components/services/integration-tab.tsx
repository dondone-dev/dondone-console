import { useEffect, useMemo, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Check,
  Copy,
  Download,
  RefreshCw,
  ShieldCheck,
  ShieldX,
} from 'lucide-react'
import { toast } from 'sonner'
import {
  apiFetch,
  type ActiveCapability,
  type Service,
} from '@/lib/api'
import type { Session } from '@/lib/auth'
import {
  assessIntegrationReadiness,
  buildBrowserQuickStart,
  buildOAuthIntegrationConfig,
  serializeOAuthIntegrationConfig,
  type OAuthIntegrationConfig,
  type ScopeLoadState,
} from '@/lib/oauth-integration'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'

export function IntegrationTab({
  session,
  service,
}: {
  session: Session
  service: Service
}) {
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

  const scopesAreLoading =
    service.status === 'active' &&
    (capabilities.isPending || capabilities.isFetching)

  const scopeState: ScopeLoadState = {
    scopesStatus:
      service.status !== 'active' || scopesAreLoading
        ? 'pending'
        : capabilities.isError
          ? 'error'
          : 'success',
    scopes: scopeKeys,
  }
  const readiness = assessIntegrationReadiness(service, scopeState)
  const isReady = readiness.every((item) => item.ok)
  const config = isReady
    ? buildOAuthIntegrationConfig(
        service,
        import.meta.env.VITE_AUTH_BASE as string,
        scopeKeys
      )
    : null

  return (
    <div className="grid gap-6 pb-2 pt-1">
      <section className="grid gap-3" aria-labelledby="integration-readiness-heading">
        <div>
          <h3 id="integration-readiness-heading" className="text-sm font-medium">
            Integration readiness
          </h3>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            Resolve every item before sharing this service&apos;s OAuth configuration.
          </p>
        </div>

        <div className="divide-y rounded-lg border">
          {readiness.map((item) => (
            <div key={item.label} className="flex items-start gap-3 px-3 py-2.5">
              {item.ok ? (
                <ShieldCheck className="mt-0.5 size-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
              ) : (
                <ShieldX className="mt-0.5 size-4 shrink-0 text-destructive" />
              )}
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">{item.label}</p>
                <p className="break-words text-xs leading-relaxed text-muted-foreground">
                  {item.detail}
                </p>
              </div>
            </div>
          ))}
        </div>

        {capabilities.isError && (
          <Button
            variant="outline"
            size="sm"
            className="justify-self-start"
            onClick={() => void capabilities.refetch()}
            disabled={capabilities.isFetching}
          >
            <RefreshCw className={capabilities.isFetching ? 'animate-spin' : undefined} />
            Retry scopes
          </Button>
        )}
      </section>

      {scopesAreLoading && (
        <div className="grid gap-2" aria-label="Loading integration configuration">
          <Skeleton className="h-4 w-44" />
          <Skeleton className="h-28 w-full" />
        </div>
      )}

      {!isReady && !scopesAreLoading && (
        <p className="rounded-lg border border-dashed px-4 py-3 text-sm text-muted-foreground">
          Complete the failed readiness checks before sharing integration configuration.
        </p>
      )}

      {config && (
        <>
          <ConfigCard config={config} />
          <QuickStart config={config} />
        </>
      )}
    </div>
  )
}

function ConfigCard({ config }: { config: OAuthIntegrationConfig }) {
  const serialized = serializeOAuthIntegrationConfig(config)
  const rows: Array<{ label: string; values: string[] }> = [
    { label: 'client_id', values: [config.client_id] },
    { label: 'auth_base', values: [config.auth_base] },
    { label: 'redirect_uris', values: config.redirect_uris },
    { label: 'resource', values: [config.resource] },
    { label: 'scopes', values: config.scopes },
    {
      label: 'token_endpoint_auth_method',
      values: [config.token_endpoint_auth_method],
    },
  ]

  return (
    <section className="grid gap-3" aria-labelledby="oauth-config-heading">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 id="oauth-config-heading" className="text-sm font-medium">
            OAuth client configuration
          </h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Version 1 · public PKCE client · no client secret
          </p>
        </div>
        <CopyButton value={serialized} label="Copy complete JSON" textLabel="Copy JSON" />
      </div>

      <div className="divide-y rounded-lg border bg-muted/20">
        {rows.map((row) => (
          <div
            key={row.label}
            className="grid gap-1 px-3 py-2.5 sm:grid-cols-[180px_minmax(0,1fr)_auto] sm:items-start"
          >
            <span className="font-mono text-xs text-muted-foreground">{row.label}</span>
            <div className="grid min-w-0 gap-1">
              {row.values.map((value) => (
                <code key={value} className="break-all text-xs leading-relaxed">
                  {value}
                </code>
              ))}
            </div>
            <CopyButton
              value={row.values.join('\n')}
              label={`Copy ${row.label}`}
            />
          </div>
        ))}
      </div>

      <Button
        variant="outline"
        size="sm"
        className="justify-self-start"
        onClick={() => downloadConfig(config)}
      >
        <Download />
        Download dondone.config.json
      </Button>
    </section>
  )
}

function QuickStart({ config }: { config: OAuthIntegrationConfig }) {
  const snippet = buildBrowserQuickStart(config)

  return (
    <section className="grid gap-3" aria-labelledby="browser-pkce-heading">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="max-w-xl">
          <h3 id="browser-pkce-heading" className="text-sm font-medium">
            Browser PKCE quick start
          </h3>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            This helper uses Web Crypto and stores the PKCE transaction in sessionStorage.
            The current app callback must be registered as /auth/callback for its origin.
          </p>
        </div>
        <CopyButton value={snippet} label="Copy browser PKCE helper" textLabel="Copy code" />
      </div>
      <pre className="max-h-96 overflow-auto rounded-lg border bg-muted/30 p-4 text-xs leading-relaxed">
        <code>{snippet}</code>
      </pre>
    </section>
  )
}

function CopyButton({
  value,
  label,
  textLabel,
}: {
  value: string
  label: string
  textLabel?: string
}) {
  const [copied, setCopied] = useState(false)
  const resetTimer = useRef<number | null>(null)

  useEffect(
    () => () => {
      if (resetTimer.current !== null) window.clearTimeout(resetTimer.current)
    },
    []
  )

  async function copy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      if (resetTimer.current !== null) window.clearTimeout(resetTimer.current)
      resetTimer.current = window.setTimeout(() => setCopied(false), 1500)
    } catch {
      toast.error('Copy failed')
    }
  }

  return (
    <Button
      type="button"
      variant="ghost"
      size={textLabel ? 'sm' : 'icon'}
      className={textLabel ? undefined : 'size-7 justify-self-end'}
      aria-label={label}
      title={label}
      onClick={() => void copy()}
    >
      {copied ? <Check /> : <Copy />}
      {textLabel && (copied ? 'Copied' : textLabel)}
    </Button>
  )
}

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
