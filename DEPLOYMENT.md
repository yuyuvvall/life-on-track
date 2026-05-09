# Deployment Guide

Deploy The Auditor with:
- **Frontend**: Vercel (React PWA)
- **Backend**: Render (Express API)
- **Database**: Turso (SQLite-compatible)

> Legacy Railway config (`server/railway.json`, `server/Procfile`) is kept for rollback. Remove once Render is stable.

---

## 1. Create Turso Database

1. Sign up at [turso.tech](https://turso.tech)
2. Install the CLI:
   ```bash
   # macOS
   brew install tursodatabase/tap/turso
   
   # Windows (WSL) / Linux
   curl -sSfL https://get.tur.so/install.sh | bash
   ```

3. Login and create database:
   ```bash
   turso auth login
   turso db create auditor-db
   ```

4. Get your credentials:
   ```bash
   turso db show auditor-db --url
   # Output: libsql://auditor-db-yourname.turso.io
   
   turso db tokens create auditor-db
   # Output: your-auth-token
   ```

Save these for the next steps.

---

## 2. Deploy Backend to Render

The repo includes `render.yaml`, a Render Blueprint that defines the service for you.

1. Go to [render.com](https://render.com) and sign in with GitHub
2. Click **New +** → **Blueprint** → connect this repository → **Apply**
3. Render reads `render.yaml` and provisions a free web service called `life-on-track-api` in the Frankfurt region with:
   - Root directory: `server`
   - Build: `npm install && npm run build`
   - Start: `npm start`
   - Health check: `/api/health`
4. Set the secret env vars in the Render dashboard (the blueprint marks them `sync: false`, so they're not committed to git):

   | Variable | Value |
   |----------|-------|
   | `DATABASE_URL` | `libsql://auditor-db-yourname.turso.io` |
   | `DATABASE_AUTH_TOKEN` | `your-turso-token` |
   | `CORS_ORIGIN` | `https://your-app.vercel.app` (update after Vercel deploy) |

   `NODE_ENV=production` is already set by the blueprint. `PORT` is injected by Render automatically.

5. Render auto-deploys on every push to the connected branch. Note your API URL (e.g., `https://life-on-track-api.onrender.com`).

> **Free tier note:** Render free web services spin down after ~15 min of inactivity (~50s cold start on the next request). Upgrade to the Starter plan ($7/mo) to keep it always-on — no code change required.

---

## 3. Deploy Frontend to Vercel

1. Go to [vercel.com](https://vercel.com) and sign in with GitHub
2. Click "New Project" → Import your repository
3. **Important**: Set the root directory to `client`
4. Add environment variable:

   | Variable | Value |
   |----------|-------|
   | `VITE_API_URL` | `https://life-on-track-api.onrender.com/api` |

5. Deploy!

---

## 4. Update CORS Origin

Go back to Render → your service → **Environment** and update `CORS_ORIGIN` with your Vercel URL:
```
CORS_ORIGIN=https://your-app.vercel.app
```
Render restarts the service automatically when env vars change.

---

## Local Development

### Prerequisites
- Node.js 18+
- npm

### Setup
```bash
# Clone and install
git clone <your-repo>
cd life-on-track
npm install

# Create local env file
cp .env.example server/.env
# Edit server/.env - keep DATABASE_URL as file:./data/auditor.db for local dev

# Start development
npm run dev
```

Frontend: http://localhost:5173
API: http://localhost:3001

---

## Environment Variables Reference

### Server (Render)
| Variable | Description | Example |
|----------|-------------|---------|
| `NODE_ENV` | Environment mode | `production` |
| `PORT` | Server port (Render sets automatically) | `10000` |
| `DATABASE_URL` | Turso database URL | `libsql://db.turso.io` |
| `DATABASE_AUTH_TOKEN` | Turso auth token | `eyJhbGci...` |
| `CORS_ORIGIN` | Allowed frontend origin | `https://app.vercel.app` |

### Client (Vercel)
| Variable | Description | Example |
|----------|-------------|---------|
| `VITE_API_URL` | Backend API URL | `https://life-on-track-api.onrender.com/api` |

---

## Troubleshooting

### "Database connection failed"
- Check `DATABASE_URL` format: must start with `libsql://`
- Verify `DATABASE_AUTH_TOKEN` is correct
- Try regenerating token: `turso db tokens create auditor-db`

### CORS errors
- Ensure `CORS_ORIGIN` in Render matches your Vercel URL exactly
- Include protocol: `https://` not just the domain

### Build failures
- Render: Check the **Logs** tab on your service
- Vercel: Check "Deployments" tab for build logs

### Slow first request after idle
- Free Render web services spin down after ~15 min of inactivity. The first request wakes it (~50s). Upgrade to the Starter plan to keep it warm.

