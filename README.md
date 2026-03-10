# Anasti
Automated data analysis and visualization pipeline with an auth service, API gateway, RabbitMQ workers, and a Vue frontend.

## Stack
- `api-gateway`: FastAPI gateway that validates JWTs and forwards work via RabbitMQ.
- `services/auth`: FastAPI auth service with PostgreSQL.
- `services/anasti_collector`: File/SQL importer that normalizes datasets.
- `services/anasti_analize`: Analysis service for summary statistics and correlations.
- `frontend/anasti-frontend`: Vue 3 UI that hits auth directly and the gateway for data work.
- `rabbitmq`: RPC transport between gateway and workers.

## Quick start (Docker)
```bash
docker compose up --build
```

Defaults:
- Gateway: `http://localhost:8000`
- Auth: `http://localhost:8001`
- Collector: `http://localhost:8002`
- Analysis: `http://localhost:8003`
- RabbitMQ management: `http://localhost:15672`

## Frontend
Run locally:
```bash
cd frontend/anasti-frontend
npm install
npm run dev
```

Optional env overrides:
- `VITE_AUTH_URL` (default `http://localhost:8001`)
- `VITE_GATEWAY_URL` (default `http://localhost:8000`)

## Auth flow
1. Frontend calls `POST /auth/login` or `POST /auth/register`.
2. Gateway requests require `Authorization: Bearer <access-token>`.
3. Datasets are processed in memory only; only user data is stored in the auth database.
