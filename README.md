# Quiz Bot by Pusparghya

Telegram quiz / exam bot with a teacher dashboard.

- **Frontend:** Vercel (React + Vite) — teacher dashboard  
- **Backend:** Railway (Node + Express + Telegram polling)  
- **Database:** Turso  
- **OCR:** Gemini (photo → questions → exam)  

Bot: [@quizbotbypusparghya_bot](https://t.me/quizbotbypusparghya_bot)

## Deploy

### Backend (Railway)
1. Root directory: `backend`
2. Environment variables: see `backend/.env.example`
3. Deploy

### Frontend (Vercel)
1. Root directory: `frontend`
2. `VITE_API_URL` = your Railway public URL  
3. Deploy

## Teacher login
Use **Register** on the login page, or set `TEACHER_USERNAME` / `TEACHER_PASSWORD` as Railway secrets only (never commit passwords).
