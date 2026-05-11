# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Anasti is an automated data analysis and visualization pipeline with microservices architecture. The system allows users to import datasets from various sources (files, SQL databases), perform statistical analysis, and visualize results.

**Architecture**: Microservices communicating via RabbitMQ RPC, with JWT-based authentication.

## Stack

- **Backend**: Python FastAPI services
- **Frontend**: Vue 3 with ECharts for visualization
- **Message Queue**: RabbitMQ for RPC communication between gateway and workers
- **Database**: PostgreSQL (auth service only)
- **Containerization**: Docker Compose

## Service Architecture

### Communication Flow

1. Frontend authenticates directly with `auth` service to obtain JWT tokens
2. Frontend sends authenticated requests to `api-gateway` with JWT bearer token
3. Gateway validates JWT and forwards work to backend services via RabbitMQ RPC
4. Worker services (`anasti_collector`, `anasti_analize`) consume RPC messages and return results
5. All dataset processing happens in-memory; only user credentials are persisted

### Services

- **api-gateway** (`localhost:8000`): FastAPI gateway that validates JWTs and proxies requests to workers via RabbitMQ RPC. Uses `aio_pika` for async RPC client pattern.
- **services/auth** (`localhost:8001`): Authentication service with PostgreSQL backend. Provides `/auth/register`, `/auth/login`, `/auth/refresh` endpoints.
- **services/anasti_collector** (`localhost:8002`): Data import worker that normalizes CSV, XML, XLSX, JSON files and SQL query results into column-oriented JSON. Listens on `collector.rpc` queue.
- **services/anasti_analize** (`localhost:8003`): Analysis worker that computes summary statistics, correlations, and groupings. Listens on `analysis.rpc` queue.
- **rabbitmq** (`localhost:5672`, management UI `localhost:15672`): Message broker for RPC transport.

### RPC Pattern

The gateway and workers use a request-reply RPC pattern over RabbitMQ:

- **Gateway** (`api-gateway/app/messaging/rpc.py`): `RpcClient` publishes messages with correlation IDs and waits for responses on an exclusive callback queue
- **Workers** (e.g., `services/anasti_collector/app/messaging/rpc.py`): `CollectorRpcServer` consumes from named queues, dispatches to handlers, and replies to the `reply_to` queue with the same correlation ID
- Messages are JSON with structure: `{"action": "action_name", "payload": {...}}`
- Responses: `{"status": "ok", "data": {...}}` or `{"status": "error", "error": {"status_code": 500, "detail": "..."}}`

## Development Commands

### Full Stack (Docker)

```bash
# Start all services
docker compose up --build

# Stop all services
docker compose down

# View logs for specific service
docker compose logs -f api_gateway
docker compose logs -f auth
```

### Frontend Development

```bash
cd frontend/anasti-frontend

# Install dependencies
npm install

# Run dev server (localhost:5173)
npm run dev

# Build for production
npm run build

# Lint and fix
npm run lint

# Format code
npm run format
```

**Environment variables** (optional):
- `VITE_AUTH_URL`: Auth service URL (default: `http://localhost:8001`)
- `VITE_GATEWAY_URL`: Gateway URL (default: `http://localhost:8000`)

### Backend Services

Each Python service follows the same structure:

```bash
cd services/auth  # or api-gateway, services/anasti_collector, services/anasti_analize

# Create virtual environment
python -m venv .venv
source .venv/bin/activate  # or `.venv\Scripts\activate` on Windows

# Install dependencies
pip install -r requirements.txt

# Run service (uses uvicorn)
uvicorn main:app --reload --port 8000
```

**Environment variables** (see `docker-compose.yml` for full list):
- Auth service: `DATABASE_URL`, `JWT_SECRET`, `JWT_ALGORITHM`
- Gateway/Workers: `AMQP_URL`, `JWT_SECRET`, `JWT_ALGORITHM`, queue names

## Code Patterns

### JWT Authentication

- Auth service issues access tokens (short-lived) and refresh tokens (long-lived)
- Gateway validates tokens using shared `JWT_SECRET` in `app/core/security.py`
- Protected endpoints use `require_current_user` dependency that extracts user ID from token
- Frontend stores tokens in localStorage under key `anasti-auth`

### Adding New RPC Actions

To add a new action to a worker service:

1. Add handler function in appropriate module (e.g., `app/services/parser_service.py`)
2. Register action in `dispatch_request()` in `app/messaging/rpc.py`
3. Add corresponding gateway endpoint in `api-gateway/app/api/routes/`
4. Gateway endpoint calls `rpc_client.call(queue_name, "action_name", payload)`

### Frontend State Management

The Vue 3 frontend uses Composition API with reactive state:
- Authentication state stored in reactive object with localStorage persistence
- Dataset and analysis results stored in refs
- ECharts instances managed with lifecycle hooks for chart rendering
- Internationalization via custom `i18n.js` composable (supports `en` and `ru`)

## Testing

No test framework is currently configured. When adding tests:
- Backend: Use `pytest` with `pytest-asyncio` for async FastAPI tests
- Frontend: Use Vitest (already compatible with Vite setup)

## Important Notes

- **No data persistence**: Datasets are processed entirely in-memory. Only user accounts are stored in PostgreSQL.
- **CORS**: All services allow `*` origins by default (configured via `CORS_ORIGINS` env var)
- **Security**: JWT secrets are hardcoded in `docker-compose.yml` for development. Use proper secrets management in production.
- **RPC Timeout**: Gateway has 30-second timeout for RPC calls (configurable via `RPC_TIMEOUT_SECONDS`)
