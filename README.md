# Auth Methods Comparison Demo

A hands-on, side-by-side comparison of **Session-Based Authentication** and **JWT with Refresh Tokens**. Interact with both auth systems live and watch the server-side state change in real time through observable JSON files.

## What This Demonstrates

| | Session Auth | JWT + Refresh Token |
|---|---|---|
| **Server state** | Full session data stored server-side | Only refresh token JTIs stored |
| **Request verification** | DB/cache lookup on every request | Cryptographic signature check (zero I/O) |
| **Horizontal scaling** | Requires a shared session store (e.g. Redis) | Any server with the secret can verify |
| **Logout / revocation** | Immediate — delete the session entry | Refresh token revoked; access token lives until expiry |
| **Token transport** | httpOnly cookie (browser automatic) | `Authorization` header (client manages manually) |
| **XSS risk** | Lower — httpOnly cookie unreadable by JS | Higher if access token stored in `localStorage` |
| **CSRF risk** | Must use SameSite / CSRF token | Lower — Authorization header not sent automatically |
| **Best for** | Traditional web apps, monoliths | APIs, SPAs, microservices, mobile clients |

---

## Project Structure

```
authentication/
├── backend/
│   ├── main.py            # FastAPI app — mounts both routers with CORS config
│   ├── session_auth.py    # Session auth router (/session/*)
│   ├── jwt_auth.py        # JWT auth router (/jwt/*)
│   ├── db.py              # File-based "database" (JSON read/write helpers)
│   ├── requirements.txt
│   └── data/
│       ├── users.json         # User table (shared by both auth systems)
│       ├── sessions.json      # Session store — watch it change on login/logout
│       └── refresh_tokens.json # Valid refresh token JTIs — watch it change on login/logout
└── frontend/
    ├── src/
    │   ├── App.jsx            # Root component — concept cards + comparison table
    │   ├── components/
    │   │   ├── SessionAuth.jsx
    │   │   └── JwtAuth.jsx
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

## API Reference

Both routers share the same URL structure under different prefixes.

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
