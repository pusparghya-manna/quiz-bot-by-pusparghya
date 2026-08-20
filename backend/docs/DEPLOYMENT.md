# Deployment (Railway)

## Layout
- Root directory on Railway: `backend`
- Builder: Dockerfile (multi-stage)
- Start: `node dist/index.js`
- Health: `/health` · Ready: `/ready`

## Build
Dockerfile installs esbuild + deps in the builder, bundles the app, and runtime installs only `@libsql/client`.

## Required env
- `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`
- `JWT_SECRET` (strong, ≥32 chars)
- `TELEGRAM_BOT_TOKEN`
- `PORT` (Railway injects)
- Optional: `TELEGRAM_WEBHOOK_SECRET`, `GEMINI_API_KEY`, `ALLOWED_ORIGINS`

SQL (Turso) is the source of truth. Do not rely on the container filesystem for permanent data.
