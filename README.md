# Quiz Bot by Pusparghya

Telegram quiz / exam bot with a multi-teacher dashboard.

| Layer | Host | Stack |
|--------|------|--------|
| **Frontend** | Vercel | React + Vite + Tailwind |
| **Backend (production)** | Railway | **Java 21 + Spring Boot** |
| **Database (production)** | Railway PostgreSQL | Flyway migrations |
| **OCR** | Google Gemini | Photo → questions JSON |

**Docs:** [ENTERPRISE.md](./ENTERPRISE.md) · [SECURITY.md](./SECURITY.md) · [LICENSE](./LICENSE)  
**Cutover from legacy Turso:** [scripts/migrate-turso-to-postgres.md](./scripts/migrate-turso-to-postgres.md)

Bot: [@quizbotbypusparghya_bot](https://t.me/quizbotbypusparghya_bot)  
Teacher Dashboard: https://quiz-bot-by-pusparghya.vercel.app/

---

## Production backend: `backend-spring/`

Root directory on Railway: **`backend-spring`** (Dockerfile).

### Required environment variables

See also `backend-spring/.env.example`.

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | **Yes** | JDBC URL, e.g. `jdbc:postgresql://…/quizbot` |
| `DATABASE_USERNAME` | **Yes** | Postgres user |
| `DATABASE_PASSWORD` | **Yes** | Postgres password |
| `JWT_SECRET` | **Yes** | ≥24 random characters |
| `TELEGRAM_BOT_TOKEN` | **Yes** | From [@BotFather](https://t.me/BotFather) |
| `TELEGRAM_WEBHOOK_SECRET` | **Yes in production** | Shared secret for webhook header |
| `APP_PRODUCTION` | **Yes in production** | Set to `true` |
| `ALLOWED_ORIGINS` | **Yes** | e.g. `https://quiz-bot-by-pusparghya.vercel.app` |
| `PORT` | No | Default `8080` (Railway sets this) |
| `TELEGRAM_POLLING_ENABLED` | No | Default `true` |
| `GEMINI_API_KEY` | No | OCR |
| `GEMINI_MODEL` | No | Default `gemini-flash-latest` |

Production **refuses to start** if `JWT_SECRET` is weak or `TELEGRAM_WEBHOOK_SECRET` is blank when `APP_PRODUCTION=true`.

### Deploy (Railway)
1. Attach **PostgreSQL**.
2. Deploy from branch with root **`backend-spring`**.
3. Set variables from the table above.
4. Confirm `GET /health` → `{"ok":true}`.

### Frontend (Vercel)
- Root: `frontend`
- Proxy `/api` → Railway (see `frontend/vercel.json`)
- Auth uses **httpOnly cookies** (`credentials: 'include'`)

---

## Legacy Node backend (deprecated)

The directory **`backend/`** (Node + Express + Turso) is **legacy**. Do **not** deploy it for production.

See `backend/README.md` for archival notes. One-time data move: `scripts/migrate-turso-to-postgres.md`.

---

## Local Spring development

```bash
cd backend-spring
docker compose up -d db   # optional Postgres
# set DATABASE_* and JWT_SECRET
./mvnw spring-boot:run    # or: mvn spring-boot:run
```

```bash
cd frontend && npm install && npm run dev
```

## License
MIT — see [LICENSE](./LICENSE).
