# MediSaathi

A personal health helper and community healthcare tool that works completely without internet. Ask health questions in Hindi or English, explain lab reports with on-device OCR, maintain family and patient health notes and follow-ups, access first-aid guidance, and find blood donors.

Single unified codebase built with **Vite + React Router + TailwindCSS**, supporting **Website (PWA)** and **Android (Capacitor)**. Answers come from a built-in library of first-aid and home-care guidance; an optional on-device Gemma model (Google LiteRT-LM) rephrases them in plain words. Nothing about your health leaves the device. Only peer-to-peer blood requests optionally use a backend server.

> All medical content in `content/` is demo content and **has not been clinically reviewed**. Donors are synthetic.

## Layout
| Path | What |
|---|---|
| `frontend/` | Unified Vite + React Router application: website, PWA and Android app (Capacitor, `frontend/android/`) |
| `backend/` | FastAPI server for blood requests and worker sync API |
| `contracts/` | OpenAPI spec exported from the backend |
| `content/` | Bundled content: guidance library, emergency rules, lab tests, demo donors, places |
| `docs/` | PRD, TRD, design system |

## Run the Frontend
```bash
cd frontend
npm install
npm run dev          # http://localhost:5173 (copies OCR and LiteRT runtimes into public/ automatically)
npm test             # unit tests (vitest - 24 suites, 142 tests)
npm run build        # production PWA build in dist/, with offline service worker
npm run preview      # preview production build locally
```
Everything runs directly in the browser: SQLite (OPFS/WASM) for records, Tesseract.js for reading reports, on-device guidance library, and LiteRT-LM.

### The On-Device Model (Optional)
Navigate to More / Settings → **Offline AI model**. Without a model, the assistant still answers reliably straight from the verified guidance library.
- **Gemma 4 E2B** (2.0 GB on web, 2.6 GB on Android): one tap download from Hugging Face.
- **Gemma 3n E2B** (3.0 GB / 3.7 GB): gated by Google's Gemma license. Accept on [Hugging Face](https://huggingface.co/google/gemma-3n-E2B-it-litert-lm), download the file (`gemma-3n-E2B-it-int4-Web.litertlm` for web, `gemma-3n-E2B-it-int4.litertlm` for Android), and select it in the app.
- **Web**: uses WebGPU in modern Chromium/Edge browsers. Runtime `@litert-lm/core` is pinned to **0.18.0**.
- **Android**: native LiteRT-LM (`litertlm-android` 0.18.0) using the GPU with CPU fallback.
- **Safety**: emergencies are detected and answered by deterministic rules before any model runs; every model answer is verified against grounded sources (citations, values, medication names) and falls back to verified library text if discrepancies are detected.

## Run the Backend (Blood Requests & Sync)
```bash
cd backend
python -m venv .venv
.venv/Scripts/pip install -r requirements.txt -r requirements-dev.txt   # macOS/Linux: .venv/bin/pip
cp .env.example .env        # set MEDISAATHI_SECRET
.venv/Scripts/python -m uvicorn app.main:app --port 8000 --env-file .env
.venv/Scripts/python -m pytest
```
- API documentation: http://localhost:8000/docs. The frontend calls `VITE_API_URL` (default `http://localhost:8000`).
- No user accounts required for blood requests. Each request and donor registration uses random local cryptographic tokens.
- Privacy-first: A donor's contact is only revealed after explicit in-app confirmation.

## Build the Android App
Requires Android SDK and **JDK 21** (Capacitor 8 targets Java 21).
```bash
cd frontend
npm run build
npx cap sync android
cd android
./gradlew assembleDebug   # -> app/build/outputs/apk/debug/app-debug.apk
```
- Native LiteRT plugin is registered in `frontend/android/app/src/main/java/in/medisaathi/app/GemmaPlugin.kt`.
- Follow-up reminders only display non-sensitive counts on the lock screen.
