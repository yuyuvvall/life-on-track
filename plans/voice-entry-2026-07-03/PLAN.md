# Voice Entry — add tasks & expenses by voice, without opening the app

**Date:** 2026-07-03
**Goal:** Press a button on the Galaxy S22+, say "add a work task to migrate to the new API" or "add a food expense for 65 shekels", and have it land in life-on-track — no app opened, no typing.

---

## TL;DR — recommended architecture

Build **one backend piece** that works for every trigger, then wire up **two triggers**:

1. **Backend (build once):** `POST /api/voice/command` — accepts free-form transcribed text, uses Claude Haiku with tool-calling to classify it into *create task* / *create expense*, executes it against the existing DB logic, and returns a short confirmation string. Protected by a static API key (the API currently has **zero auth** — see Security section).
2. **Primary trigger — Tasker (recommended daily driver):** side-key double-press (remapped via Samsung Good Lock → RegiStar) or a Quick Settings tile launches a Tasker task: *Get Voice* (Google speech dialog, supports Hebrew + English) → *HTTP Request* to the endpoint → toast/voice confirmation. ~2 seconds from button to spoken confirmation. No Gemini/Bixby dependency at all.
3. **Secondary trigger — remote MCP server + Claude app (optional, high value):** expose `add_task` / `add_expense` / `query_expenses` as a remote MCP server on the existing GCE backend, add it as a custom connector on claude.ai, and use Claude mobile voice mode. Slightly more friction to launch, but adds full conversational access ("how much did I spend on food this month?").

Why not Gemini/Bixby directly? Researched below — every "pure assistant" path is either dead, flaky, or gated:

| Approach | Verdict |
|---|---|
| Gemini invoking your app (AppFunctions API) | The *right* long-term answer — Android's MCP-like API for exactly this — but in **private preview** (trusted testers only: Uber, DoorDash…), requires a native Android app on Android 16+. Revisit late 2026. |
| Bixby custom commands / capsules | Effectively dead. Samsung killed Quick Commands (Dec 2024) and demoted Bixby; no third-party path. |
| Google Assistant/IFTTT custom phrases with free-text slot | Discontinued years ago (Conversational Actions shut down 2023). |
| Gemini → Google Tasks "inbox" + backend poller | Works with the exact power-button flow and zero extra apps, but Gemini↔Tasks has documented reliability breakage through H1 2026 ("I don't have the ability to make Tasks", silent false confirmations). Kept as Plan C. |
| Gemini → WhatsApp message → WhatsApp Business webhook | Works from power button (Gemini can send WhatsApp messages by voice) but requires Meta Business/Cloud API setup; most moving parts. Plan D. |
| Tasker "run X in Tasker" via voice | The legacy Assistant integration is unreliable under Gemini; that's why the design triggers Tasker by **button**, not by hotword. |

---

## Part 1 — Backend: `POST /api/voice/command`

### Contract

```json
POST /api/voice/command
Headers: { "X-Api-Key": "<VOICE_API_KEY>" }
Body:    { "text": "add a food expense for 65 shekels", "lang": "en" }

201 → { "status": "ok", "kind": "expense", "confirmation": "Added ₪65 Food expense", "entity": { ...created row... } }
200 → { "status": "unclear", "confirmation": "I couldn't tell if that's a task or an expense" }
```

### Flow

1. Guard: `X-Api-Key` must equal `process.env.VOICE_API_KEY` (401 otherwise).
2. Call Claude (`claude-haiku-4-5-20251001` — fast + cheap, ~fractions of a cent per command) with two tools and a system prompt describing the schema:
   - `create_task { title, category: 'Work'|'Admin'|'Personal', deadline? }` — the DB CHECK constraint only allows those 3 categories (`db/index.ts:70`), so the LLM must map "work task" → `Work`, default `Personal`.
   - `create_expense { amount, category, note?, createdAt? }` — category is free text; `resolveCategoryId()` (`db/index.ts:407`) case-insensitively matches or auto-creates, so "food" → existing `Food` is safe. Amount is a bare number (no currency column — "65 shekels"/"65 שקל" → `65`).
   - Prompt must handle **Hebrew and English** input (Google STT will transcribe Hebrew if spoken).
3. Execute the tool call by reusing the same insert logic as `POST /api/tasks` (`routes/tasks.ts:126`) / `POST /api/expenses` (`routes/expenses.ts:336`) — factor the core insert into a shared function rather than HTTP-calling ourselves.
4. Return a short human confirmation string (Tasker speaks/toasts it verbatim).
5. Log every command + parse result to a `voice_commands` table (text, parsed JSON, outcome) — essential for debugging misheard/misparsed commands.

### Server changes

- New route file `server/src/routes/voice.ts`, mounted in `server/src/index.ts` like the others.
- New dep: `@anthropic-ai/sdk`. New env vars: `ANTHROPIC_API_KEY`, `VOICE_API_KEY` — add to Google Secret Manager and redeploy with `.\deploy\update-server.ps1 -RefreshEnv`.
- Follow existing patterns: manual validation guards, `sendError`-style `{ status:'fail', message }`, inline SQL via `trackedExecute`.

### Security (blocking issue found during research)

The entire API at `https://life-on-track.duckdns.org` is **unauthenticated with CORS `*`** — no JWT, no key, nothing reads the `Authorization` header (the Swagger bearerAuth is docs-only). Anyone who finds the URL can read/write all data today. Minimum for this feature: the voice endpoint requires `X-Api-Key`. Strongly recommended follow-up (separate plan): a static-API-key middleware in front of **all** `/api` routes + the same key in the client's axios config.

## Part 2 — Primary trigger: Tasker (button → speak → done)

**What you install on the S22+:** Tasker (~₪13 one-time, Play Store) and Good Lock → **RegiStar** module (free, Galaxy Store).

**Setup (~20 min, one-time):**
1. Tasker task **"Log It"**: ① *Get Voice* (system speech dialog; set language, or leave default — it follows your Google voice languages, so Hebrew works) → ② *HTTP Request*: POST `https://life-on-track.duckdns.org/api/voice/command`, JSON body `{"text":"%gv_text"}` (Get Voice output variable), header `X-Api-Key` → ③ *Say* or *Flash* the `confirmation` field from the response (④ on HTTP error: *Flash* "failed — try in the app").
2. Export "Log It" as an app shortcut, then in **RegiStar → Side key press twice → open app/shortcut** point the side-key **double-press** at it. (Long-press stays Gemini for everything else; double-press default is just the camera.) Backup triggers that need no RegiStar: a Tasker **Quick Settings tile** or home-screen shortcut.

**Resulting UX:** double-click power button → beep → "add a food expense for 65 shekels" → phone says "Added ₪65 Food expense". Works from lock screen, ~2–3 s end-to-end, zero dependence on Gemini/Bixby availability.

## Part 3 — Secondary trigger: remote MCP + Claude voice mode (optional)

Add a remote MCP server to the existing Express app (Streamable HTTP transport at `/mcp`, using `@modelcontextprotocol/sdk`) exposing `add_task`, `add_expense`, and read tools (`query_expenses`, `list_tasks`). Register it once at claude.ai → Settings → Connectors (custom connectors sync to the Claude Android app, including voice mode). Auth: MCP-spec OAuth is the proper route; pragmatic v1 = unguessable path + bearer check.

This isn't the fastest capture path (open Claude app → tap voice), but it turns the whole system conversational: totals, summaries, "what's on my plate this week", bulk entry. Build after Part 2 proves out.

## Plan C / Plan D (documented fallbacks — not building now)

- **C — Google Tasks inbox:** long-press power → Gemini → "add a task: food expense 65 shekels" into a dedicated `LifeOnTrack Inbox` Google Tasks list; a cron on the GCE box polls the Google Tasks API (free, 50k req/day) every minute, LLM-parses new items via the same `/api/voice/command` core, marks them completed. Zero phone setup, true power-button UX — but +1 min latency, Google OAuth plumbing, and Gemini→Tasks has been flaky in 2026.
- **D — WhatsApp bot:** Gemini's WhatsApp extension can send messages by voice from the power button; a WhatsApp Business Cloud API number webhooks into the backend. Highest setup cost (Meta business verification), but also gives two-way chat from any device.
- **Future — AppFunctions:** when Android's AppFunctions API leaves private preview (~200M devices by end of 2026), a thin native companion app could register `addExpense`/`addTask` functions directly with Gemini — the no-compromise version. Track it.

## Implementation order

1. `POST /api/voice/command` + Claude Haiku parser + `voice_commands` log table + `X-Api-Key` guard. Tests: Hebrew + English phrases for both intents, ambiguous input, bad key.
2. Deploy (`.\deploy\update-server.ps1 -RefreshEnv` after adding the two secrets).
3. Phone setup: Tasker task + RegiStar side-key double-press (manual, ~20 min).
4. (Later) MCP server for conversational access.
5. (Later, separate plan) API-wide authentication.

## Sources

- [AppFunctions overview — Android Developers](https://developer.android.com/ai/appfunctions) · [9to5Google: MCP-like AppFunctions](https://9to5google.com/2026/02/25/android-appfunctions-gemini/) · [Gemini API forum thread](https://discuss.ai.google.dev/t/api-to-allow-android-app-to-be-used-in-gemini-app/91232)
- [Tasker Assistant Action docs](https://tasker.joaoapps.com/userguide/en/help/eh_assistant_action.html) · [XDA: run Tasker tasks from Assistant](https://www.xda-developers.com/run-tasker-tasks-from-google-assistant/)
- [RegiStar key binding (Android Police)](https://www.androidpolice.com/samsung-good-lock-module-adds-back-tap-gestures-galaxy/) · [Samsung side key customization](https://www.samsung.com/us/support/answer/ANS10002033/)
- [Claude custom connectors via remote MCP](https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp) · [Remote MCP on Claude mobile (DEV)](https://dev.to/zhizhiarv/how-to-set-up-remote-mcp-on-claude-iosandroid-mobile-apps-3ce3)
- [Bixby Quick Commands removed (Android Police)](https://www.androidpolice.com/samsung-pulled-the-plug-on-bixby-quick-commands/)
- [Gemini↔Google Tasks breakage thread](https://support.google.com/gemini/thread/412345455/gemini-google-tasks-broken?hl=en) · [Google Tasks API limits](https://developers.google.com/workspace/tasks/limits)
- [Gemini WhatsApp extension (Google support)](https://support.google.com/gemini/answer/15574928?hl=en-GB)
