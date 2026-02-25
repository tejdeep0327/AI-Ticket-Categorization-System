# AI Ticket Categorization System

AI-powered ticket workflow system with:
- Static frontend (`frontend/`)
- Node/Express backend API (`backend/`)
- Python Flask ML inference service (`ml-service/`)

## Project Structure

- `frontend/`: UI pages, styles, and client-side logic
- `backend/`: user auth/profile APIs + ticket CRUD + ML integration
- `ml-service/`: model loading and `/predict` inference endpoint
- `render.yaml`: Render service blueprint (backend + ML)

## Tech Stack

- Frontend: HTML/CSS/JS
- Backend: Node.js, Express, SQLite
- ML Service: Python, Flask, scikit-learn, gunicorn

## Local Development

### 1) Run ML service

From `ml-service/`:

```bash
pip install -r requirements.txt
python app.py
```

Default local URL: `http://localhost:8000`

### 2) Run backend

From `backend/`:

```bash
npm install
npm start
```

Default local URL: `http://localhost:5001`

Optional env vars:
- `PORT` (default `5001`)
- `DB_PATH` (default `./tickets.db`)
- `ML_SERVICE_URL` (default `http://localhost:8000`)

### 3) Run frontend

From `frontend/`:

```bash
npm install
npm run dev
```

Update frontend API target in:
- `frontend/js/runtime-config.js`

For local:

```js
API_URL: "http://localhost:5001"
```

## Production Deployment

### Frontend (Vercel)

- Import repo in Vercel
- Root Directory: `frontend`
- Framework Preset: `Other`
- Deploy

### Backend + ML (Render)

Deploy two web services:

1. `ml-service`
- Root Directory: `ml-service`
- Build: `pip install -r requirements.txt`
- Start: `gunicorn app:app --bind 0.0.0.0:$PORT --workers 1 --timeout 120`

2. `backend`
- Root Directory: `backend`
- Build: `npm ci`
- Start: `npm start`
- Env var: `ML_SERVICE_URL=<your-ml-service-url>`

Then set frontend runtime config:

```js
API_URL: "https://your-backend-service.onrender.com"
```

## Current Hosted URLs

- Backend: `https://ai-ticket-categorization-system.onrender.com`
- ML service: `https://ai-ticket-categorization-system-2.onrender.com`

## Troubleshooting

- `Cannot GET /` on backend:
  backend route now returns health JSON on `/`.
- `ML service error` on ticket creation:
  verify backend env `ML_SERVICE_URL` points to live ML URL.
- Missing model files in Render:
  ensure `ml-service/models/*.pkl` exist in GitHub repo.
- Data resets on Render:
  SQLite file storage is ephemeral on free web services.

## Important Production Note

SQLite on Render is not durable for long-term production data.
For persistent data, migrate backend storage to a managed DB (Postgres/Supabase/Neon).
