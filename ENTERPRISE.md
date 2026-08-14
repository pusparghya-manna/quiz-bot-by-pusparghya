# Enterprise Spring Boot architecture

**Branch:** `enterprise`

## Stack
- Java 21, Spring Boot 3.4, Spring Security (JWT), Spring Data JPA, Flyway, PostgreSQL
- Telegram Bot API (long polling / webhook)
- Optional Google Gemini OCR
- Frontend: React + Vite on Vercel (unchanged API paths)

## Module layout (`backend-spring/src/main/java/com/pusparghya/quizbot/`)
teacher/, student/, exam/, question/, submission/, result/, leaderboard/,
telegram/, ocr/, settings/, security/, config/, common/, exception/

## Deploy
Railway: Docker build from `backend-spring/`, attach PostgreSQL plugin, set env from `.env.example`.
