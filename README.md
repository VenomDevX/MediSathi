# MediSaathi

Offline-first health companion for ASHA workers, caregivers and relief workers: patient records, medical report explanations, first-aid guidance and blood donor search. Works without internet; syncs when a connection returns.

Website (installable PWA) and Android app from one React + TypeScript codebase. Backend: FastAPI + PostgreSQL.

> All medical content in `content/` is demo content and **has not been clinically reviewed**. Patients and donors are synthetic.

## Layout
| Path | What |
|---|---|
| `app/` | React + TypeScript + Vite app (website + Android via Capacitor) |
| `backend/` | FastAPI sync server (Phase 6) |
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
