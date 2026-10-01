from typing import List
from fastapi import APIRouter, Depends, Request
from fastapi.responses import StreamingResponse
from slowapi import Limiter
from slowapi.util import get_remote_address

from src.config import get_settings
from src.translate.services.translate_service import TranslateService
from src.translate.services.typo_service import TypoService
from src.translate.services.analys_service import AnalysService
from src.translate.services.stats_service import StatsService
from src.translate.services.vocab_service import VocabService

from src.translate.models.translate_model import TranslateRequest, SimpleTranslateResponse
from src.translate.models.translate_workflow_model import TranslateWorkflowResponse
from src.translate.workflows.translate_wokrflow import TranslateWorkflow

router = APIRouter(prefix="/translate", tags=["translate"])
limiter = Limiter(key_func=get_remote_address)

_rate_limit: str = get_settings().rate_limit

# Singleton instances
_service: TranslateService | None = None
_analysis_service: AnalysService | None = None
_typo_service: TypoService | None = None
_stats_service: StatsService | None = None
_vocab_service: VocabService | None = None


def get_translate_service() -> TranslateService:
    global _service
    if _service is None:
        _service = TranslateService()
    return _service


def get_analysis_service() -> AnalysService:
    global _analysis_service
    if _analysis_service is None:
        _analysis_service = AnalysService()
    return _analysis_service


def get_typo_service() -> TypoService:
    global _typo_service
    if _typo_service is None:
        _typo_service = TypoService()
    return _typo_service


def get_stats_service() -> StatsService:
    global _stats_service
    if _stats_service is None:
        _stats_service = StatsService()
    return _stats_service


def get_vocab_service() -> VocabService:
    global _vocab_service
    if _vocab_service is None:
        _vocab_service = VocabService()
    return _vocab_service


def get_translate_workflow(
    translator: TranslateService = Depends(get_translate_service),
    analysis: AnalysService = Depends(get_analysis_service),
    typo: TypoService = Depends(get_typo_service),
    stats: StatsService = Depends(get_stats_service),
    vocab: VocabService = Depends(get_vocab_service),
) -> TranslateWorkflow:
    return TranslateWorkflow(
        translator=translator,
        analysis=analysis,
        typo=typo,
        stats=stats,
        vocab=vocab,
    )


@router.post(
    "/simple",
    summary="Simple Translation Stream",
    description="Fast translation without heavy NLP analysis, returning NDJSON stream."
)
@limiter.limit(_rate_limit)
async def translate_simple(
    request: Request,
    data: TranslateRequest,
    workflow: TranslateWorkflow = Depends(get_translate_workflow),
):
    async def stream():
        async for item in workflow.simple_translate(data):
            yield item.model_dump_json() + "\n"

    return StreamingResponse(stream(), media_type="application/x-ndjson")


@router.post(
    "/stream",
    summary="Full Workflow Stream (NDJSON)",
    description="Streaming NDJSON response for real-time translation, typo check, word statistics, rule-based NLP analysis, and vocabulary context extraction."
)
@limiter.limit(_rate_limit)
async def translate_stream(
    request: Request,
    data: TranslateRequest,
    workflow: TranslateWorkflow = Depends(get_translate_workflow),
):
    async def stream():
        async for item in workflow.translate(data):
            yield item.model_dump_json() + "\n"

    return StreamingResponse(stream(), media_type="application/x-ndjson")


@router.post(
    "/",
    response_model=List[TranslateWorkflowResponse],
    summary="Full Workflow JSON (OpenAPI / Swagger Testable)",
    description="Standard JSON response format ideal for testing in Swagger UI (/docs) and API clients. Executes async tasks concurrently."
)
@limiter.limit(_rate_limit)
async def translate_json(
    request: Request,
    data: TranslateRequest,
    workflow: TranslateWorkflow = Depends(get_translate_workflow),
) -> List[TranslateWorkflowResponse]:
    results: List[TranslateWorkflowResponse] = []
    async for item in workflow.translate(data):
        results.append(item)
    return results
