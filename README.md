# Quiz Bot by Pusparghya

Professional multi-teacher Telegram quiz platform.

| Component | Technology |
|-----------|------------|
| **API** | Java 21 · Spring Boot 3 · Spring Security · JPA |
| **Database** | PostgreSQL · Flyway |
| **Bot** | Telegram Bot API |
| **Dashboard** | React · TypeScript · Vite · Tailwind |
| **OCR** | Google Gemini (optional) |

## Repository layout

```text
backend/     Spring Boot API (production)
frontend/    Teacher dashboard (Vercel)
LICENSE
SECURITY.md
```

## Quick start

### Backend

```bash
cd backend
cp .env.example .env   # fill secrets
docker compose up -d db
mvn spring-boot:run
```

Health: `GET http://localhost:8080/health`

### Frontend

```bash
cd frontend
npm install
npm run dev
```

## Production

**API (Railway)**  
- Root directory: `backend`  
- Builder: Dockerfile  
- Attach PostgreSQL  
- Environment: see `backend/.env.example`

**Dashboard (Vercel)**  
- Root directory: `frontend`  
- Proxy `/api` → Railway URL in `frontend/vercel.json`

## Security

See [SECURITY.md](./SECURITY.md).

- JWT in httpOnly cookie  
- Tenant isolation per teacher  
- Production fails boot without `JWT_SECRET` and `TELEGRAM_WEBHOOK_SECRET`

## License

MIT — [LICENSE](./LICENSE)
