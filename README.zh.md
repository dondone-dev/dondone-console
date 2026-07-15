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
VITE_AUTH_RESOURCE=https://api.dondone.dev
VITE_AUTH_SCOPE=api:echo
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

## 环境变量

这些非敏感默认值写在 `wrangler.toml` 中供 Pages 运行时使用，并同步作为前端构建默认值：

```sh
SUPABASE_URL=https://ttmrvhkmqljulrptviow.supabase.co
SUPABASE_PUBLISHABLE_KEY=<supabase-publishable-key>
VITE_AUTH_BASE=https://auth.dondone.dev
VITE_AUTH_CLIENT_ID=console
VITE_AUTH_RESOURCE=https://api.dondone.dev
VITE_AUTH_SCOPE=api:echo
```

`VITE_AUTH_RESOURCE` 与 `VITE_AUTH_SCOPE` 指定绑定到授权码的受保护资源和能力。
scope 以空白字符分隔，客户端会移除空项和重复项；变量缺失或为空时，使用上面所示的
API 兼容默认值。

Cloudflare 不会把 `wrangler.toml` 的运行时变量自动注入 Vite 构建。需要覆盖这些默认值
时，应在 Pages 的构建环境变量中设置 `VITE_*`。客户端代码也内置了上面列出的非敏感
默认值，因此生产构建即使没有构建期覆盖，也不会生成包含 `undefined` 的 Auth URL。

因为 `wrangler.toml` 会作为 Pages 配置源，bootstrap 邮箱白名单建议用 Pages secret 设置：

```sh
echo "you@example.com" | pnpm wrangler pages secret put CONSOLE_BOOTSTRAP_EMAILS --project-name dondone-console
```

这个 secret 必须手动设置，不能提交到仓库：

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

如果使用命令行部署，先登录 Cloudflare：

```sh
pnpm wrangler login
```

如果 Pages 项目还不存在，先通过第一次部署创建项目：

```sh
pnpm install
pnpm test
pnpm build
pnpm wrangler pages deploy dist --project-name dondone-console
```

Pages 项目创建后，再设置 service role key：

```sh
echo "sb_secret_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" | pnpm wrangler pages secret put SUPABASE_SERVICE_ROLE_KEY --project-name dondone-console
```

Pages 项目创建后，设置 bootstrap 邮箱白名单：

```sh
echo "you@example.com" | pnpm wrangler pages secret put CONSOLE_BOOTSTRAP_EMAILS --project-name dondone-console
```

第一个管理员初始化完成后，可以把这个值轮换为空白名单，或者删除这个 secret。

再次部署，让 Functions runtime 读取新的 secret：

```sh
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
