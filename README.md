# Quiz Bot by Pusparghya

Telegram quiz / exam bot with a multi-teacher dashboard.

| Layer | Host | Stack |
|--------|------|--------|
| **Frontend** | Vercel | React + Vite + Tailwind |
| **Backend** | Railway | Node + Express + Telegram polling |
| **Database** | Turso | libSQL |
| **OCR** | Google Gemini | Photo → questions JSON |

Bot: [@quizbotbypusparghya_bot](https://t.me/quizbotbypusparghya_bot)  
Teacher Dashboard: https://quiz-bot-by-pusparghya.vercel.app/

---

## Environment variables

### Backend (Railway) — set these on the **backend** service

Root directory: `backend`

| Variable | Required | Description |
|----------|----------|-------------|
| `TELEGRAM_BOT_TOKEN` | **Yes** | Token from [@BotFather](https://t.me/BotFather) |
| `TURSO_DATABASE_URL` | **Yes** | Turso DB URL (`libsql://…` or `https://…`) |
| `TURSO_AUTH_TOKEN` | **Yes** | Turso auth token |
| `GEMINI_API_KEY` | **Yes** | Google AI / Gemini API key (photo OCR) |
| `JWT_SECRET` | **Yes** | Long random string for teacher login tokens |
| `PORT` | No | HTTP port (Railway usually sets this; default `3000`) |
| `GEMINI_MODEL` | No | Model id (default: `gemini-flash-latest`) |
| `TEACHER_USERNAME` | No | Seed one teacher on first boot (optional) |
| `TEACHER_PASSWORD` | No | Password for seeded teacher (min 6 chars) |
| `TEACHER_NAME` | No | Display name for seeded teacher |
| `ALLOWED_ORIGINS` | No | Comma-separated CORS origins |
| `ENABLE_RESEED` | No | `true` to allow destructive data reset APIs |
| `MAX_MESSAGE_LENGTH` | No | Max bot broadcast/DM length (default 3500) |
| `MAX_OCR_BASE64_CHARS` | No | Max OCR upload size (default 10M chars) |

**Notes**
- Never commit real secrets. Use Railway **Variables** only.
- `TEACHER_*` only creates an account if that username does not already exist in Turso.
- Teachers can also **Register** from the dashboard login page.
- Bot token & bot username are **developer-only** (not editable in the teacher UI).

Example (`backend/.env.example`):

```env
PORT=3000
TELEGRAM_BOT_TOKEN=
TURSO_DATABASE_URL=
TURSO_AUTH_TOKEN=
GEMINI_API_KEY=
GEMINI_MODEL=gemini-flash-latest
JWT_SECRET=change-this-to-a-long-random-string

# Optional seed teacher (Railway secrets only)
TEACHER_USERNAME=
TEACHER_PASSWORD=
TEACHER_NAME=
```

---

### Frontend (Vercel)

Root directory: `frontend`

| Variable | Required | Description |
|----------|----------|-------------|
| `VITE_API_URL` | **No** | Leave **empty / unset** in production |

**Important:** The app calls same-origin `/api/…`. Vercel rewrites (see `frontend/vercel.json`) proxy those requests to Railway. Setting `VITE_API_URL` to the Railway URL can break login on some Wi‑Fi networks.

If you ever need a direct API URL (e.g. special setup), you would set:

```env
VITE_API_URL=https://YOUR-SERVICE.up.railway.app
```

For the standard deploy, **do not set** `VITE_API_URL`.

Update the proxy target in `frontend/vercel.json` if your Railway public URL changes:

```json
{
  "rewrites": [
    {
      "source": "/api/:path*",
      "destination": "https://YOUR-SERVICE.up.railway.app/api/:path*"
    },
    {
      "source": "/health",
      "destination": "https://YOUR-SERVICE.up.railway.app/health"
    }
  ]
}
```

---

## Deploy steps

### 1. Backend — Railway
1. New project → deploy from GitHub repo  
2. **Root directory:** `backend`  
3. Add all **required** variables from the table above  
4. Deploy and copy the public HTTPS URL (e.g. `https://….up.railway.app`)  
5. Confirm `GET /health` returns `{"ok":true}`

### 2. Frontend — Vercel
1. Import the same GitHub repo  
2. **Root directory:** `frontend`  
3. Do **not** set `VITE_API_URL` (use `vercel.json` proxy)  
4. Ensure `vercel.json` destination matches your Railway URL  
5. Deploy  

### 3. Teacher access
- Open the Vercel URL → **Register** a teacher account, **or**  
- Use `TEACHER_USERNAME` / `TEACHER_PASSWORD` seeded on Railway  

---

## Local development

```bash
# Backend
cd backend
cp .env.example .env   # fill in values
npm install
npm run dev

# Frontend (separate terminal)
cd frontend
npm install
npm run dev            # Vite proxies /api → localhost:3000
```

---

## License / ownership

Project: **Quiz Bot by Pusparghya**

See [SECURITY.md](./SECURITY.md) for security hardening details.
