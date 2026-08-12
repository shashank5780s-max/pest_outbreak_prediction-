# AgriPredict — Pest Intelligence System

A full-stack pest outbreak prediction system for Karnataka farmers — FastAPI backend + React 18 frontend.

## Architecture

```
Pest_OutBreak-main/
├── backend/
│   ├── app/main.py           # FastAPI application (prediction, weather, AI)
│   ├── migrations/           # SQL schema migrations (run in Supabase SQL Editor)
│   ├── scripts/
│   │   ├── inspect_model.py  # Inspect the trained ML model metadata
│   │   └── check_secrets.py  # Pre-commit secret scanner
│   ├── tests/                # pytest test suite
│   ├── .env.example          # Environment variable template (safe to commit)
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── api/service.ts    # Typed API client
│   │   ├── pages/            # Dashboard, Prediction, AIBrain, FieldMap, Alerts, Analytics
│   │   ├── components/       # Layout
│   │   └── utils/            # csvParser (deprecated — prefer backend endpoints)
│   └── package.json
├── .github/workflows/
│   ├── ci.yml                # Backend tests + frontend build + secret scan
│   └── secret-scan.yml       # Standalone gitleaks scan
├── rice_pest_model.pkl       # Trained XGBRegressor (pest pressure index)
├── label_encoders.pkl        # Label encoders (Location, Crops, Season, etc.)
└── final_pest_dataset.csv    # Karnataka district pest outbreak historical data
```

## How Predictions Work

1. **ML Model** (`rice_pest_model.pkl`): An `XGBRegressor` trained on rice pest data.
   It takes 16 weather + location features and outputs a continuous **pest pressure score**.
   This is converted to a 0–100 confidence index.

2. **CSV Heuristic** (`final_pest_dataset.csv`): Historical outbreak records identify the
   most likely **pest name** for a given crop/location combination.

3. **Blend**: `final_confidence = 70% × model_score + 30% × historical_confidence`

The `source` field in every prediction response documents which path was taken (`model+csv`, `model+rules`, `csv-only`, or `rules-only`).

## Quick Start

### 1. Secrets Setup

```bash
cd backend
cp .env.example .env
# Fill in your real API keys in .env
```

**Required environment variables** (see `backend/.env.example`):
| Variable | Description |
|---|---|
| `PROJECT_URL` | Supabase project URL |
| `API_KEY` | Supabase anon key |
| `OPENWEATHER_API_KEY` | OpenWeatherMap API key |
| `OPENAI_API_KEY` | OpenAI key (optional — enables GPT-4o vision + chat) |
| `FRONTEND_ORIGIN` | Frontend URL for CORS (default: `http://localhost:3000`) |

### 2. Backend

```bash
cd backend
python -m venv .venv
# Windows:
.venv\Scripts\activate
# macOS/Linux:
source .venv/bin/activate

pip install -r requirements.txt
uvicorn app.main:app --reload
```

Backend runs at: http://localhost:8000  
Interactive API docs: http://localhost:8000/docs  
Health check: http://localhost:8000/health

### 3. Frontend

```bash
cd frontend
npm install
# Optionally create frontend/.env with:
#   REACT_APP_API_URL=http://localhost:8000
npm start
```

Frontend runs at: http://localhost:3000

## API Endpoints

| Method | Endpoint | Description |
|---|---|---|
| GET | `/health` | Uptime + model status check |
| POST | `/predict` | Pest prediction from weather input |
| GET | `/live-weather` | Live weather + auto-prediction |
| GET | `/district-data` | Karnataka district outbreak summary |
| GET | `/history` | Recent prediction history |
| POST | `/chat` | AI pest management assistant |
| POST | `/analyze-leaf` | Leaf image analysis (GPT-4o Vision) |

### Example: Predict Pest
```bash
curl -X POST http://localhost:8000/predict \
  -H "Content-Type: application/json" \
  -d '{"temperature": 28.5, "humidity": 70, "rainfall": 1.0, "wind": 8.0, "crop": "groundnut", "lat": 13.3161, "lng": 75.772}'
```

**Response includes `source` field** (`model+csv`, `model+rules`, etc.) so you can always tell which prediction path was used.

## Running Tests

```bash
cd backend
.venv\Scripts\activate
pip install pytest httpx
pytest tests/ -v
```

Tests cover:
- `/health` endpoint
- Pydantic input validation (invalid humidity, temperature, rainfall, wind)
- `predict_pest_logic()` unit tests for multiple crops
- `run_model()` — confirms model is being called
- `/district-data` API contract
- `/chat` fallback behavior

## Deployment

### Backend → Render

1. Create a new **Web Service** on [Render](https://render.com)
2. Root directory: `backend`
3. Build command: `pip install -r requirements.txt`
4. Start command: `uvicorn app.main:app --host 0.0.0.0 --port $PORT`
5. Add environment variables in Render's dashboard (from `.env.example`)
6. Set `FRONTEND_ORIGIN` to your Vercel frontend URL

### Frontend → Vercel

1. Import repo on [Vercel](https://vercel.com)
2. Root directory: `frontend`
3. Framework: Create React App
4. Add environment variable: `REACT_APP_API_URL=https://your-render-backend.onrender.com`

### Database Schema

Run `backend/migrations/001_initial_schema.sql` in the **Supabase SQL Editor** before first deploy.

## Security Notes

- `backend/.env` is gitignored — never commit real keys
- `backend/.env.example` is the safe template — commit this
- GitHub Actions runs `gitleaks` on every push/PR to detect accidentally committed secrets
- Run `python backend/scripts/check_secrets.py --install-hook` to add a local pre-commit guard
- CORS is restricted to `FRONTEND_ORIGIN` — not `*`
- `/chat` and `/analyze-leaf` are rate-limited (10/min and 5/min respectively)

## Model Inspector

```bash
cd backend
.venv\Scripts\activate
python scripts/inspect_model.py
```

This prints all model metadata (feature names, output type, encoder classes) — useful for future maintainers who want to retrain or swap the model.

## Known Limitations / Future Work

- Auth (Phase 3): Supabase Auth is scaffolded but not fully wired end-to-end — predictions currently save as `user_id: "public"`
- The ML model was trained on rice pest data from non-Karnataka locations (Cuttack, Ludhiana, etc.) — the pest pressure score is directionally useful but not Karnataka-specific
- Frontend CSV parsing (`csvParser.ts`) is still used in `FieldMap` and `Prediction` pages — TODO: migrate to `/district-data` API endpoint
- `Dashboard_Live.tsx` has been deleted (was dead code identical to `Dashboard.tsx`)
