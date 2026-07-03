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

## Functions Environment

Configure these in Cloudflare Pages:

```sh
SUPABASE_URL=https://ttmrvhkmqljulrptviow.supabase.co
SUPABASE_PUBLISHABLE_KEY=<supabase-publishable-key>
SUPABASE_SERVICE_ROLE_KEY=<supabase-service-role-secret>
CONSOLE_BOOTSTRAP_EMAILS=you@example.com
VITE_AUTH_BASE=https://auth.dondone.dev
VITE_AUTH_CLIENT_ID=console
```

Non-sensitive defaults are also tracked in `wrangler.toml`; set production-only values such as `CONSOLE_BOOTSTRAP_EMAILS` in Cloudflare Pages if they differ from the file.

Set the service role key as a Pages secret:

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

Set the service role key before deploying:

```sh
echo "sb_secret_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" | pnpm wrangler pages secret put SUPABASE_SERVICE_ROLE_KEY --project-name dondone-console
```

Build and deploy manually with Wrangler:

```sh
pnpm install
pnpm test
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
