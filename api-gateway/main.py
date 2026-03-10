from contextlib import asynccontextmanager

from fastapi import FastAPI

from app.api.routes import api_router
from app.messaging.rpc import rpc_client


@asynccontextmanager
async def lifespan(_: FastAPI):
    await rpc_client.connect()
    try:
        yield
    finally:
        await rpc_client.close()


app = FastAPI(title="Anasti API Gateway", version="0.1.0", lifespan=lifespan)
app.include_router(api_router)


@app.get("/")
async def root():
    return {
        "service": "api-gateway",
        "status": "ok",
        "docs": "/docs",
        "auth_service": "Frontend should call auth service directly for login/refresh.",
    }
