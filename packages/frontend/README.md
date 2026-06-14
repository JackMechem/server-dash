# server-dash frontend

Next.js 16 frontend for server-dash. See the [root README](../../README.md) for full documentation on configuration, deployment, and NixOS setup.

## Development

```bash
pnpm dev       # start dev server on :3000
pnpm build     # production build
pnpm deploy    # build + deploy to /var/lib/server-dash/build + restart service
```

## Config

Runtime configuration is read from `/etc/server-dash/config.toml` by the server-side API routes. See the root README for all available options.
