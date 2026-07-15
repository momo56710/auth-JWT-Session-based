"""
OAUTH 2.0 — AUTHORIZATION CODE FLOW
=====================================
This module implements OAuth login for Google and GitHub using the standard
Authorization Code flow. After a successful OAuth exchange the server creates
a regular session (same sessions.json as session_auth.py) so you can compare
directly: the only difference is HOW the identity was established.

Flow for both providers:
  1. /oauth/{provider}/login   → build the provider's auth URL, redirect browser there
  2. Provider authenticates the user, redirects back to /oauth/{provider}/callback?code=…
  3. Backend exchanges the code for an access token (server-to-server POST)
  4. Backend fetches user info using that access token
  5. Backend upserts the user in users.json and creates a session
  6. Backend sets a session cookie and redirects back to the frontend

State parameter:
  A random UUID is generated on step 1 and stored in a short-lived cookie.
  On step 3 we verify the returned state matches — this prevents CSRF attacks
  where a malicious site forces a user to complete an OAuth flow they didn't start.

Setup:
  Copy .env.example to .env and fill in your credentials.
  Google: https://console.cloud.google.com/ → APIs & Services → Credentials → OAuth 2.0 Client ID
  GitHub: https://github.com/settings/developers → OAuth Apps → New OAuth App
"""

import os
import time
import uuid
from urllib.parse import urlencode

import httpx
from dotenv import load_dotenv
from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import RedirectResponse

import db

load_dotenv()

router = APIRouter()

# ── Config ─────────────────────────────────────────────────────────────────────

GOOGLE_CLIENT_ID     = os.getenv("GOOGLE_CLIENT_ID", "")
GOOGLE_CLIENT_SECRET = os.getenv("GOOGLE_CLIENT_SECRET", "")
GITHUB_CLIENT_ID     = os.getenv("GITHUB_CLIENT_ID", "")
GITHUB_CLIENT_SECRET = os.getenv("GITHUB_CLIENT_SECRET", "")

BACKEND_URL  = os.getenv("BACKEND_URL", "http://localhost:8000")
FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:5173")

GOOGLE_REDIRECT_URI = f"{BACKEND_URL}/oauth/google/callback"
GITHUB_REDIRECT_URI = f"{BACKEND_URL}/oauth/github/callback"

SESSION_TTL_SECONDS = 3600


# ── Helpers ────────────────────────────────────────────────────────────────────

def _upsert_user(username: str, email: str, provider: str, full_name: str = "") -> None:
    """Add user to users.json if not already present. OAuth users have no password."""
    users = db.load("users.json", default={})
    if username not in users:
        users[username] = {
            "password": None,          # no password — identity comes from the provider
            "email": email,
            "role": "user",
            "full_name": full_name,
            "provider": provider,
            "created_at": time.strftime("%Y-%m-%dT%H:%M:%S"),
        }
        db.save("users.json", users)


def _create_session(username: str, email: str, provider: str) -> str:
    """Write a session entry to sessions.json and return the session_id cookie value."""
    session_id = str(uuid.uuid4())
    sessions = db.load("sessions.json", default={})
    sessions[session_id] = {
        "username": username,
        "email": email,
        "role": "user",
        "provider": provider,
        "created_at": time.time(),
        "expires_at": time.time() + SESSION_TTL_SECONDS,
    }
    db.save("sessions.json", sessions)
    return session_id


def _check_configured(client_id: str, provider: str) -> None:
    if not client_id:
        raise HTTPException(
            status_code=503,
            detail=f"{provider} OAuth is not configured. Set {provider.upper()}_CLIENT_ID in your .env file.",
        )


# ── Google ─────────────────────────────────────────────────────────────────────

@router.get("/google/login")
def google_login(request: Request):
    """
    Step 1 — redirect the browser to Google's consent screen.
    The 'state' param is a random value we'll verify on return to prevent CSRF.
    """
    _check_configured(GOOGLE_CLIENT_ID, "Google")

    state = str(uuid.uuid4())
    params = {
        "client_id":     GOOGLE_CLIENT_ID,
        "redirect_uri":  GOOGLE_REDIRECT_URI,
        "response_type": "code",
        "scope":         "openid email profile",
        "state":         state,
        "access_type":   "online",
    }
    auth_url = "https://accounts.google.com/o/oauth2/v2/auth?" + urlencode(params)

    resp = RedirectResponse(auth_url)
    # Short-lived httpOnly cookie holds the state for CSRF validation on callback
    resp.set_cookie("oauth_state", state, httponly=True, max_age=300, samesite="lax")
    return resp


@router.get("/google/callback")
async def google_callback(code: str, state: str, request: Request):
    """
    Step 2 — Google redirects here with ?code=…&state=…
    We exchange the code for tokens, fetch the user's profile, create a session.
    """
    # CSRF check
    if request.cookies.get("oauth_state") != state:
        raise HTTPException(status_code=400, detail="OAuth state mismatch — possible CSRF attack.")

    async with httpx.AsyncClient() as client:
        # Exchange authorization code for access token (server-to-server)
        token_resp = await client.post(
            "https://oauth2.googleapis.com/token",
            data={
                "code":          code,
                "client_id":     GOOGLE_CLIENT_ID,
                "client_secret": GOOGLE_CLIENT_SECRET,
                "redirect_uri":  GOOGLE_REDIRECT_URI,
                "grant_type":    "authorization_code",
            },
        )
        token_data = token_resp.json()
        access_token = token_data.get("access_token")

        if not access_token:
            raise HTTPException(status_code=400, detail=f"Token exchange failed: {token_data}")

        # Fetch the user's profile from Google
        user_resp = await client.get(
            "https://www.googleapis.com/oauth2/v3/userinfo",
            headers={"Authorization": f"Bearer {access_token}"},
        )
        user_info = user_resp.json()

    email     = user_info.get("email", "")
    full_name = user_info.get("name", "")
    # Prefix with provider to avoid collisions with session/jwt users
    username  = f"google_{user_info.get('sub', email)}"

    _upsert_user(username, email, "google", full_name)
    session_id = _create_session(username, email, "google")

    resp = RedirectResponse(f"{FRONTEND_URL}?oauth=success&provider=google")
    resp.set_cookie("session_id", session_id, httponly=True, samesite="lax", max_age=SESSION_TTL_SECONDS)
    resp.delete_cookie("oauth_state")
    return resp


# ── GitHub ─────────────────────────────────────────────────────────────────────

@router.get("/github/login")
def github_login(request: Request):
    """
    Step 1 — redirect the browser to GitHub's authorization page.
    """
    _check_configured(GITHUB_CLIENT_ID, "GitHub")

    state = str(uuid.uuid4())
    params = {
        "client_id":    GITHUB_CLIENT_ID,
        "redirect_uri": GITHUB_REDIRECT_URI,
        "scope":        "read:user user:email",
        "state":        state,
    }
    auth_url = "https://github.com/login/oauth/authorize?" + urlencode(params)

    resp = RedirectResponse(auth_url)
    resp.set_cookie("oauth_state", state, httponly=True, max_age=300, samesite="lax")
    return resp


@router.get("/github/callback")
async def github_callback(code: str, state: str, request: Request):
    """
    Step 2 — GitHub redirects here with ?code=…&state=…
    Note: GitHub may not include email in the /user response if the user hid it —
    so we also check /user/emails and pick the primary verified address.
    """
    if request.cookies.get("oauth_state") != state:
        raise HTTPException(status_code=400, detail="OAuth state mismatch — possible CSRF attack.")

    async with httpx.AsyncClient() as client:
        # Exchange code for access token
        token_resp = await client.post(
            "https://github.com/login/oauth/access_token",
            data={
                "client_id":     GITHUB_CLIENT_ID,
                "client_secret": GITHUB_CLIENT_SECRET,
                "code":          code,
                "redirect_uri":  GITHUB_REDIRECT_URI,
            },
            headers={"Accept": "application/json"},
        )
        token_data = token_resp.json()
        access_token = token_data.get("access_token")

        if not access_token:
            raise HTTPException(status_code=400, detail=f"Token exchange failed: {token_data}")

        gh_headers = {
            "Authorization": f"Bearer {access_token}",
            "Accept": "application/vnd.github+json",
        }

        # Fetch user profile
        user_resp = await client.get("https://api.github.com/user", headers=gh_headers)
        user_info = user_resp.json()

        # GitHub hides email if user set it private — fetch /user/emails as fallback
        email = user_info.get("email")
        if not email:
            emails_resp = await client.get("https://api.github.com/user/emails", headers=gh_headers)
            emails = emails_resp.json()
            primary = next((e for e in emails if e.get("primary") and e.get("verified")), None)
            email = primary["email"] if primary else f"{user_info['login']}@users.noreply.github.com"

    username  = f"github_{user_info['login']}"
    full_name = user_info.get("name") or user_info["login"]

    _upsert_user(username, email, "github", full_name)
    session_id = _create_session(username, email, "github")

    resp = RedirectResponse(f"{FRONTEND_URL}?oauth=success&provider=github")
    resp.set_cookie("session_id", session_id, httponly=True, samesite="lax", max_age=SESSION_TTL_SECONDS)
    resp.delete_cookie("oauth_state")
    return resp
