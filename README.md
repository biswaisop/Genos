# GenOS

> Run systems that run themselves.

GenOS turns natural language into real system actions. From files and processes to networks and servers, intelligent agents handle execution so you don't have to.

This repository is a hackathon project that ships a full stack: a React landing page with signup/signin, a dashboard for managing SSH connections, a guided wizard for adding new servers, and a real-time chat interface where a LangGraph-backed agent plans, validates, and executes bash commands over SSH.

---

## Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Tech Stack](#tech-stack)
4. [Repository Layout](#repository-layout)
5. [User Flow](#user-flow)
6. [Agent Pipeline](#agent-pipeline-langgraph)
7. [API Surface](#api-surface)
8. [Getting Started](#getting-started)
9. [Environment Variables](#environment-variables)
10. [Notable Optimizations](#notable-optimizations)
11. [Security Model](#security-model)

---

## Overview

GenOS lets a user:

1. Sign up / sign in to a personal account.
2. Add a remote server they own (BYOS — Bring Your Own Server) by following a guided 3-step flow: allocate an AWS Elastic IP, paste a generated SSH public key into `authorized_keys`, and set correct permissions.
3. See all their connections on a dashboard (online / disconnected, with per-connection actions).
4. Open a chat console for any connection and drive the server in plain English. The agent plans commands, a safety critic validates them, dangerous operations require explicit confirmation, and read-only commands run straight through.

---

## Architecture

```
┌──────────────────────┐                         ┌───────────────────────────┐
│   React + Vite SPA   │  ── REST (JWT) ───────► │     FastAPI (uvicorn)     │
│  landing / auth /    │                         │                           │
│  dashboard / wizard  │  ── WebSocket (JWT) ──► │   /api/v1/agents/ws/{id}  │
│  chat console        │                         └──────────┬────────────────┘
└──────────────────────┘                                    │
                                                            ▼
                                ┌───────────────────────────────────────────┐
                                │               LangGraph Agent             │
                                │  context → planner → critic → approval →  │
                                │         executor → ingestion              │
                                └────┬──────────┬──────────┬───────────────┘
                                     │          │          │
                                     ▼          ▼          ▼
                                ┌─────────┐ ┌────────┐ ┌──────────┐
                                │  Groq   │ │ Vault  │ │ Paramiko │
                                │  LLM    │ │ (keys) │ │   SSH    │
                                └─────────┘ └────────┘ └──────────┘
                                                           │
                                                           ▼
                                                  ┌─────────────────┐
                                                  │  User's server  │
                                                  └─────────────────┘

                   ┌──────────────┐            ┌──────────────┐
                   │   MongoDB    │  sessions, │    Redis     │  short-term
                   │   (motor)    │  commands, │  (optional)  │  history,
                   │              │  users,    │              │  pending
                   │              │  servers   │              │  confirms
                   └──────────────┘            └──────────────┘
```

---

## Tech Stack

**Frontend**
- React 18 + Vite
- Custom CSS (responsive, `color-mix`, `clamp`, mask compositing)
- [React Bits](https://reactbits.dev/) components (Beams, GradientText, BorderGlow)
- Custom `CursorGlow` background effect
- Client-side routing via `window.history.pushState`

**Backend**
- FastAPI (REST + WebSocket) + Uvicorn
- MongoDB via `motor`
- HashiCorp Vault for SSH private key storage
- `paramiko` for SSH execution
- LangGraph + `langchain-groq` (Llama 3.3 70B planner / Llama 3.1 8B critic)
- JWT auth via `python-jose`
- `passlib` + `bcrypt` for password hashing

---

## Repository Layout

```
SentinelHack/
├── .env                                  # shared env (CORS, DB, JWT, Groq, Vault)
├── README.md                             # (this file)
│
├── frontend/
│   ├── .env                              # frontend overrides (VITE_*)
│   ├── vite.config.js                    # dev proxy → http://localhost:8000
│   ├── index.html
│   ├── demo-images/                      # wizard screenshots (e.g., elastic-ip-img.png)
│   └── src/
│       ├── App.jsx                       # router + auth guard
│       ├── App.css                       # global theme + chat styling
│       ├── lib/
│       │   ├── authApi.js                # signup / login / getMe
│       │   └── serverApi.js              # servers CRUD + connect/test/delete
│       └── components/
│           ├── backgrounds/Beams.{jsx,css}
│           ├── backgrounds/CursorGlow.jsx
│           ├── common/CtaButton.jsx
│           ├── common/BorderGlow.{jsx,css}
│           ├── text/GradientText.jsx
│           ├── layout/Navbar.jsx
│           ├── layout/Section.jsx
│           ├── auth/AuthPage.jsx         # /signup /signin
│           ├── dashboard/DashboardPage.jsx
│           ├── connections/CreateConnectionPage.jsx  # 3-step wizard
│           └── chat/ChatPage.jsx         # WebSocket chat console
│
└── backend/
    ├── main.py                           # FastAPI app + CORS
    ├── graph.py                          # LangGraph assembly
    ├── requirements.txt
    ├── agents/
    │   ├── shellagent.py                 # planner node
    │   └── criticagent.py                # safety critic + fast-path
    ├── tools/
    │   ├── all_tools.py
    │   ├── os_tool.py                    # general shell
    │   ├── file_tool.py                  # file ops
    │   ├── process_tool.py               # ps/kill/systemctl
    │   ├── network_tool.py               # curl/ping/ss
    │   └── shell_tool.py
    ├── brain/llm.py                      # ChatGroq wrapper
    ├── core/
    │   ├── db.py                         # MongoDB client + indexes
    │   ├── auth.py                       # JWT helpers
    │   ├── userutils.py / serverutils.py
    │   ├── sshconnector.py               # paramiko wrapper
    │   ├── session_manager.py            # connector cache
    │   └── chat_memory.py                # Redis + Mongo command log
    ├── services/
    │   ├── vault.py                      # read/write SSH keys
    │   ├── key_gen.py                    # ed25519 key generation
    │   └── rag_service.py                # RAG stub (future ChromaDB)
    ├── schema/
    │   ├── user.py / servers.py / agents.py / session.py / __init__.py
    └── routes/
        ├── user/user.py                  # /api/v1/users
        ├── server/servers.py             # /api/v1/servers
        └── agents/agents.py              # /api/v1/agents (WebSocket)
```

---

## User Flow

```
Landing page (/)
   │ Sign up
   ▼
/signup ──────► /dashboard
                   │ "Add connection"
                   ▼
            /create-connection
                   │
    ┌──────────────┼────────────────┐
    │   Step 1     │   Step 2       │  Step 3
    │  Elastic IP  │  SSH public    │  Permissions
    │  allocation  │  key paste     │  (chmod)
    └──────────────┴────────────────┘
                   │  Done
                   ▼
            backend creates server +
            tests SSH connection
                   │
                   ▼
     /dashboard shows new connection
                   │ click connection
                   ▼
      /chat?serverId=<id>
                   │ WebSocket open
                   ▼
         Agent conversation
```

**Wizard details**
- **Step 1 — Allocate Elastic IP** (AWS console): 7 numbered points, an inline collapsible screenshot under point 2, and two inputs (Elastic IP + `whoami`) that together gate the "Next" button.
- **Step 2 — Install SSH public key**: Backend generates a fresh ed25519 key via `POST /api/v1/servers/` and returns the public half for the user to paste into `~/.ssh/authorized_keys`.
- **Step 3 — Set permissions**: `chmod 700 ~/.ssh` and `chmod 600 ~/.ssh/authorized_keys`, then "Done" triggers the connection test and navigates to `/chat`.

---

## Agent Pipeline (LangGraph)

The chat loop inside `backend/graph.py`:

```
START
  │
  ▼
context_retrieval   Semantic recall (RAG stub → ChromaDB later)
  │
  ▼
planner             LLM picks ONE generator tool, produces a bash command
  │                 (tools live in backend/tools/*)
  ▼
critic              evaluate_command → ALLOW | CONFIRM | BLOCK
  │
  ├── BLOCK ───────────────────────────────────► END
  │
  └── ALLOW / CONFIRM
        │
        ▼
      human_approval
        │ ALLOW   → auto-approve
        │ CONFIRM → interrupt() → user replies yes/no in chat
        │
        ├── rejected ────────────────────────► END
        │
        └── approved
              │
              ▼
            executor       paramiko.exec(command) over SSH
              │
              ▼
            ingestion      Logs interaction for RAG / audit
              │
              ▼
            END
```

**Planner tools**

| Tool | Scope |
| --- | --- |
| `create_os_command` | General shell, package mgmt (apt, pip) |
| `create_file_tool` | `ls`, `cp`, `mv`, `rm`, `mkdir`, `cat`, `zip`, `tar` |
| `create_process_command` | `ps`, `kill`, `pkill`, `systemctl`, `uptime` |
| `create_network_command` | `ping`, `curl`, `wget`, `ss`, `dig` |

**Critic model**
- Default: `llama-3.1-8b-instant` (separate Groq token bucket, cheap).
- Fast-path: obvious read-only commands (`ls`, `ps`, `df`, `cat`, `ping`, `ss`, …) skip the LLM entirely. Obvious destructive patterns (`rm -rf /`, `mkfs.*`, fork bombs, `shutdown`) are hard-blocked without an LLM call.
- Override with `CRITIC_MODEL=llama-3.3-70b-versatile` if you want tighter reasoning.

---

## API Surface

### REST (JSON, JWT bearer auth)

| Method | Path | Purpose |
| --- | --- | --- |
| `POST` | `/api/v1/users/signup` | Create a new user |
| `POST` | `/api/v1/users/login` | Exchange credentials for JWT |
| `GET`  | `/api/v1/users/me` | Current user profile |
| `POST` | `/api/v1/servers/` | Register a server — backend generates SSH keypair, stores private key in Vault, returns public key |
| `GET`  | `/api/v1/servers/` | List user's servers |
| `POST` | `/api/v1/servers/{id}/test` | Trigger an SSH connectivity probe |
| `POST` | `/api/v1/servers/{id}/connect` | Mark server connected |
| `POST` | `/api/v1/servers/{id}/disconnect` | Mark server disconnected |
| `DELETE` | `/api/v1/servers/{id}/delete` | Remove server + purge Vault key |

### WebSocket

| Path | Purpose |
| --- | --- |
| `GET ws://…/api/v1/agents/ws/{server_id}?token=<JWT>` | Bidirectional chat with the LangGraph agent for a specific server |

**WebSocket message types (server → client)**
- `output` — command result or assistant reply (full raw output, un-truncated).
- `confirm` — agent is awaiting `yes` / `no` for a CONFIRM verdict.
- `error` — graph execution error (rate-limit, SSH timeout, etc.).
- `history` — short-term history replay when a session reopens.

**Client → server**: plain text messages. When a `confirm` has been requested, "yes"/"y" approves, anything else rejects.

---

## Getting Started

### Prerequisites

- Node.js 20+
- Python 3.12+
- MongoDB running on `mongodb://localhost:27017`
- HashiCorp Vault (dev mode is fine) on `http://127.0.0.1:8200`
- A Groq API key

### Backend

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
# websocket support for uvicorn
pip install websockets
# copy root .env to the repo root (see template below) before starting
uvicorn main:app --reload --port 8000
```

### Frontend

```powershell
cd frontend
npm install
npm run dev
```

Vite's dev server runs on `http://localhost:5173` (or the next free port). Its `vite.config.js` proxies every `/api` request to `http://localhost:8000` so the browser never has to deal with CORS during development.

### Vault (dev)

```powershell
vault server -dev -dev-root-token-id=root
```

Then `VAULT_ADDR=http://127.0.0.1:8200` and `VAULT_TOKEN=root` in `.env`.

---

## Environment Variables

Lives at the repository root (`./.env`). FastAPI loads this via `python-dotenv`.

```ini
# ── Authentication (JWT) ───────────────────────────────────────
SECRET_KEY=<random 64-char hex>
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=30

# ── Database (MongoDB) ─────────────────────────────────────────
MONGOURI=mongodb://localhost:27017
DBNAME=GenOS

# ── CORS ───────────────────────────────────────────────────────
ALLOWED_ORIGINS=http://localhost:3000,http://localhost:5173,http://localhost:5174,http://localhost:5175,http://localhost:5176,http://localhost:8000,https://doorman-stencil-dime.ngrok-free.dev

# ── LLM (Groq via langchain-groq) ──────────────────────────────
MODEL=llama-3.3-70b-versatile
CRITIC_MODEL=llama-3.1-8b-instant
GROQ=<your Groq API key>
TEMPERATURE=0.2

# ── Vault ──────────────────────────────────────────────────────
VAULT_ADDR=http://127.0.0.1:8200
VAULT_TOKEN=root
```

---

## Notable Optimizations

The agent was regularly exceeding Groq's 100k tokens/day limit. Several changes cut token usage ~8× on typical turns:

1. **Planner message pruning** — only the latest `HumanMessage` is forwarded (not the full chat log). Prior command outputs no longer replay into every new turn.
2. **Truncated in-graph outputs** — `execution_output` kept in full for the UI, but the copy written back into `messages` (for future LLM calls) is head+tail capped at ~600 chars.
3. **Slimmed prompts** — each of the 4 generator-tool prompts shrank from ~600 to ~120 tokens. The planner prompt went from ~500 to ~60. The critic prompt from ~900 to ~200.
4. **Separate critic bucket** — the critic runs on `llama-3.1-8b-instant`, which has its own Groq TPD bucket, so the planner's 70B budget is preserved.
5. **Fast-path critic** — obvious read-only commands get ALLOW verdicts with zero LLM calls; obvious destructive patterns get BLOCK verdicts with zero LLM calls.
6. **Chat UI polish** — the frontend renders agent output in a monospace terminal-style block, auto-scrolls, shows connection status, and has a "Clear" button.

---

## Security Model

- Passwords stored as `bcrypt` hashes.
- SSH **private** keys never touch the database — they're generated on the backend, written to Vault under a per-server path, and read on demand by the SSH connector.
- Public keys are handed to the user in the wizard to paste into their own `authorized_keys`.
- Every destructive-looking command requires explicit `yes` from the user; system-wide destroyers (`rm -rf /`, `mkfs.*`, `shutdown`, fork bombs) are blocked outright and cannot be confirmed.
- All API routes (except signup/login) require a JWT bearer token. The WebSocket validates the same JWT via a `?token=` query parameter.

---
