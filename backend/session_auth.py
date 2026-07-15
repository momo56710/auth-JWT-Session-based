"""
SESSION-BASED AUTHENTICATION
==============================
Core idea: the SERVER holds all the state. The client receives only a random
opaque key (the session ID) that maps back to real data stored on the server.

Persistent storage (simulated here with JSON files):
  data/users.json    → the user table — would be a DB table in production
  data/sessions.json → the session store — would be Redis or a DB table

Because sessions.json is written on every login/logout, you can open it in
a text editor while the app is running and watch entries appear and disappear.

Flow:
  Login   → validate user from users.json, create entry in sessions.json, set cookie
  Request → browser sends cookie automatically, server looks up sessions.json
  Logout  → delete entry from sessions.json; cookie becomes worthless immediately
"""

import time
import uuid
from typing import Optional

from fastapi import APIRouter, Cookie, HTTPException, Response
from pydantic import BaseModel

import db  # our JSON file helper

router = APIRouter()

SESSION_TTL_SECONDS = 3600  # 1 hour


class LoginRequest(BaseModel):
    username: str
    password: str


# ── Helpers ──────────────────────────────────────────────────────────────────

def get_user(username: str) -> dict | None:
    """
    Load the user record from data/users.json.
    Equivalent to: SELECT * FROM users WHERE username = ?
    """
    users = db.load("users.json", default={})
    return users.get(username)


def load_sessions() -> dict:
    """
    Read the full session store from data/sessions.json.
    In production this would be a Redis HGETALL or a DB SELECT.
    """
    return db.load("sessions.json", default={})


def save_sessions(sessions: dict) -> None:
    """
    Persist the session store back to disk.
    In production: Redis SET or a DB INSERT/UPDATE.
    """
    db.save("sessions.json", sessions)


# ── Routes ───────────────────────────────────────────────────────────────────

@router.post("/login")
def session_login(body: LoginRequest, response: Response):
    """
    1. Look up the user in data/users.json (simulates a DB query).
    2. Verify the password.
    3. Generate a random session ID (just a key — carries no user info).
    4. Write the session entry into data/sessions.json (simulates Redis SET).
    5. Send the session ID to the browser as an httpOnly cookie.
    """
    user = get_user(body.username)

    # Simulates: SELECT * FROM users WHERE username = ? AND password = ?
    if not user or user["password"] != body.password:
        raise HTTPException(status_code=401, detail="Invalid credentials")

    # The session ID is a random opaque string — it means nothing on its own
    session_id = str(uuid.uuid4())

    # Build the session record — this is what gets written to sessions.json
    session_data = {
        "username": body.username,
        "email": user["email"],
        "role": user["role"],
        "created_at": time.time(),
        "expires_at": time.time() + SESSION_TTL_SECONDS,
    }

    # Load existing sessions, add the new one, persist back to disk
    # Simulates: INSERT INTO sessions (id, data, expires_at) VALUES (...)
    sessions = load_sessions()
    sessions[session_id] = session_data
    save_sessions(sessions)

    # httponly=True  → JavaScript cannot read this cookie (XSS protection)
    # samesite="lax" → browser won't send it on cross-site POST (CSRF protection)
    response.set_cookie(
        key="session_id",
        value=session_id,
        httponly=True,
        samesite="lax",
        max_age=SESSION_TTL_SECONDS,
    )

    return {
        "message": "Logged in. Open data/sessions.json to see your session entry!",
        "session_id_preview": session_id[:8] + "...",
        "session_data_written_to_file": session_data,
        "total_active_sessions": len(sessions),
    }


@router.get("/protected")
def session_protected(session_id: Optional[str] = Cookie(default=None)):
    """
    The browser automatically attaches the session_id cookie.
    The server reads data/sessions.json to validate it.
    This file I/O on every request is the main cost of session auth.
    In production you'd use Redis (microsecond lookups) instead.
    """
    if not session_id:
        raise HTTPException(status_code=401, detail="No session cookie. Please log in.")

    # Simulates: SELECT * FROM sessions WHERE id = ?
    sessions = load_sessions()
    session = sessions.get(session_id)

    if not session:
        raise HTTPException(status_code=401, detail="Session not found (expired or logged out).")

    if time.time() > session["expires_at"]:
        # Clean up expired entry — simulates a background TTL job
        del sessions[session_id]
        save_sessions(sessions)
        raise HTTPException(status_code=401, detail="Session expired. Please log in again.")

    return {
        "message": "Access granted via Session Auth!",
        "user": session["username"],
        "email": session["email"],
        "role": session["role"],
        "how_verified": "Read sessions.json and matched the session ID → user data.",
        "server_side_lookup_required": True,
        "active_sessions_on_server": len(sessions),
    }


@router.post("/logout")
def session_logout(response: Response, session_id: Optional[str] = Cookie(default=None)):
    """
    True, immediate logout: delete the entry from sessions.json.
    Any copy of the session ID cookie becomes worthless at this exact moment.
    Watch sessions.json — the entry disappears instantly on logout.
    """
    sessions = load_sessions()

    if session_id and session_id in sessions:
        # Simulates: DELETE FROM sessions WHERE id = ?
        del sessions[session_id]
        save_sessions(sessions)

    response.delete_cookie("session_id")

    return {
        "message": "Logged out. Entry removed from sessions.json.",
        "revocation": "Immediate — any copy of the session ID is now worthless.",
        "remaining_sessions": len(sessions),
    }


@router.get("/session-store")
def view_session_store():
    """
    Debug endpoint: returns the full contents of sessions.json.
    Lets the UI display what is currently written to disk.
    """
    sessions = load_sessions()
    return {
        "file": "data/sessions.json",
        "active_sessions": len(sessions),
        # Truncate session IDs so we don't expose the full keys in the demo UI
        "sessions": {k[:8] + "...": v for k, v in sessions.items()},
    }


@router.get("/users")
def view_users():
    """Debug endpoint: shows the user 'table' from users.json (passwords included for demo clarity)."""
    return {
        "file": "data/users.json",
        "users": db.load("users.json", default={}),
    }
