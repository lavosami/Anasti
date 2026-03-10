from fastapi import APIRouter

from app.api.routes.analysis import router as analysis_router
from app.api.routes.collector import router as collector_router

api_router = APIRouter()
api_router.include_router(collector_router)
api_router.include_router(analysis_router)
