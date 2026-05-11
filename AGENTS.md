# Repository Guidelines

## Project Structure & Module Organization

Anasti is a Docker-composed microservice application. The root `docker-compose.yml` starts RabbitMQ, PostgreSQL, the API gateway, three FastAPI services, and the Vue frontend. Backend code lives in `api-gateway/` and `services/`: `services/auth` handles users and JWTs, `services/anasti_collector` imports CSV/XLSX/XML/JSON/SQL data, and `services/anasti_analize` computes summaries, groups, and correlations. Each service keeps FastAPI entry points in `main.py` and application modules under `app/`, typically split into `api/`, `core/`, `messaging/`, and `services/`. Frontend code is in `frontend/anasti-frontend/src`; static assets are in `frontend/anasti-frontend/public` and `src/assets`.

## Build, Test, and Development Commands

- `docker compose up --build`: build and run the full stack locally.
- `cd frontend/anasti-frontend && npm install`: install Vue/Vite dependencies.
- `npm run dev`: start the frontend dev server.
- `npm run build`: create a production frontend build in `dist/`.
- `npm run lint`: run Oxlint and ESLint with autofixes.
- `npm run format`: format frontend source with Prettier.
- `fastapi dev main.py` or `uvicorn main:app --reload`: run a FastAPI service from its service directory.
- `uv sync` or `pip install -r requirements.txt`: install Python service dependencies, depending on the service setup.

## Coding Style & Naming Conventions

Python uses standard FastAPI module organization, 4-space indentation, snake_case functions and modules, and Pydantic/SQLModel-style schemas. Keep route handlers thin and put parsing, analysis, persistence, and RPC behavior in service or messaging modules. Vue files use `<script setup>`, 2-space indentation, single quotes, and camelCase state/computed names. Run frontend linting and formatting before committing UI changes.

## Testing Guidelines

No automated test suite is currently committed. Add backend tests under `services/<service>/tests/test_*.py` or `api-gateway/tests/test_*.py` when changing API, auth, parser, analysis, or RPC behavior. Prefer focused tests for parser edge cases and auth failures. If frontend tests are added, document the new `npm` script in `package.json` and keep component tests close to the affected UI.

## Commit & Pull Request Guidelines

Recent history uses short imperative subjects such as `Add charting UI and selectors`; follow that style and keep subjects specific. Pull requests should describe behavior changes, list affected services, include verification commands, link related issues, and attach screenshots or short recordings for frontend changes.

## Security & Configuration Tips

Do not commit real secrets. Local defaults such as `JWT_SECRET`, RabbitMQ credentials, and PostgreSQL credentials are development-only values from `docker-compose.yml`. Keep `VITE_AUTH_URL` and `VITE_GATEWAY_URL` environment-specific when running the frontend outside Docker.
