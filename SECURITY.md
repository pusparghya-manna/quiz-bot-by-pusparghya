# Security notes — Quiz Bot by Pusparghya

## Hardened in this release

| Issue | Fix |
|-------|-----|
| Open CORS (`origin: true`) | Allowlist via `ALLOWED_ORIGINS` + `*.vercel.app` |
| Weak default JWT secret | Strong secret required in production; bcrypt cost 12 |
| Brute-force login/register | Rate limit 30 / 15 min / IP |
| Bot token leaked to browser | Masked as `••••••••` in API responses |
| Unlimited JSON body (50mb) | Cap 12mb; OCR size limit |
| Destructive reseed always on | Requires `ENABLE_RESEED=true` |
| Short passwords | Minimum 8 characters |
| Username injection | Strict `[a-zA-Z0-9_]{3,32}` |
| Message flood | Max message length configurable |

## Still your responsibility

- Rotate secrets if they were ever pasted in chat or committed
- Keep Railway / Turso / Gemini / Bot tokens private
- Use HTTPS only (Vercel + Railway)
- Review Turso access tokens periodically
- Telegram bot token leak = anyone can control the bot

## Report issues

Contact the repo owner privately; do not open public issues with secrets.
