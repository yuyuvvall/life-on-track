# Clerk Authentication — clerk-auth-2026-07-10

> **Status (2026-07-10):** Phase 1 code implemented and verified locally (fail-closed 503 without keys, 401 without/with bad token, health + voice unaffected, typecheck clean). Remaining: Clerk dashboard setup + keys in env (see "Clerk dashboard setup" and "Deployment steps").

## Context

The app currently has **no authentication at all**. Every `/api/*` endpoint is publicly reachable; the only guard in the codebase is the static `X-Api-Key` shared secret on `POST /api/voice/command` (`server/src/routes/voice.ts:65-72`). There is no users table, no `user_id` column on any table, no login UI, and no token handling in the client. The production API (`https://life-on-track.duckdns.org`) is open to the internet.

Adding Clerk is therefore a **greenfield add**, not a migration. The stack is Vite + React SPA (Vercel) + Express API (GCE) on different origins, so auth is token-in-header (`Authorization: Bearer`), not cookies.

## Approach (recommended)

**Phase 1 — auth as a gate (this plan).** Any signed-in Clerk user can use the app; sign-ups are locked down in the Clerk dashboard (Restricted mode / allowlist) so only the owner can sign in. No schema changes, no data scoping. This closes the open-API hole with minimal surface area and matches the current single-user reality.

**Phase 2 — per-user data (deferred, separate plan).** If the app ever becomes multi-user: add `user_id TEXT` columns keyed to the Clerk user id on every table, backfill existing rows to the owner's id, and filter every query. Not needed to secure the app today.

## Packages

- Client: `@clerk/react` (current package name per Clerk docs; not the Next.js SDK)
- Server: `@clerk/express`

## Environment variables

| Where | Name | Notes |
|---|---|---|
| client (Vercel + `.env.local`) | `VITE_CLERK_PUBLISHABLE_KEY` | publishable, safe to expose |
| server (GCE via Google Secret Manager + local `.env`) | `CLERK_SECRET_KEY` | secret — never in client code or git |
| server | `CLERK_PUBLISHABLE_KEY` | needed by `@clerk/express` |

Server env in production comes from Google Secret Manager; update the secret and redeploy with `.\deploy\update-server.ps1 -RefreshEnv`.

## Server changes

1. `npm i @clerk/express` in `server/`.
2. In `server/src/index.ts`:
   - Add `clerkMiddleware()` after `express.json()` (`index.ts:24-31`). It parses the bearer token and attaches `req.auth`; it does **not** block by itself.
   - Add a small `requireAuth` guard (own middleware file, per project structure — `server/src/middleware/auth.ts`) using `getAuth(req)`: if `!isAuthenticated`, respond with the project's error shape `{ status: 'fail', message: 'Unauthorized' }` (401) via the sendError pattern.
   - Apply `requireAuth` to all `/api/*` routers **except**:
     - `/api/health` (uptime checks)
     - `/api/docs`, `/api/docs.json` (decide: keep open or also gate — recommend gating in production)
     - `/api/voice` — keeps its existing `X-Api-Key` check (machine-to-machine from Shortcuts; Clerk tokens aren't practical there)
3. CORS (`index.ts:25-29`) already allow-lists `Authorization` — no change needed.
4. Swagger (`server/src/swagger.ts:18-25`) already declares a bearer scheme — now it becomes true; no code change required.

## Client changes

1. `npm i @clerk/react` in `client/`.
2. `client/src/main.tsx`: wrap the tree with `<ClerkProvider publishableKey={import.meta.env.VITE_CLERK_PUBLISHABLE_KEY} afterSignOutUrl="/">` (outside/around `QueryClientProvider` + `BrowserRouter`).
3. **Token attachment** in `client/src/api/client.ts` (fetch wrapper, not a hook context):
   - Add a module-level token getter: `let getToken: (() => Promise<string | null>) | null = null; export function setAuthTokenGetter(fn) { getToken = fn }`.
   - In `request()` (`client.ts:56-70`), if a getter is registered, `const token = await getToken()` and set `Authorization: Bearer ${token}`.
   - Register it once from a small component inside `ClerkProvider`: `const { getToken } = useAuth(); useEffect(() => setAuthTokenGetter(getToken), [getToken])`.
4. **Gate the UI** in `client/src/App.tsx`:
   - `<SignedIn>` → existing `<Routes>`; `<SignedOut>` → a minimal sign-in screen using Clerk's `<SignIn />` component (Bootstrap-consistent wrapper).
   - Add `<UserButton />` to the existing header/nav so the signed-in user can manage account / sign out.
5. On 401 responses in `request()`, surface a re-auth state rather than the cold-start retry path.
6. PWA note: the app uses `vite-plugin-pwa`; verify cached shell + Clerk redirect flow behave together (test installed-PWA sign-in on mobile).

## Clerk dashboard setup (user action required)

1. Create the Clerk application (via `https://dashboard.clerk.com` or `clerk` CLI).
2. **Restrict sign-ups**: Configure → Restrictions → Restricted mode (or allowlist the owner's email) so the gate actually keeps strangers out.
3. Add authorized origins/redirects: `http://localhost:5173`, `https://life-on-track-client.vercel.app`.
4. Copy publishable + secret keys into the env locations above.

## Deployment steps

1. Vercel: add `VITE_CLERK_PUBLISHABLE_KEY` env var, redeploy client.
2. Google Secret Manager: add `CLERK_SECRET_KEY` + `CLERK_PUBLISHABLE_KEY` to the server env secret.
3. `.\deploy\update-server.ps1 -RefreshEnv` from repo root.

## Verification

1. Local: run server + client; unauthenticated `GET /api/tasks` → 401 `{ status: 'fail' }`; `/api/health` → 200.
2. Sign in through the UI; dashboard loads data; network tab shows `Authorization: Bearer` on API calls.
3. Voice: `POST /api/voice/command` with `X-Api-Key` still works without a Clerk token.
4. Sign-up from a non-allowlisted email is rejected (restricted mode).
5. Production: repeat the 401 + signed-in checks against `https://life-on-track.duckdns.org` after deploy.

## Risks / notes

- **Breaking change for any existing clients**: anything hitting the API unauthenticated (curl scripts, dashboards) will break the moment `requireAuth` lands. Voice/Shortcuts flow is preserved.
- Clerk free tier covers this usage comfortably.
- `@clerk/express` verifies tokens via Clerk's JWKS — no session table or schema change needed.
- Keep `CLERK_SECRET_KEY` out of `server/.env.production` in git (already gitignored) and out of client code.
