from src.auth.repositories.auth_repo import AuthRepo
from src.auth.models.auth_models import *
from fastapi import Response, HTTPException, Request
from src.config import get_settings
from google.oauth2 import id_token
from google.auth.transport import requests
from src.middleware.auth import get_user_roles
from loguru import logger


def _set_refresh_cookie(response: Response, refresh_token: str):
    from src.config import get_settings
    settings = get_settings()
    response.set_cookie(
        key="refresh_token",
        value=refresh_token,
        httponly=True,
        samesite=settings.cookie_samesite,
        max_age=settings.cookie_max_age,
        secure=settings.cookie_secure,
        domain=settings.cookie_domain,
    )


def _format_auth_response(session, metadata, roles, refresh_token=None):
    user_id = session.user.id
    email = session.user.email
    return AuthResponse(
        access_token=session.access_token,
        refresh_token=refresh_token,
        user=UserSchema(
            id=user_id,
            email=email,
            display_name=metadata.get("full_name") or email.split("@")[0],
            avatar_url=metadata.get("avatar_url"),
            roles=roles,
            is_admin="ADMIN" in roles
        )
    )


def _upsert_profile(repo: AuthRepo, user_id: str, email: str, metadata: dict):
    if not email:
        raise ValueError("Authenticated user is missing an email address.")
    display_name = (
        metadata.get("full_name")
        or metadata.get("name")
        or email.split("@", 1)[0]
    )
    repo.upsert_profile(
        user_id=user_id,
        email=email,
        display_name=display_name,
        avatar_url=metadata.get("avatar_url"),
    )


class AuthService():
    def __init__(self, repo):
        self.repo: AuthRepo = repo

    def google_auth(self, req: GoogleOAuthRequest, response: Response):
        try:
            response.delete_cookie("refresh_token")
            settings = get_settings()
            idinfo = id_token.verify_oauth2_token(
                req.credential, requests.Request(), settings.WEB_CLIENT_ID)
            if idinfo["iss"] not in ["accounts.google.com", "https://accounts.google.com"]:
                raise ValueError("Wrong issuer.")

            auth_res = self.repo.auth_with_id_token("google", req.credential)

            if not auth_res.session:
                raise HTTPException(
                    status_code=401, detail="Invalid credentials")
            _upsert_profile(
                self.repo,
                auth_res.user.id,
                auth_res.user.email,
                auth_res.user.user_metadata or {},
            )

            _set_refresh_cookie(response, auth_res.session.refresh_token)

            roles = get_user_roles(
                auth_res.user.id,
                email=auth_res.user.email,
                user_metadata=auth_res.user.user_metadata or {},
                app_metadata=getattr(auth_res.user, "app_metadata", {}) or {},
            )

            return _format_auth_response(
                auth_res.session,
                auth_res.user.user_metadata,
                roles
            )

        except Exception as e:
            raise HTTPException(status_code=401, detail=str(e))

    def refresh_token(self, req: Request, response: Response):
        try:
            refresh_token = req.cookies.get("refresh_token")
            res = self.repo.refresh_token(refresh_token)
            if not res.session:
                logger.warning("Supabase rejected the refresh token")
                raise HTTPException(
                    status_code=401, detail="Invalid refresh token")

            _upsert_profile(
                self.repo,
                res.user.id,
                res.user.email,
                res.user.user_metadata or {},
            )
            _set_refresh_cookie(response, res.session.refresh_token)
            roles = get_user_roles(
                res.user.id,
                email=res.user.email,
                user_metadata=res.user.user_metadata or {},
                app_metadata=getattr(res.user, "app_metadata", {}) or {},
            )
            return _format_auth_response(res.session, res.user.user_metadata, roles)
        except Exception as e:
            logger.error(f"Refresh error: {str(e)}")
            response.delete_cookie("refresh_token")
            raise HTTPException(status_code=401, detail=str(e))

    def user_auth(self, user):
        user_id = user.get("sub") or user.get("id")
        email = user.get("email")
        metadata = user.get("user_metadata") or {}
        app_metadata = user.get("app_metadata") or {}

        roles = user.get("roles") or get_user_roles(
            user_id,
            email=email,
            user_metadata=metadata,
            app_metadata=app_metadata,
        )

        _upsert_profile(self.repo, user_id, email, metadata)

        return {
            "id": user_id,
            "email": email,
            "display_name": (
                metadata.get("full_name")
                or metadata.get("name")
                or (email.split("@", 1)[0] if email else "User")
            ),
            "avatar_url": metadata.get("avatar_url"),
            "roles": roles,
            "is_admin": "ADMIN" in roles,
        }
