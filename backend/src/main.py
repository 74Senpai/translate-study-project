from contextlib import asynccontextmanager
import os
from fastapi import FastAPI, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse
from slowapi import Limiter
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address

from src.api.health.router import router as health_router
from src.api.client.router import router as client_router
from src.api.admin.router import router as admin_router
from src.routers import router as router_v2
from src.config import get_settings
from src.core.database import connect_db, close_db
from src.core.exceptions import RateLimitError, TranslationError, generic_error_handler, translation_error_handler
from src.core.logging import setup_logging
from src.shared.translate.cache import TranslationCache


async def custom_rate_limit_handler(request, exc):
    """Handle rate limits with language-aware error messages."""
    path = request.url.path
    lang = "en" if "en-vi" in path or "en" in path else "vi"
    return await translation_error_handler(request, RateLimitError(lang=lang))


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup and shutdown events with service pre-warming."""
    settings = get_settings()
    setup_logging(debug=settings.debug)

    from loguru import logger
    logger.info(f"Starting {settings.app_name} v{settings.app_version}")
    logger.info(f"CORS origins: {settings.cors_origins}")

    await connect_db()

    # Initialize translation cache
    await TranslationCache(ttl_days=settings.translation_cache_ttl_days).ensure_indexes()

    # Pre-load/Warm up NLP and dictionary services
    from src.translate.services.translate_service import TranslateService
    from src.translate.services.analys_service import AnalysService
    from src.translate.services.typo_service import TypoService
    from src.translate.services.stats_service import StatsService
    from src.translate.services.vocab_service import VocabService

    logger.info("Warming up translation, NLP, spellcheck, and vocabulary services...")
    TranslateService()
    AnalysService()
    TypoService()
    StatsService()
    VocabService()
    logger.info("Services warmed up and ready.")

    yield  # Application execution context

    await close_db()
    logger.info("Application shutdown completed.")


def create_app() -> FastAPI:
    """Application factory — creates and configures the FastAPI instance with OpenAPI documentation."""
    settings = get_settings()

    app = FastAPI(
        title=settings.app_name,
        description="FastAPI Backend for Language Translation, NLP Rule-based Sentence Analysis, Word Statistics, and Context Vocabulary Extraction.",
        version=settings.app_version,
        docs_url="/docs",
        redoc_url="/redoc",
        openapi_url="/openapi.json",
        lifespan=lifespan,
    )

    # ── Rate limiting ──────────────────────────────────────────────────────────
    limiter = Limiter(key_func=get_remote_address)
    app.state.limiter = limiter
    app.add_exception_handler(RateLimitExceeded, custom_rate_limit_handler)

    # ── CORS ───────────────────────────────────────────────────────────────────
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # ── Exception Handlers ─────────────────────────────────────────────────────
    app.add_exception_handler(TranslationError, translation_error_handler)
    app.add_exception_handler(Exception, generic_error_handler)

    # ── Routers ────────────────────────────────────────────────────────────────
    app.include_router(health_router)
    app.include_router(client_router)
    app.include_router(admin_router)
    app.include_router(router_v2)

    # Static file mounting if static folder exists
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    static_path = os.path.join(base_dir, "static")
    if os.path.exists(static_path):
        app.mount("/static", StaticFiles(directory=static_path), name="static")

    @app.get("/favicon.ico", include_in_schema=False)
    async def favicon():
        fav_path = os.path.join(static_path, "favicon.ico")
        if os.path.exists(fav_path):
            return FileResponse(fav_path)
        return Response(status_code=404)

    @app.get("/", tags=["root"], include_in_schema=False)
    async def root():
        return {
            "message": f"Welcome to {settings.app_name}",
            "version": settings.app_version,
            "docs": "/docs",
            "openapi": "/openapi.json"
        }

    return app


app = create_app()


if __name__ == "__main__":
    import uvicorn
    _s = get_settings()
    uvicorn.run("src.main:app", host=_s.app_host, port=_s.app_port, reload=_s.debug)
