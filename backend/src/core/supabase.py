from backend.src.core.supabase import create_client, Client, ClientOptions
from loguru import logger
from src.config import get_settings

_client: Client | None = None


def get_supabase() -> Client:
    """
    Initialize and return the default Supabase client.
    Note: This client may become 'polluted' with auth state if used for user-auth operations.
    """
    global _client
    if _client is None:
        settings = get_settings()
        if not settings.supabase_url or not settings.supabase_anon_key:
            logger.warning(
                "Supabase credentials missing. Supabase operations will be disabled.")
            raise ValueError(
                "Supabase credentials missing. Supabase operations will be disabled.")

        options = ClientOptions(
            auto_refresh_token=False,
            persist_session=False
        )
        _client = create_client(settings.supabase_url,
                                settings.supabase_anon_key, options=options)
    return _client


def get_system_client() -> Client:
    """
    Returns a fresh Supabase client guaranteed to bypass RLS (assuming SUPABASE_KEY is the service_role key).
    This client is NEVER reused to avoid auth pollution.
    """
    settings = get_settings()
    if not settings.supabase_url or not settings.supabase_service_key:
        raise ValueError(
            "Cannot initialize system client: SUPABASE_URL or SUPABASE_KEY missing.")

    options = ClientOptions(
        auto_refresh_token=False,
        persist_session=False
    )
    return create_client(settings.supabase_url, settings.supabase_service_key, options=options)
