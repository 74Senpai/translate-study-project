from fastapi import Request
from fastapi.responses import JSONResponse
from loguru import logger


class TranslationError(Exception):
    def __init__(self, message: str = "Translation error occurred", status_code: int = 500, lang: str = "en"):
        self.message = message
        self.status_code = status_code
        self.lang = lang
        super().__init__(self.message)


class RateLimitError(TranslationError):
    def __init__(self, message: str = "Rate limit exceeded. Please try again later.", lang: str = "en"):
        super().__init__(message=message, status_code=429, lang=lang)


class AiDailyLimitError(TranslationError):
    def __init__(self, message: str = "AI Daily Limit reached.", lang: str = "en"):
        super().__init__(message=message, status_code=429, lang=lang)


class UnsupportedLanguageError(TranslationError):
    def __init__(self, message: str = "Unsupported language.", lang: str = "en"):
        super().__init__(message=message, status_code=400, lang=lang)


async def translation_error_handler(request: Request, exc: TranslationError):
    logger.error(f"TranslationError on {request.url.path}: {exc.message}")
    return JSONResponse(
        status_code=exc.status_code,
        content={"detail": exc.message, "error_type": exc.__class__.__name__},
    )


async def generic_error_handler(request: Request, exc: Exception):
    logger.error(f"Unhandled Exception on {request.url.path}: {exc}")
    return JSONResponse(
        status_code=500,
        content={"detail": "Internal server error", "error": str(exc)},
    )
