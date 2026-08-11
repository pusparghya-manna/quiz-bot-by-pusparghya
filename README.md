# Quiz Bot By Pusparghya

Telegram Exam / Quiz Bot with Teacher Dashboard.

- Backend: Railway (Node + Express + Telegram polling)
- Frontend: Vercel (React + Vite)
- Database: Turso
- OCR: Gemini (photo → JSON questions → exam)

## Teacher Login
- Username: `TinkoriSir`
- Password: `OnlineQuiz@123`

## Deploy

### Backend (Railway)
1. Root directory: `backend`
2. Set environment variables (see backend/.env.example)
3. Deploy

### Frontend (Vercel)
1. Root directory: `frontend`
2. Set `VITE_API_URL` to your Railway public URL (e.g. https://xxx.up.railway.app)
3. Deploy

