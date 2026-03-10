from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes import api_router
from app.core.config import settings
from app.messaging.rpc import rpc_client


@asynccontextmanager
async def lifespan(_: FastAPI):
    await rpc_client.connect()
    try:
        yield
    finally:
        await rpc_client.close()


app = FastAPI(title="Anasti API Gateway", version="0.1.0", lifespan=lifespan)

origins = (
    ["*"]
    if settings.CORS_ORIGINS.strip() == "*"
    else [o.strip() for o in settings.CORS_ORIGINS.split(",") if o.strip()]
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(api_router)


@app.get("/")
async def root():
    return {
        "service": "api-gateway",
        "status": "ok",
        "docs": "/docs",
        "auth_service": "Frontend should call auth service directly for login/refresh.",
    }
