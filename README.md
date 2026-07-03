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

## Environment

These non-sensitive defaults are already tracked in `wrangler.toml`, so you usually do not need to add them manually in the Cloudflare dashboard:

```sh
SUPABASE_URL=https://ttmrvhkmqljulrptviow.supabase.co
SUPABASE_PUBLISHABLE_KEY=<supabase-publishable-key>
VITE_AUTH_BASE=https://auth.dondone.dev
VITE_AUTH_CLIENT_ID=console
```

Set this environment variable manually in Cloudflare Pages because the repository default is intentionally empty:

```sh
CONSOLE_BOOTSTRAP_EMAILS=you@example.com
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

Set `CONSOLE_BOOTSTRAP_EMAILS` in the Cloudflare Pages dashboard under project environment variables.

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
