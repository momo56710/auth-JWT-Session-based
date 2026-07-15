# Auth Methods Comparison Demo

A hands-on, side-by-side comparison of **Session-Based Authentication** and **JWT with Refresh Tokens**. Interact with both auth systems live and watch the server-side state change in real time through observable JSON files.

## What This Demonstrates

Three authentication strategies running side by side:

| | Session Auth | JWT + Refresh Token | OAuth 2.0 |
|---|---|---|---|
| **Server state** | Full session data stored server-side | Only refresh token JTIs stored | Session created after OAuth exchange |
| **Request verification** | DB/cache lookup on every request | Cryptographic signature check (zero I/O) | Session lookup (same as session auth) |
| **Horizontal scaling** | Requires a shared session store | Any server with the secret can verify | Depends on post-OAuth strategy |
| **Logout / revocation** | Immediate | Refresh token revoked; access token lingers | Immediate (session deleted) |
| **Password handling** | You store & verify passwords | You store & verify passwords | Provider handles it — you never see it |
| **Setup complexity** | Simple | Moderate | More setup; Apple costs $99/year |
| **Best for** | Traditional web apps | APIs, SPAs, microservices | Any app wanting social login |

---

## Project Structure

```
authentication/
├── backend/
│   ├── main.py            # FastAPI app — mounts all three routers with CORS config
│   ├── session_auth.py    # Session auth router (/session/*)
│   ├── jwt_auth.py        # JWT auth router (/jwt/*)
│   ├── oauth_auth.py      # OAuth 2.0 router (/oauth/google/* and /oauth/github/*)
│   ├── db.py              # File-based "database" (JSON read/write helpers)
│   ├── requirements.txt
│   ├── .env.example       # Copy to .env and fill in OAuth credentials
│   └── data/
│       ├── users.json         # User table (shared by all auth systems)
│       ├── sessions.json      # Session store — watch it change on login/logout
│       └── refresh_tokens.json # Valid refresh token JTIs
└── frontend/
    ├── src/
    │   ├── App.jsx            # Root component — concept cards + comparison tables
    │   ├── components/
    │   │   ├── SessionAuth.jsx
    │   │   ├── JwtAuth.jsx
    │   │   └── OAuthAuth.jsx  # Google, GitHub, and Apple explanation
    │   └── styles.css
    ├── index.html
    ├── package.json
    └── vite.config.js
```

---

## Tech Stack

**Backend**
- [FastAPI](https://fastapi.tiangolo.com/) — Python web framework
- [PyJWT](https://pyjwt.readthedocs.io/) — JWT encoding/decoding
- [Uvicorn](https://www.uvicorn.org/) — ASGI server
- [httpx](https://www.python-httpx.org/) — async HTTP client for OAuth token exchanges
- [python-dotenv](https://pypi.org/project/python-dotenv/) — loads `.env` credentials

**Frontend**
- [React 18](https://react.dev/) — UI components
- [Vite 5](https://vitejs.dev/) — dev server and bundler

---

## Getting Started

### Prerequisites

- Python 3.10+
- Node.js 18+

### 1. Backend

```bash
cd backend
python -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env             # fill in GOOGLE_CLIENT_ID etc. (optional — OAuth won't work without it)
uvicorn main:app --reload
```

The API runs at **http://localhost:8000**.  
Visit **http://localhost:8000/docs** for the interactive Swagger UI.

### 2. Frontend

```bash
cd frontend
npm install
npm run dev
```

The UI runs at **http://localhost:5173**.

---

## Demo Users

These are pre-seeded in `backend/data/users.json`:

| Username | Password | Role |
|---|---|---|
| `alice` | `password123` | admin |
| `bob` | `secret456` | user |
| `charlie` | `charlie789` | user |

> Passwords are stored in plaintext intentionally for demo readability. Use bcrypt/argon2 in production.

---

## OAuth Setup

### Google (Free)

1. Go to [console.cloud.google.com](https://console.cloud.google.com/) → New Project
2. APIs & Services → OAuth consent screen → External → fill in app name and email → Save
3. Credentials → Create Credentials → OAuth 2.0 Client ID → Web application
4. Add `http://localhost:8000/oauth/google/callback` as an authorized redirect URI
5. Copy the Client ID and Secret into `backend/.env`:

```env
GOOGLE_CLIENT_ID=123456789-abc.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-…
```

### GitHub (Free)

1. GitHub → Settings → Developer Settings → OAuth Apps → New OAuth App
2. Set Authorization callback URL to `http://localhost:8000/oauth/github/callback`
3. Generate a client secret (copy it immediately — GitHub only shows it once)
4. Copy into `backend/.env`:

```env
GITHUB_CLIENT_ID=Ov23li…
GITHUB_CLIENT_SECRET=abc123…
```

### Apple Sign In — Why it costs money

Sign in with Apple requires an **Apple Developer Program membership at $99/year USD**. Unlike Google and GitHub (completely free), there is no free tier — individual developers and organizations pay the same rate. Nonprofits, accredited educational institutions, and government entities can [apply for a fee waiver](https://developer.apple.com/help/account/membership/fee-waivers/).

Beyond the cost, Apple Sign In is the most technically demanding of the three providers:

| Difference | Details |
|---|---|
| **No static client_secret** | You download a private key file (`.p8`) and sign a JWT on every token request. The signed JWT expires after 6 months max — you must rotate it. |
| **No localhost** | Apple rejects `localhost` as a redirect URI for web apps. You need a real HTTPS domain. Use ngrok or a deployed server for local dev. |
| **Email hiding** | Users can choose "Hide My Email" — Apple provides a randomized relay address (`abc@privaterelay.appleid.com`). You can't use email as a stable identifier; use the `sub` claim instead. |
| **App Store mandate** | If your iOS/macOS app supports any third-party login (Google, GitHub, etc.), Apple requires you to also offer Sign in with Apple. For web-only apps it's optional. |

**When it's worth it:** If you're already building an iOS or macOS app, you need the $99/year membership anyway to publish on the App Store — so Sign in with Apple comes "for free" relative to that existing cost.

---

## API Reference

Both routers share the same URL structure under different prefixes.

### OAuth — `/oauth`

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/oauth/google/login` | Redirects browser to Google's consent screen (sets `oauth_state` cookie for CSRF protection) |
| `GET` | `/oauth/google/callback` | Exchanges code for token, fetches user info, creates a session, redirects to frontend |
| `GET` | `/oauth/github/login` | Redirects browser to GitHub's authorization page |
| `GET` | `/oauth/github/callback` | Same flow as Google callback |

After a successful OAuth callback the backend creates a session entry in `sessions.json` identical in structure to a regular session login. The only addition is a `"provider": "google"` or `"provider": "github"` field. This means you can watch `sessions.json` and see OAuth users appear alongside password-based session users.

### Session Auth — `/session`

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/session/login` | Validates credentials, writes a session entry to `sessions.json`, sets an httpOnly cookie |
| `GET` | `/session/protected` | Reads the cookie, looks up `sessions.json`, returns user data |
| `POST` | `/session/logout` | Deletes the session entry from `sessions.json`, clears the cookie |
| `GET` | `/session/session-store` | Debug — returns all active sessions currently in `sessions.json` |
| `GET` | `/session/users` | Debug — returns the full user table |

### JWT Auth — `/jwt`

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/jwt/login` | Issues an access token (30 s) + refresh token (5 min), writes only the refresh token JTI to `refresh_tokens.json` |
| `GET` | `/jwt/protected` | Verifies the access token via HMAC signature — **no file I/O** |
| `POST` | `/jwt/refresh` | Verifies the refresh token signature, checks its JTI in `refresh_tokens.json`, issues a new access token |
| `POST` | `/jwt/logout` | Removes the refresh token JTI from `refresh_tokens.json`; access token remains valid until expiry |
| `GET` | `/jwt/token-store` | Debug — shows how many refresh token JTIs are currently stored |

---

## How to Watch the State Change

This is the core learning mechanism of the demo. Open these files in your editor while the app is running:

**`backend/data/sessions.json`**
- **Login** → a new session entry appears (username, email, role, timestamps)
- **Logout** → that entry is deleted immediately
- The session ID itself (the key) is a random UUID — it carries no user information

**`backend/data/refresh_tokens.json`**
- **Login** → a JTI (JWT ID, another UUID) appears
- **Logout** → the JTI disappears
- The access token is **never** in this file — it lives only in the HTTP response and client memory

---

## Key Concepts Illustrated

### Session Auth Flow

```
Client                        Server                    sessions.json
  │                              │                            │
  │── POST /session/login ──────►│                            │
  │                              │── write session entry ────►│
  │◄── Set-Cookie: session_id ───│                            │
  │                              │                            │
  │── GET /session/protected ───►│                            │
  │   (cookie sent automatically)│── lookup session_id ──────►│
  │◄── user data ────────────────│◄── session data ───────────│
  │                              │                            │
  │── POST /session/logout ─────►│                            │
  │                              │── delete session entry ───►│
  │◄── 200 OK ───────────────────│                            │
```

### JWT Flow

```
Client                        Server                 refresh_tokens.json
  │                              │                            │
  │── POST /jwt/login ──────────►│                            │
  │                              │── write JTI ──────────────►│
  │◄── access_token + refresh ───│                            │
  │                              │                            │
  │── GET /jwt/protected ───────►│                            │
  │   Authorization: Bearer ...  │── verify HMAC signature    │
  │◄── user data ────────────────│   (no I/O at all)          │
  │                              │                            │
  │── POST /jwt/refresh ────────►│                            │
  │                              │── verify sig, check JTI ──►│
  │◄── new access_token ─────────│◄── JTI present ────────────│
  │                              │                            │
  │── POST /jwt/logout ─────────►│                            │
  │                              │── remove JTI ─────────────►│
  │◄── 200 OK ───────────────────│   (access token still live)│
```

### The JWT Trade-off

The short token expiry (30 seconds in this demo, 15 minutes in production) is intentional. After logout, the access token **cannot be revoked** — it remains cryptographically valid until `exp`. This is the fundamental trade-off of stateless auth:

- **Statelessness** → any server can verify without shared state → horizontal scale
- **No instant revocation** → a stolen access token is valid until expiry

Mitigation strategies in production: short expiry windows, token rotation, or maintaining a small revocation list (which reintroduces some state).

---

## Production Considerations

This demo uses JSON files as a stand-in for real storage. In production:

| This demo uses | Production equivalent |
|---|---|
| `data/sessions.json` | Redis (sub-millisecond lookups) or a DB table |
| `data/refresh_tokens.json` | Same — Redis with TTL, or a DB table |
| `data/users.json` | PostgreSQL / MySQL users table |
| Plaintext passwords | `bcrypt` or `argon2` hashed passwords |
| Hardcoded `SECRET_KEY` | Environment variable, rotated regularly |
| Single process | Multiple instances behind a load balancer |
| No HTTPS | TLS everywhere, `Secure` flag on cookies |

---

## License

MIT
