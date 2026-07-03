# Dondone Console

[English](./README.md)

部署在 Cloudflare Pages 的 Dondone 管理后台，用于管理用户、服务、权限组和授权。

## 技术栈

React 19 + TypeScript · Vite · Tailwind CSS v4 · shadcn/ui 风格组件 · Cloudflare Pages Functions · Supabase service role

## 登录

Console 通过 Dondone Auth 登录，使用和其他应用一致的 PKCE 流程：

```sh
VITE_AUTH_BASE=https://auth.dondone.dev
VITE_AUTH_CLIENT_ID=console
```

需要在 `dondone-auth` 注册 client：

```json
{
  "console": {
    "name": "Console",
    "redirectUris": ["https://console.dondone.dev/auth/callback"]
  }
}
```

## Functions 环境变量

在 Cloudflare Pages 中配置：

```sh
SUPABASE_URL=https://ttmrvhkmqljulrptviow.supabase.co
SUPABASE_PUBLISHABLE_KEY=<supabase-publishable-key>
SUPABASE_SERVICE_ROLE_KEY=<supabase-service-role-secret>
CONSOLE_BOOTSTRAP_EMAILS=you@example.com
```

使用 Pages secret 设置 service role key：

```sh
echo "sb_secret_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" | pnpm wrangler pages secret put SUPABASE_SERVICE_ROLE_KEY --project-name dondone-console
```

## 初始化管理员

执行 SQL migration 后，用 `CONSOLE_BOOTSTRAP_EMAILS` 中的邮箱登录。Console 会显示初始化操作，为当前用户授予内置 `console/admin` 权限组。

## 部署

创建或连接名为 `dondone-console` 的 Cloudflare Pages 项目。

推荐 Pages 配置：

```sh
Build command: pnpm build
Build output directory: dist
Production branch: main
Custom domain: console.dondone.dev
```

部署前先设置 service role key：

```sh
echo "sb_secret_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" | pnpm wrangler pages secret put SUPABASE_SERVICE_ROLE_KEY --project-name dondone-console
```

使用 Wrangler 手动构建并部署：

```sh
pnpm install
pnpm test
pnpm build
pnpm wrangler pages deploy dist --project-name dondone-console
```

## 开发

```sh
pnpm install
cp .env.example .env.local
pnpm test
pnpm build
pnpm dev
```

本地运行 Pages Functions：

```sh
pnpm pages:dev
```
