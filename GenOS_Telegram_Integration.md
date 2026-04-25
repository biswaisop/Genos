# GenOS — Telegram Integration Implementation Plan
> Full implementation plan for Telegram bot integration. Read fully before writing any code.

---

## Table of Contents
1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Build Order](#build-order)
4. [Backend Implementation](#backend-implementation)
5. [Frontend Implementation](#frontend-implementation)
6. [Data Models](#data-models)
7. [Bot Commands & Flows](#bot-commands--flows)
8. [Alert System](#alert-system)
9. [Security & Edge Cases](#security--edge-cases)
10. [Testing Checklist](#testing-checklist)

---

## Overview

Telegram serves two purposes in GenOS:

1. **Alerts** — anomaly notifications pushed to Telegram when VPS metrics breach thresholds
2. **Agent Chat** — user can talk to the LangGraph agent for any server they have access to, via Telegram, with full clearance level enforcement

### Key decisions locked
- Account linking via **deep link (Option A)** — one click from GenOS profile page
- Bot talks to **internal utils directly**, not via HTTP to own API
- Server selection via `/servers` and `/use` commands
- Session state (which server user is talking to) stored in **MongoDB**
- Alerts go to **both** in-site notifications AND Telegram once linked
- Each Telegram message is a **fresh agent run** (no persistent WebSocket)
- Clearance levels fully enforced — same as web chat

---

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                   Telegram App                      │
│  User sends message / command                       │
└────────────────────┬────────────────────────────────┘
                     │ HTTPS push
                     ▼
┌─────────────────────────────────────────────────────┐
│  FastAPI  POST /api/v1/telegram/webhook             │
│                                                     │
│  telegram_handler.py                                │
│    ├── /start <token>  → link account               │
│    ├── /servers        → list servers               │
│    ├── /use <name>     → select server              │
│    ├── /status         → current server metrics     │
│    ├── /disconnect     → deselect server            │
│    └── <free text>     → run agent                  │
│                                                     │
│  Calls internal utils directly:                     │
│    ├── core/serverutils.py                          │
│    ├── core/userutils.py                            │
│    ├── services/telegram_service.py (send message)  │
│    └── graph.py (LangGraph agent)                   │
└─────────────────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────┐
│              MongoDB                                │
│  users collection  → telegram_chat_id field         │
│  telegram_link_tokens → short-lived link tokens     │
│  telegram_sessions → chat_id + selected_server_id   │
└─────────────────────────────────────────────────────┘
```

---

## Build Order

```
1. Data model changes (users + new collections)
2. telegram_service.py (send message helper + webhook registration)
3. telegram_handler.py (all command logic)
4. routes/telegram/telegram.py (webhook endpoint + link endpoints)
5. Wire into main.py (startup registers webhook)
6. Frontend — profile page "Connect Telegram" button
7. Frontend — show connected status + disconnect option
8. Test end to end
```

---

## Backend Implementation

### New files to create

```
backend/
├── services/
│   └── telegram_service.py       # bot setup, send_message, register_webhook
├── handlers/
│   └── telegram_handler.py       # all command + message handling logic
└── routes/
    └── telegram/
        ├── __init__.py
        └── telegram.py           # webhook POST + /connect + /disconnect endpoints
```

---

### `services/telegram_service.py`

Responsibilities:
- Initialize the bot with token from env
- `send_message(chat_id, text)` — sends a message to a Telegram user
- `register_webhook(url)` — tells Telegram where to push updates
- `send_alert(chat_id, server_name, metric, value)` — formatted alert message

```python
# Key functions to implement:

async def send_message(chat_id: int, text: str, parse_mode: str = "Markdown"):
    # POST to https://api.telegram.org/bot{TOKEN}/sendMessage
    # Use httpx async client (already likely in stack, else add it)

async def register_webhook(base_url: str):
    # POST to https://api.telegram.org/bot{TOKEN}/setWebhook
    # url = f"{base_url}/api/v1/telegram/webhook"
    # Call this on FastAPI startup

async def send_alert(chat_id: int, server_name: str, metric: str, value: float):
    # Formatted message:
    # 🚨 *GenOS Alert*
    # Server: `my-server`
    # Metric: CPU Usage
    # Value: 91.4% (threshold: 85%)
    # Time: 23:45 UTC
```

**Dependencies:**
```bash
pip install httpx python-telegram-bot==20.7
```

Add to `requirements.txt`:
```
httpx==0.27.0
python-telegram-bot==20.7
```

---

### `handlers/telegram_handler.py`

This is the brain. Handles all incoming Telegram updates.

#### Command: `/start <token>`
```
1. Extract token from message text
2. Look up token in telegram_link_tokens collection
3. If not found or expired → reply "❌ Invalid or expired link. Generate a new one from GenOS."
4. If found:
   a. Store chat_id on user document in MongoDB
   b. Delete the token document
   c. Reply "✅ Your GenOS account is now linked! Send /servers to see your servers."
```

#### Command: `/servers`
```
1. Look up user by chat_id
2. If not linked → reply "❌ Account not linked. Visit GenOS to connect Telegram."
3. Call serverutils.get_servers_for_user(user_id)
4. Also get servers accessible via team membership
5. Format and reply:
   "🖥 *Your Servers*
   1. my-production-server (● Online)
   2. staging-server (● Online)
   3. dev-box (○ Offline)
   
   Send /use <number> or /use <name> to select a server."
```

#### Command: `/use <name or number>`
```
1. Look up user by chat_id
2. Match input to server from their list
3. Verify user has access to this server (personal or team)
4. Store { chat_id, server_id, user_id } in telegram_sessions
5. Reply:
   "✅ Now talking to *my-production-server*
   Your role: operator
   Send any command in plain English."
```

#### Command: `/status`
```
1. Look up current session
2. If no server selected → reply "No server selected. Send /servers to pick one."
3. Call metrics collector to get latest metrics for the server
4. Reply:
   "📊 *my-production-server*
   CPU: 12.4%
   Memory: 40.3%
   Disk: 28.1%
   Load: 0.92, 0.88, 0.81
   Last updated: 2 mins ago"
```

#### Command: `/disconnect`
```
1. Delete telegram_sessions document for this chat_id
2. Reply "✅ Disconnected from server. Send /servers to pick another."
```

#### Command: `/help`
```
Reply with full command list:
/servers     - List your servers
/use <name>  - Select a server to talk to
/status      - Show current server metrics
/disconnect  - Stop talking to current server
/unlink      - Unlink your Telegram from GenOS
```

#### Command: `/unlink`
```
1. Remove telegram_chat_id from user document
2. Delete telegram_sessions for this chat_id
3. Reply "✅ Telegram unlinked from GenOS."
```

#### Free text message (agent chat)
```
1. Look up user by chat_id
2. If not linked → reply "❌ Account not linked."
3. Look up current session → get server_id
4. If no server selected → reply "No server selected. Send /servers first."
5. Get user's role for this server (personal owner or team role)
6. Check server is connected
7. Send "⏳ Running..." reply immediately (agent takes time)
8. Run LangGraph agent:
   - Pass message as user input
   - Pass user_role into graph state
   - Pass server_id for SSH connection
9. Get output from agent
10. If agent returns CONFIRM verdict:
    Reply "⚠️ This command requires confirmation:
    `rm -rf /tmp/old_logs`
    Reply *yes* to confirm or *no* to cancel."
    Store pending_confirm in telegram_sessions
11. If free text is "yes"/"no" and pending_confirm exists:
    Handle confirmation flow
12. Reply with agent output in monospace:
    "```
    total 48
    drwxr-xr-x 2 ubuntu ubuntu 4096 Jan 15 10:30 .
    ```"
```

---

### `routes/telegram/telegram.py`

#### POST `/api/v1/telegram/webhook`
- Receives updates from Telegram (no auth — Telegram calls this)
- Parses the update JSON
- Routes to telegram_handler based on message type
- Always returns 200 OK immediately (Telegram expects fast response)
- Handler runs as background task so response is instant

#### POST `/api/v1/telegram/generate-token` (JWT protected)
- Generates a UUID token
- Stores in `telegram_link_tokens`: `{ token, user_id, expires_at (10 mins) }`
- Returns:
```json
{
  "deep_link": "https://t.me/Gen_80085_bot?start=<token>",
  "token": "<token>",
  "expires_in": 600
}
```

#### DELETE `/api/v1/telegram/unlink` (JWT protected)
- Removes `telegram_chat_id` from user document
- Deletes their telegram_sessions
- Returns 200

#### GET `/api/v1/telegram/status` (JWT protected)
- Returns whether current user has Telegram linked
```json
{
  "linked": true,
  "username": "@someuser"
}
```

---

### `main.py` changes

On startup, register the webhook:
```python
@app.on_event("startup")
async def startup():
    # existing startup code...
    
    # Register Telegram webhook
    base_url = os.getenv("PUBLIC_URL")  # your ngrok or production URL
    if base_url and os.getenv("TELEGRAM_BOT_TOKEN"):
        await telegram_service.register_webhook(base_url)
```

Add new env vars:
```ini
TELEGRAM_BOT_TOKEN=<your new token after revoking>
TELEGRAM_BOT_USERNAME=Gen_80085_bot
PUBLIC_URL=https://your-ngrok-url.ngrok-free.app
```

---

## Frontend Implementation

### Modified files
- `components/auth/ProfilePage.jsx` — add Telegram connect section (if profile page exists, else add to dashboard settings)
- `lib/telegramApi.js` — new file for generate-token and status calls

### New UI on Profile/Settings page

```
┌─────────────────────────────────────────┐
│  Integrations                           │
│                                         │
│  Telegram                               │
│  ┌─────────────────────────────────┐    │
│  │  [Telegram icon]                │    │
│  │  Connect your Telegram account  │    │
│  │  to receive alerts and chat     │    │
│  │  with your servers via bot.     │    │
│  │                                 │    │
│  │  [Connect Telegram]             │    │  ← if not linked
│  │                                 │    │
│  │  ✅ Connected                   │    │  ← if linked
│  │  [Disconnect]                   │    │
│  └─────────────────────────────────┘    │
└─────────────────────────────────────────┘
```

### Connect flow (frontend)

```javascript
// 1. User clicks "Connect Telegram"
// 2. Call POST /api/v1/telegram/generate-token
// 3. Get back deep_link
// 4. Open deep_link in new tab:
window.open(deep_link, '_blank')
// 5. Show message: "Telegram opened! Click START in the bot to complete linking."
// 6. Poll GET /api/v1/telegram/status every 3 seconds for up to 2 minutes
// 7. When status.linked === true → show "✅ Connected" and stop polling
```

### `lib/telegramApi.js`
```javascript
const BASE = "/api/v1/telegram";

export async function generateTelegramToken(token) {
  const res = await fetch(`${BASE}/generate-token`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` }
  });
  return res.json();
}

export async function getTelegramStatus(token) {
  const res = await fetch(`${BASE}/status`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  return res.json();
}

export async function unlinkTelegram(token) {
  const res = await fetch(`${BASE}/unlink`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` }
  });
  return res.json();
}
```

---

## Data Models

### `users` collection (additions only)
```json
{
  "... existing fields": "...",
  "telegram_chat_id": 123456789,
  "telegram_username": "@someuser"
}
```

### `telegram_link_tokens` collection (new)
```json
{
  "_id": "ObjectId",
  "token": "uuid-string",
  "user_id": "ObjectId",
  "expires_at": "datetime",
  "created_at": "datetime"
}
```
Index: `{ token: 1 }` unique, `{ expires_at: 1 }` TTL index (auto-delete expired tokens)

### `telegram_sessions` collection (new)
```json
{
  "_id": "ObjectId",
  "chat_id": 123456789,
  "user_id": "ObjectId",
  "server_id": "ObjectId",
  "user_role": "operator",
  "pending_confirm": null,
  "updated_at": "datetime"
}
```
Index: `{ chat_id: 1 }` unique

---

## Bot Commands & Flows

### Full command reference
| Command | Description |
|---|---|
| `/start <token>` | Link GenOS account (from deep link only) |
| `/servers` | List all accessible servers |
| `/use <name or number>` | Select a server to chat with |
| `/status` | Show current server vitals |
| `/disconnect` | Stop talking to current server |
| `/unlink` | Unlink Telegram from GenOS account |
| `/help` | Show all commands |
| `<any text>` | Send to agent for selected server |

### Confirmation flow over Telegram
```
User: "delete all log files in /var/log"
Bot:  "⚠️ Confirmation required:
      `find /var/log -name '*.log' -delete`
      Reply yes to confirm or no to cancel."
User: "yes"
Bot:  "✅ Executed. 47 files deleted."
```

### Alert message format
```
🚨 GenOS Alert — my-production-server

Metric:  CPU Usage
Value:   91.4%
Limit:   85%
Time:    23:45 UTC

Send /use my-production-server to investigate.
```

---

## Alert System Integration

### In `services/anomaly_poller.py`
When a threshold breach is detected, after writing the in-site notification:

```python
# existing: write to notifications collection
await create_notification(user_id, "anomaly_alert", payload)

# new: also send Telegram if user has linked account
user = await get_user_by_id(user_id)
if user.get("telegram_chat_id"):
    await telegram_service.send_alert(
        chat_id=user["telegram_chat_id"],
        server_name=server["name"],
        metric=metric,
        value=value
    )
```

---

## Security & Edge Cases

| Scenario | Handling |
|---|---|
| Token expired (>10 mins) | Reply "❌ Link expired. Generate a new one from GenOS." |
| User not found by chat_id | Reply "❌ Account not linked. Visit GenOS to connect." |
| Server offline | Reply "❌ Server is offline. Cannot execute commands." |
| User has no access to server | Reply "❌ You don't have access to this server." |
| Viewer tries write command | Reply "🚫 Your clearance level (Viewer) only permits read commands." |
| Operator tries destructive command | Reply "🚫 Your clearance level (Operator) does not permit destructive commands." |
| Agent rate limited by Groq | Reply "⚠️ Agent is busy. Try again in a moment." |
| Duplicate link attempt | If already linked, reply "✅ Already linked! Use /servers to get started." |
| Webhook not registered (local dev) | Log warning, skip — use ngrok PUBLIC_URL |

---

## Environment Variables

Add to `.env`:
```ini
# ── Telegram ────────────────────────────────────────────────────
TELEGRAM_BOT_TOKEN=<new token from BotFather>
TELEGRAM_BOT_USERNAME=Gen_80085_bot
PUBLIC_URL=https://your-ngrok-url.ngrok-free.app
```

> ⚠️ PUBLIC_URL must be HTTPS. Telegram webhooks require HTTPS.
> Your ngrok URL already satisfies this.

---

## Testing Checklist

### Account Linking
- [ ] Click "Connect Telegram" on profile page
- [ ] Deep link opens bot in Telegram
- [ ] Click START → bot replies "✅ Account linked"
- [ ] Profile page detects link and shows "Connected"
- [ ] Token is deleted from `telegram_link_tokens` after use
- [ ] Expired token (wait 10 mins) shows error message

### Server Selection
- [ ] Send `/servers` → bot lists correct servers
- [ ] Send `/use 1` → bot confirms server selected
- [ ] Send `/use invalid-name` → bot says server not found
- [ ] Send `/status` → bot shows current metrics

### Agent Chat
- [ ] Send `list files in home directory` → agent runs `ls ~` → output returned
- [ ] Viewer account: send `mkdir test` → blocked with clearance message
- [ ] Operator account: send `rm /tmp/test` → blocked with clearance message
- [ ] Admin account: send `rm /tmp/test` → CONFIRM flow triggered
- [ ] Reply `yes` to confirm → command executes
- [ ] Reply `no` to confirm → command cancelled

### Alerts
- [ ] Set low thresholds (CPU > 0.1%)
- [ ] Wait for poller to run
- [ ] In-site notification appears ✅
- [ ] Telegram message received ✅
- [ ] Alert message format is correct

### Edge Cases
- [ ] `/servers` before linking → error message
- [ ] Free text before `/use` → "no server selected" message
- [ ] `/unlink` → profile page shows disconnected
- [ ] Regen token while previous still valid → old token still works (both valid until expiry)

---

*Ready to implement. Start with `telegram_service.py` then `telegram_handler.py`.*
