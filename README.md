# Dondone Console

[中文文档](./README.zh.md)

Cloudflare Pages admin console for managing Dondone users, services, permission groups, and grants.

## Stack

React 19 + TypeScript · Vite · Tailwind CSS v4 · shadcn/ui-style components · Cloudflare Pages Functions · Supabase service role

## Authentication

Console uses Dondone Auth with the same PKCE flow as other apps:

```sh
VITE_AUTH_BASE=https://auth.dondone.dev
VITE_AUTH_CLIENT_ID=console
VITE_AUTH_RESOURCE=https://api.dondone.dev
VITE_AUTH_SCOPE=api:echo
```

Register the client in `dondone-auth`:

```json
{
  "console": {
    "name": "Console",
    "redirectUris": ["https://console.dondone.dev/auth/callback"]
  }
}
```

## Environment

Configure these values in the Cloudflare Pages build environment:

```sh
SUPABASE_URL=https://ttmrvhkmqljulrptviow.supabase.co
SUPABASE_PUBLISHABLE_KEY=<supabase-publishable-key>
VITE_AUTH_BASE=https://auth.dondone.dev
VITE_AUTH_CLIENT_ID=console
VITE_AUTH_RESOURCE=https://api.dondone.dev
VITE_AUTH_SCOPE=api:echo
```

All four `VITE_AUTH_*` values are required. `VITE_AUTH_RESOURCE` and
`VITE_AUTH_SCOPE` select the protected resource and capabilities bound to the
authorization code. Scope values are separated by whitespace; blank entries
and duplicates are removed. Missing or blank configuration fails closed.

Cloudflare does not inject `wrangler.toml` runtime variables into the Vite
build, so configure these values explicitly as Pages build environment variables.

Set this bootstrap allowlist as a Pages secret because `wrangler.toml` is the source of truth for Pages configuration:

```sh
echo "you@example.com" | pnpm wrangler pages secret put CONSOLE_BOOTSTRAP_EMAILS --project-name dondone-console
```

Set this secret manually. Do not commit it:

```sh
echo "sb_secret_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" | pnpm wrangler pages secret put SUPABASE_SERVICE_ROLE_KEY --project-name dondone-console
```

## Bootstrap

After SQL migration is executed, sign in with an email listed in `CONSOLE_BOOTSTRAP_EMAILS`. The Console will show an initialization action that grants the built-in `console/admin` group to that user.

## Deployment

Create or connect a Cloudflare Pages project named `dondone-console`.

Recommended Pages settings:

```sh
Build command: pnpm build
Build output directory: dist
Production branch: main
Custom domain: console.dondone.dev
```

For CLI deployment, first log in to Cloudflare:

```sh
pnpm wrangler login
```

If the Pages project does not exist yet, create it with the first deploy:

```sh
pnpm install
pnpm test
pnpm build
pnpm wrangler pages deploy dist --project-name dondone-console
```

After the Pages project exists, set the service role key:

```sh
echo "sb_secret_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" | pnpm wrangler pages secret put SUPABASE_SERVICE_ROLE_KEY --project-name dondone-console
```

Set the bootstrap email allowlist after the Pages project exists:

```sh
echo "you@example.com" | pnpm wrangler pages secret put CONSOLE_BOOTSTRAP_EMAILS --project-name dondone-console
```

After the first admin is initialized, you can rotate this value to an empty allowlist or delete the secret.

Deploy again so the Functions runtime sees the new secret:

```sh
pnpm build
pnpm wrangler pages deploy dist --project-name dondone-console
```

## Development

```sh
pnpm install
cp .env.example .env.local
pnpm test
pnpm build
pnpm dev
```

For local Pages Functions:

```sh
pnpm pages:dev
```
