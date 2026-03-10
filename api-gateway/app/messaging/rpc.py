import asyncio
import json
import uuid
from typing import Any

import aio_pika
from aio_pika.abc import AbstractIncomingMessage
from fastapi import HTTPException

from app.core.config import settings


class RpcClient:
    def __init__(self) -> None:
        self.connection: aio_pika.RobustConnection | None = None
        self.channel: aio_pika.abc.AbstractChannel | None = None
        self.callback_queue: aio_pika.abc.AbstractQueue | None = None
        self.futures: dict[str, asyncio.Future[dict[str, Any]]] = {}

    async def connect(self) -> None:
        self.connection = await aio_pika.connect_robust(settings.AMQP_URL)
        self.channel = await self.connection.channel()
        self.callback_queue = await self.channel.declare_queue(exclusive=True, auto_delete=True)
        await self.callback_queue.consume(self.on_response)

    async def close(self) -> None:
        if self.channel is not None:
            await self.channel.close()
        if self.connection is not None:
            await self.connection.close()

    async def on_response(self, message: AbstractIncomingMessage) -> None:
        async with message.process():
            correlation_id = message.correlation_id
            if correlation_id is None:
                return
            future = self.futures.pop(correlation_id, None)
            if future is not None and not future.done():
                future.set_result(json.loads(message.body))

    async def call(self, queue_name: str, action: str, payload: dict[str, Any]) -> dict[str, Any]:
        if self.channel is None or self.callback_queue is None:
            raise HTTPException(status_code=503, detail="RPC client is not connected")

        correlation_id = str(uuid.uuid4())
        loop = asyncio.get_running_loop()
        future: asyncio.Future[dict[str, Any]] = loop.create_future()
        self.futures[correlation_id] = future

        await self.channel.default_exchange.publish(
            aio_pika.Message(
                body=json.dumps({"action": action, "payload": payload}).encode(),
                correlation_id=correlation_id,
                reply_to=self.callback_queue.name,
                content_type="application/json",
            ),
            routing_key=queue_name,
        )

        try:
            response = await asyncio.wait_for(future, timeout=settings.RPC_TIMEOUT_SECONDS)
        except TimeoutError as exc:
            self.futures.pop(correlation_id, None)
            raise HTTPException(status_code=504, detail=f"RPC timeout calling {queue_name}") from exc

        if response.get("status") != "ok":
            error = response.get("error", {})
            raise HTTPException(
                status_code=int(error.get("status_code", 500)),
                detail=error.get("detail", "Upstream RPC error"),
            )

        return response["data"]


rpc_client = RpcClient()
