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

## Build the Android app
Needs Android SDK and **JDK 21** (Capacitor 8 targets Java 21; JDK 17 fails with "invalid source release: 21", JDK 25 is too new for Gradle 8.14).
```bash
cd app
echo "sdk.dir=C:/Users/<you>/AppData/Local/Android/Sdk" > android/local.properties   # or set ANDROID_HOME
VITE_API_URL=https://your-api.example npm run build   # the app runs at https://localhost, so the API must be https
npx cap sync android
cd android && JAVA_HOME=<path to JDK 21> ./gradlew assembleDebug   # -> app/build/outputs/apk/debug/app-debug.apk
adb install -r app/build/outputs/apk/debug/app-debug.apk
```
- On-device check (emulator or USB phone with the app freshly installed and open): `node scripts/device-check.mjs <screenshot-dir>`. It turns on airplane mode and runs Journeys A, B and C, the guidance and emergency search, and the follow-up reminder.
- Follow-up reminders: one per day at 9:00, carrying only a count and never a name or medical text, because Android shows them on the lock screen. Permission is asked when you save a visit with a follow-up date.
- Android-specific behaviour: online state comes from `@capacitor/network` (the WebView never updates `navigator.onLine`); read-aloud uses native TTS; OCR language files are requested unzipped because Android's packager unpacks `.gz` assets.

## How sync works
Every local change is saved together with a queued operation in one transaction. The queue is pushed on unlock, when the network returns, when the app comes to the foreground, and every minute. Operation IDs make retries safe. Visits are append-only, so they never conflict; same-field patient edits from two devices keep the server value and are flagged for a supervisor. Details: `docs/trd.md` §8.
