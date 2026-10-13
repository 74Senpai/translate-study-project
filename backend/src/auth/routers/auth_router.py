from fastapi import APIRouter, Response, Depends, Request
from src.auth.models.auth_models import (
    GoogleOAuthRequest,
    RefreshRequest,
    AuthResponse
)
from supabase import Client
from src.auth.services.auth_service import AuthService
from src.auth.repositories.auth_repo import AuthRepo
from src.core.supabase import get_system_client, get_supabase
from src.middleware.auth import get_current_user


router = APIRouter(prefix="/auth", tags=["auth"])


def get_auth_repo(
    admin_client: Client = Depends(get_system_client),
    user_client: Client = Depends(get_supabase)
):
    return AuthRepo(admin_client, user_client)


def get_auth_service(
        repo: AuthRepo = Depends(get_auth_repo)
):
    return AuthService(repo=repo)


@router.post("/callback", response_model=AuthResponse)
async def callback(
        request: GoogleOAuthRequest,
        response: Response,
        service: AuthService = Depends(get_auth_service)):
    return service.google_auth(req=request, response=response)


@router.post("/logout")
async def logout(response: Response, user=Depends(get_current_user)):
    response.delete_cookie("refresh_token")
    return {"message": "Logged out successfully"}


@router.post("/refresh", response_model=AuthResponse)
async def refresh(
    request: Request,
    response: Response,
    service: AuthService = Depends(get_auth_service)
):
    return service.refresh_token(req=request, response=response)


@router.get("/me")
async def get_me(
    user=Depends(get_current_user),
    service: AuthService = Depends(get_auth_service)
):
    return service.user_auth(user=user)
