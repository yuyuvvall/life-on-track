# Deployment Guide

Deploy The Auditor with:
- **Frontend**: Vercel (React PWA)
- **Backend**: Railway (Express API)
- **Database**: Turso (SQLite-compatible)

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

## 2. Deploy Backend to Railway

1. Go to [railway.app](https://railway.app) and sign in with GitHub
2. Click "New Project" → "Deploy from GitHub repo"
3. Select your repository
4. **Important**: Set the root directory to `server`
5. Add environment variables in Railway dashboard:

   | Variable | Value |
   |----------|-------|
   | `NODE_ENV` | `production` |
   | `DATABASE_URL` | `libsql://auditor-db-yourname.turso.io` |
   | `DATABASE_AUTH_TOKEN` | `your-turso-token` |
   | `CORS_ORIGIN` | `https://your-app.vercel.app` (update after Vercel deploy) |

6. Railway will auto-deploy. Note your API URL (e.g., `https://auditor-api-production.up.railway.app`)

---

## 3. Deploy Frontend to Vercel

1. Go to [vercel.com](https://vercel.com) and sign in with GitHub
2. Click "New Project" → Import your repository
3. **Important**: Set the root directory to `client`
4. Add environment variable:

   | Variable | Value |
   |----------|-------|
   | `VITE_API_URL` | `https://your-railway-api.up.railway.app/api` |

5. Deploy!

---

## 4. Update CORS Origin

Go back to Railway and update `CORS_ORIGIN` with your Vercel URL:
```
CORS_ORIGIN=https://your-app.vercel.app
```

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

### Server (Railway)
| Variable | Description | Example |
|----------|-------------|---------|
| `NODE_ENV` | Environment mode | `production` |
| `PORT` | Server port (Railway sets automatically) | `3001` |
| `DATABASE_URL` | Turso database URL | `libsql://db.turso.io` |
| `DATABASE_AUTH_TOKEN` | Turso auth token | `eyJhbGci...` |
| `CORS_ORIGIN` | Allowed frontend origin | `https://app.vercel.app` |

### Client (Vercel)
| Variable | Description | Example |
|----------|-------------|---------|
| `VITE_API_URL` | Backend API URL | `https://api.railway.app/api` |

---

## Troubleshooting

### "Database connection failed"
- Check `DATABASE_URL` format: must start with `libsql://`
- Verify `DATABASE_AUTH_TOKEN` is correct
- Try regenerating token: `turso db tokens create auditor-db`

### CORS errors
- Ensure `CORS_ORIGIN` in Railway matches your Vercel URL exactly
- Include protocol: `https://` not just the domain

### Build failures
- Railway: Check logs in dashboard
- Vercel: Check "Deployments" tab for build logs

