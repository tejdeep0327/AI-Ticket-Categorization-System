# Deploy Backend + ML on Render

This project should use 2 Render Web Services:

- `ml-service` (Python Flask)
- `backend` (Node/Express)

## 1) Create ML service first

1. In Render: **New +** -> **Web Service**.
2. Connect repo: `AI-Ticket-Categorization-System`.
3. Root Directory: `ml-service`
4. Build Command:
```bash
pip install -r requirements.txt
```
5. Start Command:
```bash
gunicorn app:app --bind 0.0.0.0:$PORT --workers 1 --timeout 120
```
6. Deploy and copy ML URL, for example:
`https://your-ml-service.onrender.com`

## 2) Create backend service

1. In Render: **New +** -> **Web Service**.
2. Connect same repo.
3. Root Directory: `backend`
4. Build Command:
```bash
npm ci
```
5. Start Command:
```bash
npm start
```
6. Add environment variable:
- `ML_SERVICE_URL` = your ML URL from step 1

Optional env vars:
- `DB_PATH` = `./tickets.db` (default)

## 3) Point Vercel frontend to backend

Update:
- `frontend/js/runtime-config.js`

Set:
```js
API_URL: "https://your-backend-service.onrender.com"
```

Commit and redeploy frontend on Vercel.

## Important note on SQLite

`backend` uses SQLite (`tickets.db`). On Render, container filesystem is ephemeral, so data may reset on redeploy/restart.
For production persistence, move to a managed database (Postgres/Supabase/Neon).
