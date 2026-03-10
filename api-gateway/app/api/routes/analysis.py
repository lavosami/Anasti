from typing import Any

from fastapi import APIRouter, Body, Depends

from app.core.config import settings
from app.core.deps import AuthenticatedUser, require_current_user
from app.messaging.rpc import rpc_client

router = APIRouter(prefix="/analysis", tags=["analysis"])


@router.post("/analysis")
async def run_analysis(
    data: dict[str, Any] = Body(...),
    user: AuthenticatedUser = Depends(require_current_user),
) -> dict[str, Any]:
    return await rpc_client.call(
        settings.ANALYSIS_RPC_QUEUE,
        "analysis",
        with_user(data, user.user_id),
    )


@router.post("/get-groups")
async def get_groups(
    data: dict[str, Any] = Body(...),
    user: AuthenticatedUser = Depends(require_current_user),
) -> dict[str, Any]:
    return await rpc_client.call(
        settings.ANALYSIS_RPC_QUEUE,
        "get_groups",
        with_user(data, user.user_id),
    )


@router.post("/type-parameters/number")
async def number_params(
    data: dict[str, Any] = Body(...),
    user: AuthenticatedUser = Depends(require_current_user),
) -> dict[str, Any]:
    return await rpc_client.call(
        settings.ANALYSIS_RPC_QUEUE,
        "number_params",
        with_user(data, user.user_id),
    )


@router.post("/type-parameters/category")
async def category_params(
    data: dict[str, Any] = Body(...),
    user: AuthenticatedUser = Depends(require_current_user),
) -> dict[str, Any]:
    return await rpc_client.call(
        settings.ANALYSIS_RPC_QUEUE,
        "category_params",
        with_user(data, user.user_id),
    )


@router.post("/type-parameters/correlation")
async def correlation_matrix(
    data: dict[str, Any] = Body(...),
    user: AuthenticatedUser = Depends(require_current_user),
) -> dict[str, Any]:
    return await rpc_client.call(
        settings.ANALYSIS_RPC_QUEUE,
        "correlation_params",
        with_user(data, user.user_id),
    )


def with_user(payload: dict[str, Any], user_id: int) -> dict[str, Any]:
    data = dict(payload)
    data["user_id"] = user_id
    return data
