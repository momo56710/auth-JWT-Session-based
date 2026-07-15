"""
AUTH DEMO - FastAPI Backend
============================
This app runs two completely separate auth routers side by side so you can
compare them live. Both protect the same kind of resource; the difference is
entirely in HOW identity is established on each request.
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from session_auth import router as session_router
from jwt_auth import router as jwt_router

app = FastAPI(title="Auth Comparison Demo")

# CORS must allow credentials (cookies) for session auth to work cross-origin.
# When allow_credentials=True, allow_origins CANNOT be ["*"] — must be explicit.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],  # Vite dev server origin
    allow_credentials=True,                   # Required so the browser sends cookies
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount both routers under different URL prefixes
app.include_router(session_router, prefix="/session", tags=["Session Auth"])
app.include_router(jwt_router, prefix="/jwt", tags=["JWT Auth"])


@app.get("/")
def root():
    return {"message": "Auth Demo API — visit /docs for the interactive API explorer"}
