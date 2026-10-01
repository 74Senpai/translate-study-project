from fastapi import APIRouter
from src.translate.routers.translate_router import router as translate_router

router = APIRouter(prefix="/api/v1")
router.include_router(translate_router)
