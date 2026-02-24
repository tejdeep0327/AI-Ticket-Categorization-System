# Deploy Frontend to Vercel

1. In Vercel, import this GitHub repo.
2. Set **Root Directory** to `frontend`.
3. Keep framework preset as **Other** (static site).
4. Deploy.

## Backend URL setup

Before deploying (or in a follow-up commit), update:

- `frontend/js/runtime-config.js`

Set:

```js
API_URL: "https://your-backend-url"
```

Example:

```js
API_URL: "https://your-backend.onrender.com"
```

Then commit and redeploy.
