# Security

## Authentication
- Teacher register/login via `/api/auth/*`
- Passwords: BCrypt (cost 12)
- Session: JWT in **httpOnly, Secure, SameSite=Strict** cookie (`quiz_session`)
- Browser requests must use `credentials: 'include'`

## Secrets (production)
| Variable | Rule |
|----------|------|
| `JWT_SECRET` | ≥ 24 characters — process exits if missing |
| `TELEGRAM_WEBHOOK_SECRET` | ≥ 16 characters — process exits if missing when `APP_PRODUCTION=true` |

## Authorization
All teacher data is scoped by authenticated `username`. Cross-tenant access returns 404/403.

## Rate limiting
Login/register and OCR endpoints are rate-limited per IP.

## CORS
Allowlist only (`ALLOWED_ORIGINS`). Credentials enabled for cookie sessions.

## Telegram webhook
Validates `X-Telegram-Bot-Api-Secret-Token` against `TELEGRAM_WEBHOOK_SECRET`.

## Secret rotation
1. Generate new secrets  
2. Update host environment  
3. Redeploy API  
4. Teachers sign in again after JWT rotation  
