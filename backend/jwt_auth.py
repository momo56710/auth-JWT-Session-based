"""
JWT-BASED AUTHENTICATION WITH REFRESH TOKENS
==============================================
Persistent storage (simulated with JSON files):
  data/users.json           → the user table (shared with session auth)
  data/refresh_tokens.json  → list of valid refresh token JTIs
                              (the only server-side state JWT needs)

The access token is NEVER stored anywhere — that's the point.
Any server with the same SECRET_KEY can verify it by checking the signature.

Open data/refresh_tokens.json while the app is running:
  - A JTI appears on login.
  - It disappears on logout.
  - The access token is nowhere in the file — because it doesn't need to be.

Flow:
  Login   → issue access token (30s) + refresh token (5 min), write JTI to file
  Request → verify JWT signature cryptographically, read nothing from disk
  Refresh → verify refresh token, check JTI in file, issue new access token
  Logout  → remove JTI from file; access token still valid until its exp
"""

import time
import uuid
from typing import Optional

import jwt as pyjwt
from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel

import db  # our JSON file helper

router = APIRouter()
security = HTTPBearer()

SECRET_KEY = "super-secret-demo-key-change-in-production"
ALGORITHM = "HS256"

# Short expiry so the refresh flow is visible within the demo session.
# Production values: ACCESS=900 (15 min), REFRESH=604800 (7 days)
ACCESS_TOKEN_EXPIRE_SECONDS = 30
REFRESH_TOKEN_EXPIRE_SECONDS = 300


class LoginRequest(BaseModel):
    username: str
    password: str


class RefreshRequest(BaseModel):
    refresh_token: str


# ── File-backed storage helpers ───────────────────────────────────────────────

def get_user(username: str) -> dict | None:
    """Load a user record from data/users.json. Simulates: SELECT * FROM users WHERE username = ?"""
    users = db.load("users.json", default={})
    return users.get(username)


def load_refresh_jtis() -> list:
    """Read the list of valid refresh token JTIs from data/refresh_tokens.json."""
    return db.load("refresh_tokens.json", default=[])


def add_refresh_jti(jti: str) -> None:
    """Append a new JTI to the file. Simulates: INSERT INTO refresh_tokens (jti) VALUES (?)"""
    jtis = load_refresh_jtis()
    jtis.append(jti)
    db.save("refresh_tokens.json", jtis)


def remove_refresh_jti(jti: str) -> None:
    """Remove a JTI from the file. Simulates: DELETE FROM refresh_tokens WHERE jti = ?"""
    jtis = load_refresh_jtis()
    if jti in jtis:
        jtis.remove(jti)
        db.save("refresh_tokens.json", jtis)


# ── Token helpers ─────────────────────────────────────────────────────────────

def create_access_token(username: str, role: str) -> str:
    """
    Build and sign a JWT access token.
    The payload is base64url-encoded (readable by anyone!) — trust comes from
    the HMAC signature, not from encryption.
    This token is NOT written to any file.
    """
    payload = {
        "sub": username,
        "role": role,
        "type": "access",
        "iat": int(time.time()),
        "exp": int(time.time()) + ACCESS_TOKEN_EXPIRE_SECONDS,
        "jti": str(uuid.uuid4()),
    }
    return pyjwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


def create_refresh_token(username: str) -> str:
    """
    Build a refresh token and persist its JTI to data/refresh_tokens.json.
    The JTI (JWT ID) is the only thing the server stores — not the full token.
    """
    jti = str(uuid.uuid4())
    payload = {
        "sub": username,
        "type": "refresh",
        "iat": int(time.time()),
        "exp": int(time.time()) + REFRESH_TOKEN_EXPIRE_SECONDS,
        "jti": jti,
    }
    token = pyjwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)

    # Write JTI to disk so we can revoke it on logout
    add_refresh_jti(jti)
    return token


def verify_token(token: str, expected_type: str) -> dict:
    """
    Two checks:
      1. Cryptographic: PyJWT verifies the signature and rejects expired tokens.
         Pure computation — no file or network I/O.
      2. Semantic: confirm the 'type' claim matches what we expect.
    """
    try:
        payload = pyjwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
    except pyjwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired. Use your refresh token.")
    except pyjwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token — signature check failed.")

    if payload.get("type") != expected_type:
        raise HTTPException(
            status_code=401,
            detail=f"Wrong token type: expected '{expected_type}', got '{payload.get('type')}'.",
        )
    return payload


# ── Routes ────────────────────────────────────────────────────────────────────

@router.post("/login")
def jwt_login(body: LoginRequest):
    """
    Issues two tokens. Only the refresh token JTI is written to disk.
    The access token exists only in the HTTP response — no server storage.
    Open data/refresh_tokens.json after login to see the JTI appear.
    """
    user = get_user(body.username)
    if not user or user["password"] != body.password:
        raise HTTPException(status_code=401, detail="Invalid credentials")

    access_token = create_access_token(body.username, user["role"])
    refresh_token = create_refresh_token(body.username)  # writes JTI to file

    # Decode for demo visibility — shows the payload anyone can read from the token
    preview = pyjwt.decode(access_token, SECRET_KEY, algorithms=[ALGORITHM])

    return {
        "access_token": access_token,
        "refresh_token": refresh_token,
        "token_type": "Bearer",
        "access_expires_in": ACCESS_TOKEN_EXPIRE_SECONDS,
        "refresh_expires_in": REFRESH_TOKEN_EXPIRE_SECONDS,
        "server_stored_in_file": "Only the refresh token JTI was written to data/refresh_tokens.json",
        "access_token_payload": {
            "sub": preview["sub"],
            "role": preview["role"],
            "type": preview["type"],
            "exp": preview["exp"],
            "note": "Embedded in the token — server reads this without any file I/O!",
        },
    }


@router.get("/protected")
def jwt_protected(credentials: HTTPAuthorizationCredentials = Depends(security)):
    """
    Validates the access token purely by verifying the HMAC signature.
    Notice: no call to db.load() here — zero file I/O.
    This is why JWT scales: spin up 100 server instances and none of them
    need to share any state to handle access token requests.
    """
    token = credentials.credentials
    payload = verify_token(token, "access")

    seconds_left = max(0, payload["exp"] - int(time.time()))

    return {
        "message": "Access granted via JWT Auth!",
        "user": payload["sub"],
        "role": payload["role"],
        "how_verified": "HMAC-SHA256 signature check. No file or DB lookup performed.",
        "server_side_lookup_required": False,
        "seconds_until_expiry": seconds_left,
    }


@router.post("/refresh")
def jwt_refresh(body: RefreshRequest):
    """
    1. Verify the refresh token signature (cryptographic, no I/O).
    2. Load data/refresh_tokens.json and confirm the JTI is still valid.
       This is where revocation is enforced — if the user logged out,
       the JTI was removed and this call returns 401.
    3. Issue a new access token (still no file write needed for the access token).
    """
    payload = verify_token(body.refresh_token, "refresh")

    # This is the ONE file read in the refresh flow — to check for revocation
    jtis = load_refresh_jtis()
    if payload["jti"] not in jtis:
        raise HTTPException(status_code=401, detail="Refresh token revoked. Please log in again.")

    user = get_user(payload["sub"])
    role = user["role"] if user else "user"

    new_access_token = create_access_token(payload["sub"], role)

    return {
        "access_token": new_access_token,
        "token_type": "Bearer",
        "expires_in": ACCESS_TOKEN_EXPIRE_SECONDS,
        "message": "New access token issued. Refresh token reused (JTI unchanged in file).",
    }


@router.post("/logout")
def jwt_logout(body: RefreshRequest):
    """
    Removes the refresh token JTI from data/refresh_tokens.json.
    Open the file before and after — you'll see the JTI disappear.

    The access token is NOT revocable — it remains cryptographically valid
    until its 'exp' timestamp. This is the fundamental JWT trade-off:
    statelessness (no lookup per request) vs. instant revocability.
    """
    try:
        payload = verify_token(body.refresh_token, "refresh")
        remove_refresh_jti(payload["jti"])   # deletes JTI from the JSON file
    except HTTPException:
        pass  # already expired/invalid — proceed anyway

    return {
        "message": "Logged out. JTI removed from data/refresh_tokens.json.",
        "access_token_status": "Still cryptographically valid until its expiry — cannot be revoked without a blocklist.",
        "open_file": "Check data/refresh_tokens.json — the JTI is gone.",
    }


@router.get("/token-store")
def view_token_store():
    """Debug endpoint: shows what's currently in data/refresh_tokens.json."""
    jtis = load_refresh_jtis()
    return {
        "file": "data/refresh_tokens.json",
        "description": "Only refresh token JTIs are stored. Access tokens are stored nowhere.",
        "valid_refresh_jtis": len(jtis),
        "jtis": [j[:12] + "..." for j in jtis],
    }
