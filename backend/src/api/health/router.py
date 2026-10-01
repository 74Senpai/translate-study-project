from fastapi import APIRouter

router = APIRouter(prefix="/health", tags=["health"])


@router.get("")
async def health_check():
    return {"status": "ok", "service": "Translate Platform API", "version": "1.0.0"}
