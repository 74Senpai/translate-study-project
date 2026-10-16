from supabase import Client


class AuthRepo():
    def __init__(self, admin: Client, user: Client):
        self.admin = admin
        self.user = user

    def upsert_profile(
        self,
        user_id: str,
        email: str,
        display_name: str,
        avatar_url: str | None = None,
    ):
        normalized_email = email.strip()
        if not normalized_email:
            raise ValueError("A valid email is required to create a user profile.")

        return self.admin.table("profiles").upsert(
            {
                "id": user_id,
                "user_name": normalized_email.lower(),
                "email": normalized_email,
                "display_name": display_name,
                "avatar_url": avatar_url,
            },
            on_conflict="id",
            ignore_duplicates=False
        ).execute()

    def auth_with_id_token(self, provider: str, token: str):
        return self.user.auth.sign_in_with_id_token({
            "provider": provider,
            "token": token
        })

    def refresh_token(self, token: str):
        return self.user.auth.refresh_session(token)
