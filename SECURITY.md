# Security

## Authentication
- Teachers register/login via `/api/auth/register` and `/api/auth/login`.
- Passwords are hashed with **BCrypt** (cost 12).
- Sessions use a signed **JWT** delivered as an **httpOnly, Secure, SameSite=Strict** cookie (`quiz_session`).
- The browser must call APIs with `credentials: 'include'`. JWT is **not** stored in `localStorage`.
- `Authorization: Bearer` remains accepted temporarily for non-browser clients.

## JWT
- Secret: `JWT_SECRET` / `app.jwt.secret` (minimum **24 characters**).
- Production **fails to start** if the secret is missing or too short.
- Default TTL: 7 days (`app.jwt.ttl-seconds`).
- Logout clears the session cookie via `POST /api/auth/logout`.

## Authorization (tenancy)
- Every teacher-owned resource is scoped by `teacherId` / `username`.
- Controllers resolve the authenticated principal and use `findByIdAndTeacherId` (and equivalents).
- Cross-tenant access returns **404/403** (not another teacher's data).

## Rate limiting
- Login/register: ~30 requests / 15 minutes per IP.
- OCR parse: ~20 requests / 15 minutes per IP.

## CORS
- Strict allowlist via `ALLOWED_ORIGINS` / `app.cors.allowed-origins`.
- Credentials allowed only for listed origins (required for cookie auth).

## Telegram
- Webhook: `POST /api/telegram/webhook`.
- Production **requires** `TELEGRAM_WEBHOOK_SECRET` and validates `X-Telegram-Bot-Api-Secret-Token`.
- Production boot **fails** if the webhook secret is blank.
- `/api/telegram/simulate` is **disabled** when `APP_PRODUCTION=true`.

## Reseed / destructive ops
- Global multi-tenant reseed is **disabled**.
- No unscoped reseed endpoint exists in the Spring production backend.

## Rotating secrets
1. Generate new values (`openssl rand -base64 32`).
2. Update Railway variables (`JWT_SECRET`, `TELEGRAM_WEBHOOK_SECRET`, DB password, bot token as needed).
3. Redeploy backend.
4. Teachers must sign in again after JWT rotation.
5. Update Telegram webhook secret with Bot API `setWebhook` if using webhooks.

## Reporting issues
Contact the repository owner privately; do not open public issues with exploit details.
