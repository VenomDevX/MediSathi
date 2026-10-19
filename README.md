# MediSaathi

Offline-first health companion for ASHA workers, caregivers and relief workers: patient records, medical report explanations, first-aid guidance and blood donor search. Works without internet; syncs when a connection returns.

Website (installable PWA) and Android app from one React + TypeScript codebase. Backend: FastAPI + PostgreSQL.

> All medical content in `content/` is demo content and **has not been clinically reviewed**. Patients and donors are synthetic.

## Layout
| Path | What |
|---|---|
| `app/` | React + TypeScript + Vite app (website + Android via Capacitor) |
| `backend/` | FastAPI sync server: auth, idempotent sync, donor directory, admin |
| `contracts/` | OpenAPI spec exported from the backend |
| `content/` | Seed content: guidance, lab tests, donors, demo users |
| `docs/` | PRD, TRD, design system |

## Run the app
```bash
cd app
npm install
npm run dev          # http://localhost:5173
npm test             # unit tests (vitest, real SQLite)
npm run e2e          # builds, then Playwright on phone + laptop viewports
```

## Run the backend
```bash
cd backend
python -m venv .venv
.venv/Scripts/pip install -r requirements.txt -r requirements-dev.txt   # macOS/Linux: .venv/bin/pip
cp .env.example .env        # then set MEDISAATHI_SECRET (see the comment in the file)
docker compose up -d        # optional: PostgreSQL. Without it, set DATABASE_URL=sqlite:///./medisaathi.db
.venv/Scripts/python -m uvicorn app.main:app --port 8000 --env-file .env
.venv/Scripts/python -m pytest
```
- API: http://localhost:8000/docs. Admin: http://localhost:8000/admin
- Demo accounts (synthetic, password `demo-1234` unless `DEMO_PASSWORD` is set): `sunita` (ASHA worker), `rakesh` (coordinator, can see donor contacts), `admin`.
- The app talks to `VITE_API_URL` (default `http://localhost:8000`). Without a server, choose **Use the demo account** on the sign-in screen: everything works offline except sync.

## How sync works
Every local change is saved together with a queued operation in one transaction. The queue is pushed on unlock, when the network returns, when the app comes to the foreground, and every minute. Operation IDs make retries safe. Visits are append-only, so they never conflict; same-field patient edits from two devices keep the server value and are flagged for a supervisor. Details: `docs/trd.md` §8.
