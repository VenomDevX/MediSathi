# MediSaathi

A personal health helper that works without internet. Ask a health question in Hindi or English, read a lab report, keep your family's health notes and follow-ups, get first-aid steps, and find blood donors.

Website (installable, works offline) and Android app from one Next.js codebase. Answers come from a built-in library of first-aid and home-care guidance; an optional on-device Gemma model (Google LiteRT-LM) rephrases them in plain words. Nothing about your health leaves the device. Only blood requests use a server.

> All medical content in `content/` is demo content and **has not been clinically reviewed**. Donors are synthetic.

## Layout
| Path | What |
|---|---|
| `web/` | Next.js app (static export): website, PWA and the Android app (Capacitor, `web/android/`) |
| `backend/` | FastAPI server for blood requests (and the older worker sync API) |
| `contracts/` | OpenAPI spec exported from the backend |
| `content/` | Bundled content: guidance library, emergency rules, lab tests, demo donors, places |
| `docs/` | PRD, TRD, design system |

## Run the website
```bash
cd web
npm install
npm run dev          # http://localhost:3000 (copies the OCR, SQLite and model runtimes into public/ first)
npm test             # unit tests (vitest)
npm run build        # static site in out/, with the offline service worker
npx playwright test  # serves out/ on :4200 and a throwaway API on :8010; phone + laptop viewports
```
Everything runs in the browser: SQLite (OPFS) for your records, Tesseract for reading reports, the answer library, and the model.

### The on-device model (optional)
More → **Offline AI model**. Without a model the assistant still answers, straight from the library.
- **Gemma 4 E2B** (2.0 GB on the web, 2.6 GB on Android): one tap to download from Hugging Face.
- **Gemma 3n E2B** (3.0 GB / 3.7 GB): gated by Google's Gemma licence. Accept it on [Hugging Face](https://huggingface.co/google/gemma-3n-E2B-it-litert-lm), download the file (`gemma-3n-E2B-it-int4-Web.litertlm` for the website, `gemma-3n-E2B-it-int4.litertlm` for Android) and choose it in the app.
- Website: needs a browser with WebGPU (recent Chrome or Edge). Runtime `@litert-lm/core` is pinned to **0.18.0** (0.18.1's packaged WASM does not match its JS).
- Android: native LiteRT-LM (`litertlm-android` 0.18.0) on the GPU, falling back to the CPU.
- Safety: emergencies are answered by fixed rules before any model runs; every model answer is checked against its sources (citations, numbers, medicine names) and replaced by the library text if it adds anything.

## Run the backend (blood requests)
```bash
cd backend
python -m venv .venv
.venv/Scripts/pip install -r requirements.txt -r requirements-dev.txt   # macOS/Linux: .venv/bin/pip
cp .env.example .env        # then set MEDISAATHI_SECRET (see the comment in the file)
.venv/Scripts/python -m uvicorn app.main:app --port 8000 --env-file .env
.venv/Scripts/python -m pytest
```
- API docs: http://localhost:8000/docs. The web app calls `NEXT_PUBLIC_API_URL` (default `http://localhost:8000`).
- No accounts. Each request and each donor registration gets a random key kept only on that device (the server stores its hash).
- A donor's phone number reaches the person asking only after that donor taps **Yes, share my number** on that request. Every share is audited. Stopping being a donor erases the number. Self-registered donors never appear in the coordinator directory.
- Not yet for the public internet: there is no rate limit on creating requests.

## Build the Android app
Needs the Android SDK and **JDK 21** (Capacitor 8 targets Java 21; JDK 25 is too new for Gradle 8.14).
```bash
cd web
echo "sdk.dir=C:/Users/<you>/AppData/Local/Android/Sdk" > android/local.properties   # or set ANDROID_HOME
NEXT_PUBLIC_API_URL=https://your-api.example npm run build   # the app runs at https://localhost, so the API must be https
npx cap sync android
cd android && JAVA_HOME=<path to JDK 21> ./gradlew assembleDebug   # -> app/build/outputs/apk/debug/app-debug.apk
adb install -r app/build/outputs/apk/debug/app-debug.apk
```
- The model plugin is `web/android/app/src/main/java/in/medisaathi/app/GemmaPlugin.kt`. Model files are stored in the app's private storage; the browser model runtime is left out of the APK.
- Running Gemma on the emulator needs more memory than the default 2 GB: `emulator -avd <name> -memory 6144`.
- Follow-up reminders carry only a count, never a name or medical text, because Android shows them on the lock screen.
