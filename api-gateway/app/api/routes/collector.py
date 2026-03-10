import base64
from typing import Any

from fastapi import APIRouter, Body, Depends, File, UploadFile

from app.core.config import settings
from app.core.deps import AuthenticatedUser, require_current_user
from app.messaging.rpc import rpc_client

router = APIRouter(prefix="/collector", tags=["collector"])


@router.post("/import/csv-parser/csv")
async def parse_csv(
    file: UploadFile = File(...),
    user: AuthenticatedUser = Depends(require_current_user),
) -> dict[str, Any]:
    return await rpc_client.call(
        settings.COLLECTOR_RPC_QUEUE,
        "csv_file",
        build_file_payload(file.filename, await file.read(), user.user_id),
    )


@router.post("/import/xml-parser/xml")
async def parse_xml(
    file: UploadFile = File(...),
    user: AuthenticatedUser = Depends(require_current_user),
) -> dict[str, Any]:
    return await rpc_client.call(
        settings.COLLECTOR_RPC_QUEUE,
        "xml_file",
        build_file_payload(file.filename, await file.read(), user.user_id),
    )


@router.post("/import/xlsx-parser/xlsx")
async def parse_xlsx(
    file: UploadFile = File(...),
    user: AuthenticatedUser = Depends(require_current_user),
) -> dict[str, Any]:
    return await rpc_client.call(
        settings.COLLECTOR_RPC_QUEUE,
        "xlsx_file",
        build_file_payload(file.filename, await file.read(), user.user_id),
    )


@router.post("/import/json-parser/file")
async def parse_json_file(
    file: UploadFile = File(...),
    user: AuthenticatedUser = Depends(require_current_user),
) -> dict[str, Any]:
    return await rpc_client.call(
        settings.COLLECTOR_RPC_QUEUE,
        "json_file",
        build_file_payload(file.filename, await file.read(), user.user_id),
    )


@router.post("/import/json-parser/text")
async def parse_json_text(
    data: Any = Body(...),
    user: AuthenticatedUser = Depends(require_current_user),
) -> dict[str, Any]:
    return await rpc_client.call(
        settings.COLLECTOR_RPC_QUEUE,
        "json_text",
        {"data": data, "user_id": user.user_id},
    )


@router.post("/import/sql-parser/sql")
async def parse_sql(
    request: dict[str, Any],
    user: AuthenticatedUser = Depends(require_current_user),
) -> dict[str, Any]:
    return await rpc_client.call(
        settings.COLLECTOR_RPC_QUEUE,
        "sql_query",
        {"request": request, "user_id": user.user_id},
    )


def build_file_payload(filename: str | None, contents: bytes, user_id: int) -> dict[str, Any]:
    return {
        "filename": filename,
        "content_base64": base64.b64encode(contents).decode(),
        "user_id": user_id,
    }
