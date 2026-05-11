# Anasti

Anasti is a Docker-composed data import, analysis, and visualization application. It combines a FastAPI auth service, a FastAPI API gateway, RabbitMQ RPC workers for data collection and analysis, PostgreSQL for user accounts, and a Vue 3 frontend.

Datasets are processed in memory. The auth service persists users, but imported datasets and analysis results are not stored by the backend services.

## Architecture

```text
frontend/anasti-frontend
  |-- calls /auth/* directly ------------------> services/auth
  `-- calls protected data routes -------------> api-gateway
                                                    |
                                                    | RabbitMQ RPC
                                                    |-- collector.rpc --> services/anasti_collector
                                                    `-- analysis.rpc  --> services/anasti_analize

services/auth ----------------------------------> PostgreSQL
```

## Services

- `api-gateway`: FastAPI gateway that validates access JWTs and forwards collector/analysis work through RabbitMQ.
- `services/auth`: FastAPI auth service backed by PostgreSQL. It registers users, logs them in, and issues access/refresh tokens.
- `services/anasti_collector`: FastAPI service and RabbitMQ worker that imports CSV, XLSX/XLS, XML, JSON, raw JSON payloads, and SQL query results into a normalized column-oriented JSON shape.
- `services/anasti_analize`: FastAPI service and RabbitMQ worker that computes numeric summaries, categorical summaries, correlation matrices, grouped analysis, and date-based group buckets.
- `frontend/anasti-frontend`: Vue 3/Vite UI for authentication, import, analysis, charts, language switching, and PDF export.
- `rabbitmq`: RPC transport between the gateway and worker services.
- `postgres`: User database for the auth service.

## Quick Start

Start the backend stack:

```bash
docker compose up --build
```

Then run the frontend dev server in a second terminal:

```bash
cd frontend/anasti-frontend
npm install
npm run dev
```

Open the Vite URL printed by `npm run dev`, usually `http://localhost:5173`.

## Default Local URLs

When started with Docker Compose:

- API gateway: `http://localhost:8000`
- Auth service: `http://localhost:8001`
- Collector service: `http://localhost:8002`
- Analysis service: `http://localhost:8003`
- RabbitMQ AMQP: `amqp://localhost:5672`
- RabbitMQ management: `http://localhost:15672`
- PostgreSQL: `localhost:5432`

Each FastAPI service exposes interactive docs at `/docs`.

## Frontend Environment

The frontend can be run outside Docker with these optional variables:

- `VITE_AUTH_URL`: auth service base URL. Defaults to `http://localhost:8001`.
- `VITE_GATEWAY_URL`: API gateway base URL. Defaults to `http://localhost:8000`.

Example:

```bash
cd frontend/anasti-frontend
VITE_AUTH_URL=http://localhost:8001 VITE_GATEWAY_URL=http://localhost:8000 npm run dev
```

## Backend Environment

Docker Compose provides development defaults. For manual runs, set the variables each service needs.

Auth service:

- `DATABASE_URL`
- `JWT_SECRET`
- `JWT_ALGORITHM` (default `HS256`)
- `ACCESS_TOKEN_EXPIRE_MINUTES` (default `60`)
- `REFRESH_TOKEN_EXPIRE_DAYS` (default `7`)
- `CORS_ORIGINS` (default `*`)

Gateway:

- `JWT_SECRET`
- `JWT_ALGORITHM` (default `HS256`)
- `AMQP_URL` (default `amqp://guest:guest@rabbitmq:5672/`)
- `COLLECTOR_RPC_QUEUE` (default `collector.rpc`)
- `ANALYSIS_RPC_QUEUE` (default `analysis.rpc`)
- `RPC_TIMEOUT_SECONDS` (default `30`)
- `CORS_ORIGINS` (default `*`)

Collector:

- `JWT_SECRET`
- `JWT_ALGORITHM` (default `HS256`)
- `AMQP_URL` (default `amqp://guest:guest@rabbitmq:5672/`)
- `COLLECTOR_RPC_QUEUE` (default `collector.rpc`)

Analysis:

- `JWT_SECRET`
- `JWT_ALGORITHM` (default `HS256`)
- `AMQP_URL` (default `amqp://guest:guest@rabbitmq:5672/`)
- `ANALYSIS_RPC_QUEUE` (default `analysis.rpc`)

`JWT_SECRET` and `JWT_ALGORITHM` must match across `auth`, `api-gateway`, `anasti_collector`, and `anasti_analize`.

## API Flow

1. The frontend calls `POST /auth/register` or `POST /auth/login` on the auth service.
2. The auth service returns an access token and refresh token.
3. The frontend sends data requests to the gateway with `Authorization: Bearer <access-token>`.
4. The gateway validates the token and publishes an RPC request to `collector.rpc` or `analysis.rpc`.
5. The worker returns normalized data or analysis results through RabbitMQ.

Gateway route prefixes:

- Collector routes are exposed under `/collector/import/...`.
- Analysis routes are exposed under `/analysis/...`.

The collector and analysis services also expose direct HTTP routes for local debugging, but the frontend uses the gateway.

## Common Commands

Backend stack:

```bash
docker compose up --build
docker compose down
```

Frontend:

```bash
cd frontend/anasti-frontend
npm install
npm run dev
npm run build
npm run lint
npm run format
```

Run an individual FastAPI service from its directory:

```bash
uv sync
uvicorn main:app --reload
```

or, with `pip`:

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload
```

For manual gateway, collector, or analysis runs against the Compose RabbitMQ port, set:

```bash
AMQP_URL=amqp://guest:guest@localhost:5672/
```

## Testing

No automated test suite is currently committed. When adding backend tests, place them under `api-gateway/tests/` or `services/<service>/tests/`. When adding frontend tests, add the matching `npm` script to `frontend/anasti-frontend/package.json`.

## Security Notes

- Do not commit real secrets or production database credentials.
- The credentials in `docker-compose.yml` are development defaults only.
- Keep `VITE_AUTH_URL` and `VITE_GATEWAY_URL` environment-specific when running the frontend outside Docker.
- Imported datasets are handled in memory by the current backend services; avoid sending sensitive data to a non-development environment until production storage, retention, and access policies are defined.
