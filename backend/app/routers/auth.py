"""Auth routes: email/password + Google OAuth.

Google flow (SPEC):
  1. Browser hits GET /auth/google → redirect to Google consent.
  2. Google redirects to GET /auth/google/callback on this API.
  3. We find-or-create the User (auto-link by email if a password account
     already exists — populates google_sub on the existing row), mint a JWT,
     and redirect the browser to {FRONTEND_URL}/auth/callback?token=...
  4. The SPA stores the token and hydrates via /auth/me.

SessionMiddleware (wired in main.py) holds the OAuth state cookie between
steps 1 and 2. Secrets never leave the backend.
"""

from __future__ import annotations

import re
from urllib.parse import urlencode

from authlib.integrations.starlette_client import OAuth
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import or_, select
from sqlalchemy.orm import Session
from starlette.requests import Request
from starlette.responses import RedirectResponse

from app.config import get_settings
from app.database import get_db
from app.deps import get_current_user
from app.models import User
from app.schemas.user import LoginRequest, RegisterRequest, TokenResponse, UserRead
from app.security import create_access_token, hash_password, verify_password

router = APIRouter(prefix="/auth", tags=["auth"])

oauth = OAuth()
_oauth_registered = False


def _ensure_google_client() -> None:
    """Register the Google OAuth client once settings are available.

    Deferred so importing the module never requires credentials; routes that
    need Google call this and raise 503 when the env isn't configured.
    """
    global _oauth_registered
    settings = get_settings()
    if not settings.google_oauth_enabled:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Google sign-in is not configured on this server.",
        )
    if _oauth_registered:
        return
    oauth.register(
        name="google",
        client_id=settings.google_client_id,
        client_secret=settings.google_client_secret,
        server_metadata_url="https://accounts.google.com/.well-known/openid-configuration",
        client_kwargs={"scope": "openid email profile"},
    )
    _oauth_registered = True


@router.get("/providers")
def auth_providers() -> dict[str, bool]:
    """Public flag so the SPA can show/hide the Google button."""
    return {"google": get_settings().google_oauth_enabled}


@router.post("/register", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
def register(payload: RegisterRequest, db: Session = Depends(get_db)) -> TokenResponse:
    email = payload.email.lower().strip()
    username = payload.username.strip()

    existing = db.execute(
        select(User).where(or_(User.email == email, User.username == username))
    ).scalar_one_or_none()
    if existing is not None:
        # 409 rather than exposing which field collided — cheap defense against
        # username / email enumeration.
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An account with that email or username already exists.",
        )

    user = User(
        email=email,
        username=username,
        name=payload.name.strip(),
        password_hash=hash_password(payload.password),
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    return TokenResponse(access_token=create_access_token(user.slug), user=UserRead.model_validate(user))


@router.post("/login", response_model=TokenResponse)
def login(payload: LoginRequest, db: Session = Depends(get_db)) -> TokenResponse:
    identifier = payload.identifier.lower().strip()
    user = db.execute(
        select(User).where(or_(User.email == identifier, User.username == identifier))
    ).scalar_one_or_none()

    if user is None or user.password_hash is None or not verify_password(
        payload.password, user.password_hash
    ):
        # Generic message — don't leak whether the account exists.
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials.",
        )

    return TokenResponse(access_token=create_access_token(user.slug), user=UserRead.model_validate(user))


@router.get("/me", response_model=UserRead)
def me(current_user: User = Depends(get_current_user)) -> UserRead:
    return UserRead.model_validate(current_user)


@router.get("/google")
async def google_login(request: Request) -> RedirectResponse:
    """Kick off the Google OAuth dance — browser navigates here from the SPA."""
    _ensure_google_client()
    settings = get_settings()
    return await oauth.google.authorize_redirect(request, settings.google_redirect_uri)


@router.get("/google/callback")
async def google_callback(request: Request, db: Session = Depends(get_db)) -> RedirectResponse:
    """Google lands here; we mint a JWT and bounce to the SPA callback page."""
    settings = get_settings()
    frontend = settings.frontend_url.rstrip("/")

    def fail(code: str) -> RedirectResponse:
        return RedirectResponse(f"{frontend}/login?{urlencode({'error': code})}")

    try:
        _ensure_google_client()
        token = await oauth.google.authorize_access_token(request)
    except HTTPException:
        return fail("google_not_configured")
    except Exception:
        return fail("google_auth_failed")

    info = token.get("userinfo") or {}
    google_sub = info.get("sub")
    email_raw = info.get("email")
    email_verified = info.get("email_verified", True)
    name = (info.get("name") or "").strip() or (email_raw or "Vivifi user")

    if not google_sub or not email_raw or not email_verified:
        return fail("google_email_unverified")

    email = str(email_raw).lower().strip()

    try:
        user = _resolve_google_user(db, google_sub=google_sub, email=email, name=name)
    except ValueError:
        return fail("google_account_conflict")

    jwt = create_access_token(user.slug)
    return RedirectResponse(f"{frontend}/auth/callback?{urlencode({'token': jwt})}")


def _resolve_google_user(
    db: Session, *, google_sub: str, email: str, name: str
) -> User:
    """Find or create the User for a Google identity.

    Linking policy (SPEC): if the Google email already belongs to a
    password-based User and that row has no google_sub yet, attach this
    google_sub and sign them in. If google_sub is already claimed by a
    different row, raise ValueError (caller turns that into a soft fail).
    """
    by_sub = db.execute(
        select(User).where(User.google_sub == google_sub)
    ).scalar_one_or_none()
    if by_sub is not None:
        return by_sub

    by_email = db.execute(select(User).where(User.email == email)).scalar_one_or_none()
    if by_email is not None:
        if by_email.google_sub and by_email.google_sub != google_sub:
            raise ValueError("email already linked to a different Google account")
        by_email.google_sub = google_sub
        if not by_email.name and name:
            by_email.name = name
        db.commit()
        db.refresh(by_email)
        return by_email

    user = User(
        email=email,
        username=_unique_username(db, email),
        name=name,
        password_hash=None,
        google_sub=google_sub,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


_USERNAME_RE = re.compile(r"[^a-z0-9_]+")


def _unique_username(db: Session, email: str) -> str:
    """Derive a unique username from the email local-part."""
    local = email.split("@", 1)[0].lower()
    base = _USERNAME_RE.sub("", local.replace(".", "_").replace("-", "_"))[:48]
    if len(base) < 2:
        base = "user"
    candidate = base
    n = 2
    while (
        db.execute(select(User.id).where(User.username == candidate)).scalar_one_or_none()
        is not None
    ):
        suffix = str(n)
        candidate = f"{base[: 64 - len(suffix) - 1]}_{suffix}"
        n += 1
    return candidate
