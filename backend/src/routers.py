from fastapi import APIRouter
from src.translate.routers.translate_router import router as translate_router
from src.flashcard.routers.flashcard_router import router as flashcard_router
from src.auth.routers.auth_router import router as auth_router

router = APIRouter(prefix="/api/v1")
router.include_router(translate_router)
router.include_router(flashcard_router)
router.include_router(auth_router)
