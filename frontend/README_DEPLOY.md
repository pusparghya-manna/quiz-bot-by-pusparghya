# Frontend deploy (Vercel)

## Required project settings
1. **Root Directory:** `frontend`  
   OR use repo-root `vercel.json` (buildCommand builds `frontend/dist`).
2. **Framework Preset:** Vite
3. **Build Command:** `npm run build` (if Root = frontend)
4. **Output Directory:** `dist` (if Root = frontend)

## SPA routing
`vercel.json` rewrites all non-API paths to `/index.html` so `/exams`, `/results`, etc. work on refresh.

After pushing to `main`, open Vercel → Deployments → **Redeploy** if the URL still stays on `/` (old tab UI bundle).

