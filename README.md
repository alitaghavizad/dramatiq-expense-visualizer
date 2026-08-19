# Dramatiq

[![CI](https://github.com/alitaghavizad/dramatiq-expense-visualizer/actions/workflows/ci.yml/badge.svg)](https://github.com/alitaghavizad/dramatiq-expense-visualizer/actions/workflows/ci.yml)

A local-first expense dashboard that turns Armenian and Russian receipt photos
into reviewed PostgreSQL records. Gemini extracts the receipt, you verify every
line, and the dashboard visualizes spending by time, category, store, and price.

## Features

- Armenian and Russian receipt recognition with Google Gemini
- Review-before-save workflow—AI output is never inserted automatically
- One normalized PostgreSQL row per purchased item
- Date, category, store, price, and Armenian/English text filters
- Daily spending, category mix, top-store insights, and purchase ledger
- Manual entry, CSV export, duplicate-receipt protection, and deletion
- Responsive desktop and mobile interface

Receipt images are processed in memory and are not stored by the application.
Only reviewed structured values, the source filename, and a SHA-256 hash are
saved. Images submitted for recognition are sent to the configured Gemini API.

## Technology

- React 19 and vinext/Vite
- Node.js and Express 5
- PostgreSQL 18
- Google Gemini Interactions API with JSON-schema output
- Recharts for dashboard visualizations

The default recognition model is `gemini-3.7-flash`. Override it with
`GEMINI_MODEL` without changing application code.

## Quick start

### Requirements

- Node.js 22.13 or newer
- Docker Desktop, or an existing PostgreSQL server
- A [Gemini API key](https://aistudio.google.com/app/apikey)

### 1. Install and configure

```bash
npm ci
```

Copy `.env.example` to `.env` and add your Gemini key:

```env
GEMINI_API_KEY=your-key-here
```

Never commit `.env` or paste an API key into an issue.

### 2. Start PostgreSQL

For the included local database:

```bash
docker compose up -d database
npm run db:init
```

The Compose database is bound to `127.0.0.1` and uses development-only
credentials from `.env.example`. To use an existing database instead, change
`DATABASE_URL` and run `npm run db:init`; the schema operation is idempotent.

### 3. Start the application

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). The local API listens on
`127.0.0.1:3001` by default.

## Environment variables

| Variable | Required | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `GEMINI_API_KEY` | For scanning | Gemini API authentication |
| `GEMINI_MODEL` | No | Recognition model; defaults to `gemini-3.7-flash` |
| `API_HOST` | No | API bind address; defaults to `127.0.0.1` |
| `API_PORT` | No | API port; defaults to `3001` |
| `APP_ORIGIN` | No | Comma-separated allowed browser origins |
| `NEXT_PUBLIC_EXPENSE_API_URL` | No | Browser-facing API URL |

## Commands

| Command | Description |
| --- | --- |
| `npm run dev` | Start the web app and API with live reload |
| `npm run db:init` | Create or update the PostgreSQL schema |
| `npm run build` | Build the web app and compile the API |
| `npm start` | Run the previously built app and API |
| `npm test` | Run project tests |
| `npm run lint` | Run static analysis |
| `npm run audit` | Check all dependencies for high-severity advisories |
| `npm run check` | Run lint, tests, build, and dependency audit |

## Data model

`receipts` stores receipt-level metadata and extraction provenance.
`expenses` stores one row per reviewed item, including:

- date and receipt relationship
- original Armenian name and optional English translation
- category, store, and quantity
- unit price, total price, and currency
- extraction confidence and timestamps

The complete idempotent schema is in [`database/schema.sql`](database/schema.sql).

## Security notes

- The API binds to localhost by default.
- Receipt uploads are restricted to JPG, PNG, and WEBP files under 12 MB.
- Scan requests are rate-limited and time out after 60 seconds.
- API keys stay server-side and `.env` files are ignored by Git.
- All dependencies are checked for high-severity advisories in CI.
