from supabase import Client

table_name = "users"


class AuthRepo():
    def __init__(self, admin: Client, user: Client):
        self.admin = admin
        self.user = user
        self.name = table_name

    def upsert_user(self, user: dict):
        return self.admin.table(self.name).upsert(
            user,
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
