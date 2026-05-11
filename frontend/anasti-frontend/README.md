# Anasti Frontend

Vue 3/Vite frontend for Anasti. The app lets users authenticate, import datasets, run analysis through the API gateway, inspect summaries, build charts, switch between English and Russian, and export the current report view as a PDF through the browser print dialog.

## Features

- Login and registration against the auth service.
- Local token persistence in `localStorage`.
- Protected collector and analysis requests through the API gateway.
- Dataset import from raw JSON text and files (`.csv`, `.json`, `.xml`, `.xlsx`, `.xls`).
- Analysis with optional target-field grouping.
- Numeric, categorical, and correlation summary views.
- Date-aware group histograms when analysis returns date buckets.
- ECharts scatter and pie visualizations.
- Browser-based PDF export of the current report.
- English and Russian UI strings.

## Requirements

- Node.js `^20.19.0` or `>=22.12.0`
- npm
- Running Anasti backend services

## Project Setup

```bash
npm install
```

## Development

```bash
npm run dev
```

Vite prints the local URL, usually `http://localhost:5173`.

The frontend expects these backend defaults:

- Auth service: `http://localhost:8001`
- API gateway: `http://localhost:8000`

Override them with environment variables when needed:

```bash
VITE_AUTH_URL=http://localhost:8001 VITE_GATEWAY_URL=http://localhost:8000 npm run dev
```

## Build

```bash
npm run build
```

The production build is written to `dist/`.

Preview a production build locally:

```bash
npm run preview
```

## Linting and Formatting

```bash
npm run lint
npm run format
```

`npm run lint` runs Oxlint and ESLint with autofixes. `npm run format` formats `src/` with Prettier.

## Backend Flow

The frontend talks to two backend entry points:

- Auth requests go directly to `VITE_AUTH_URL`.
- Collector and analysis requests go to `VITE_GATEWAY_URL` with `Authorization: Bearer <access-token>`.

Used routes:

- `POST /auth/login`
- `POST /auth/register`
- `POST /collector/import/json-parser/text`
- `POST /collector/import/csv-parser/csv`
- `POST /collector/import/json-parser/file`
- `POST /collector/import/xml-parser/xml`
- `POST /collector/import/xlsx-parser/xlsx`
- `POST /analysis/analysis`

## Source Layout

```text
src/
  App.vue       # Main application shell, workflow state, imports, analysis, charts, PDF export
  i18n.js       # Lightweight English/Russian message store
  main.js       # Vue app bootstrap
  assets/       # Global styles
  components/   # Template starter components kept from the Vue scaffold
```

## Notes

- Tokens are stored under the `anasti-auth` key in `localStorage`.
- Language selection is stored under the `anasti-locale` key in `localStorage`.
- The SQL importer state exists in the component code, but the current UI exposes JSON text and file import controls.
- PDF export uses `window.print()`, so the user chooses "Save as PDF" in the browser print dialog.
