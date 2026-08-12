Vercel Deployment Checklist
==========================

Summary
-------
- Frontend root: `frontend` (Create React App)
- Build output: `frontend/build` (CRA default)
- Build uses: `npm install --legacy-peer-deps` then `npm run build`

Vercel import settings
-----------------------
1. In Vercel, select **Import Project** → choose your GitHub repo.
2. Set **Root Directory** to `frontend`.
3. Set **Install Command** to: `npm install --legacy-peer-deps`.
4. Set **Build Command** to: `npm run build`.
5. Set **Output Directory** to: `build`.
6. (Optional) Remove or update `vercel.json` in repo root if you change root.

Required Vercel Environment Variable (Frontend)
-----------------------------------------------
- `REACT_APP_API_URL` = `https://<your-backend-host>`
  - Example: `https://api.yourdomain.com`
  - Used by: `frontend/src/api/service.ts` and pages that call the API.

Backend hosting (recommendation)
--------------------------------
- Do NOT deploy the backend with PyTorch/model files to Vercel Serverless.
- Recommended hosts: Render, Fly.io, Railway, or a Docker-capable VPS.
- Use the existing `backend/Dockerfile` to build an image that includes Python and dependencies.

Minimal Docker run example (replace env values and model paths):

```bash
cd backend
docker build -t pest-backend .
docker run -p 8000:8000 \
  -e FRONTEND_ORIGIN="https://your-site.vercel.app" \
  -e PROJECT_URL="<project-url>" \
  -e API_KEY="<api-key>" \
  -e OPENWEATHER_API_KEY="<openweather-key>" \
  -v /absolute/path/to/models:/app/models \
  pest-backend
```

Notes about model files
----------------------
- Ensure these files are available to the backend container (either baked into the image or mounted):
  - `rice_pest_model.pkl`
  - `leaf_model.pth`
  - `class_names.json`
- Do NOT upload these model files to Vercel frontend.

Backend environment variables (examples)
---------------------------------------
- `FRONTEND_ORIGIN` = `https://<your-vercel-site>`
- `PROJECT_URL` = (optional) project database/URL
- `API_KEY` = (optional) project API key
- `OPENWEATHER_API_KEY` = (optional) weather API key
- `OPENAI_API_KEY` = (optional) OpenAI key

Post-deploy verification
------------------------
1. Deploy frontend on Vercel using above settings.
2. Deploy backend on Docker host and note its HTTPS base URL.
3. In Vercel > Project Settings > Environment Variables, set `REACT_APP_API_URL` to the backend URL.
4. Open the deployed frontend and use browser devtools Network tab to confirm API requests go to `REACT_APP_API_URL` and receive successful responses.

Files changed / committed
-------------------------
- `vercel.json` — updated to use `npm install --legacy-peer-deps && npm run build` and `outputDirectory: build` (commit pushed).
- `VERCEL_DEPLOY.md` — this file (added and pushed).

If you want, I can now:
- prepare a small `README` deploy section and push it, or
- create a Docker run guide for Render/Fly with service-specific steps.
