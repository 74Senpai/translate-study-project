
# CREATE TABLE "user" (
#     id UUID PRIMARY KEY,
#     username VARCHAR(255) UNIQUE,
#     display_name VARCHAR(255),
#     avatar_url TEXT,
#     name TEXT,
#     password TEXT,
#     created_at TIMESTAMPTZ,
#     updated_at TIMESTAMPTZ
# );


from pydantic import BaseModel, EmailStr, Field
from datetime import datetime, timezone
from typing import Optional


class UserAuth(BaseModel):
    id: str
    username: str
    display_name: Optional[str] = None
    avatar_url: Optional[str] = None
    name: Optional[str] = None
    password: Optional[str] = None
    created_at: Optional[datetime] = None
    updated_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc)
    )


class GoogleOAuthRequest(BaseModel):
    credential: str
    clientId: Optional[str] = None
    client_id: Optional[str] = None
    select_by: Optional[str] = None
    client_type: Optional[str] = "web"


class UserSchema(BaseModel):
    id: str
    email: str
    display_name: str
    avatar_url: Optional[str] = None
    roles: list[str] = []
    is_admin: bool = False


class AuthResponse(BaseModel):
    access_token: str
    refresh_token: Optional[str] = None
    user: UserSchema


class RefreshRequest(BaseModel):
    refresh_token: Optional[str] = None
    client_type: Optional[str] = "extension"
