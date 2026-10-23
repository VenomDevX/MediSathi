# MediSaathi
## Technical Requirements Document (TRD)

**Document version:** 1.6  
**Status:** As built for Hack-o-Relay 2026 (October 2026). Sections still marked *Proposed* are not implemented yet; see §19 change log.  
**Related document:** MediSaathi PRD v1.6

---

## 1. Technical objectives

Build an offline-first platform that provides:

- Durable local storage.
- Local OCR for supported medical reports.
- Optional on-device language-model inference.
- Retrieval of locally stored, clinically reviewed guidance.
- Offline patient and donor-directory workflows.
- Secure synchronization with a central backend.
- One web codebase delivered as an offline-capable website (PWA, used on laptops and desktops) and an Android app (Capacitor).

The architecture must allow individual capabilities to operate independently. If the AI model cannot load, local records, OCR, and approved guidance browsing should remain available.

## 2. Technology stack

| Layer | Technology | Status |
|---|---|---|
| Client codebase | React 19 + TypeScript + Vite, HashRouter; one codebase for website, PWA and Android app (`frontend/`) | Built |
| Styling | Tailwind CSS v4, Phosphor icons, Mukta font for Devanagari | Built |
| Website offline shell | Installable PWA, service worker precaches the app, OCR data and the LiteRT-LM runtime (`vite-plugin-pwa`) | Built |
| Mobile app shell | Capacitor 8 (Android) wrapping the same web build, `androidScheme: https` | Built |
| Local database (both) | `@sqlite.org/sqlite-wasm` persisted to OPFS in a worker, with FTS5 for the guidance library. The Android WebView uses the same database code. | Built |
| Data access | One TypeScript repository layer over a `Database` interface; schema migrations run in `sqlite.worker.ts` | Built |
| OCR (both) | tesseract.js with `eng` + `hin` traineddata served by the app (no CDN); confidence per line flags unclear values | Built |
| PDF (both) | pdf.js: text extraction first, page rendering for OCR | Built |
| Website local AI | Gemma 4 E2B (web build, 2.0 GB) through `@litert-lm/core` 0.18.0 on WebGPU; Gemma 3n E2B by user-supplied file | Built; optional, needs WebGPU |
| Mobile local AI | Gemma 4 E2B (2.6 GB) through native LiteRT-LM (`litertlm-android` 0.18.0) in `GemmaPlugin.kt`: GPU first, CPU fallback remembered per device | Built; optional |
| Online AI (optional prototype) | Gemini (`gemini-3.8-flash`, low thinking) through `POST /api/v1/assist` on our FastAPI server (`app/assist.py`); key in `GEMINI_API_KEY`, 30 calls/hour per address. The client sends only the question, language and library card ids; the server builds the prompt from its own template and `content/guidance.json`, so the endpoint cannot run arbitrary prompts. Client: `src/assistant/online.ts`. Reports are never sent; the guard still checks every answer | Built; off unless chosen and the key is set |
| Text-to-speech | Web Speech API (website); `@capacitor-community/text-to-speech` (Android) | Built |
| Voice input | Android: native `SpeechRecognizer` in `SpeechPlugin.kt` (the WebView's own recognition does not work), on-device recognizer on Android 12+, otherwise the system recognizer with `EXTRA_PREFER_OFFLINE`; `RECORD_AUDIO` asked on first use. Website: Web Speech API with `processLocally` when `SpeechRecognition.available()` reports the language pack installed, background `install()` otherwise, the browser's online service meanwhile. Errors map to no-speech / offline / denied / unavailable messages (`src/platform/listen.ts`) | Built |
| Location | Manual locality choice on both; browser geolocation where allowed | Built |
| API backend | FastAPI (`backend/`) | Built |
| Server database | PostgreSQL in production; SQLite for local development and tests | Built |
| Authentication | Argon2 password hashes, 15-minute JWT access token, rotating hashed refresh token; offline PIN unlock on the device (§8.0) | Built |
| Sign up and Google sign-in | `POST /api/v1/auth/signup` creates citizens only (Argon2, username 3 to 32 of `[A-Za-z0-9._-]`, password 8 to 256). `POST /api/v1/auth/google` checks the ID token with Google's `tokeninfo` endpoint (audience = `GOOGLE_CLIENT_ID`, issuer, verified email, expiry) and finds or creates the citizen `google:<sub>`; failed tokens count against the address in the login limiter. Client: Google Identity Services button on the website, `@capgo/capacitor-social-login` (Credential Manager) on Android, both in `src/auth/google.ts`; hidden unless `VITE_GOOGLE_CLIENT_ID` is set | Built; Google needs OAuth clients (README) |
| Login abuse limits | Per account (20 / 15 min), per username + address (5), per address (30); IPv6 grouped by /64 | Built |
| Admin tools | SQLAdmin on the FastAPI app, behind the same login limiter | Built |
| API format | HTTPS REST with versioned JSON contracts; OpenAPI exported to `contracts/` | Built |
| Sync trigger | On app open, on `online` event, on app resume, and a periodic timer while open | Built |
| Tests | Vitest (179 unit tests), pytest (82), Playwright (23 flows on phone and laptop sizes, 46 tests) | Built |
| Hosting | Static hosting for the PWA; any container host with managed PostgreSQL for the API | Proposed |

**Important:** a LiteRT-LM model is built for a target. The web build (`gemma-4-E2B-it-web.litertlm`) and the Android build (`gemma-4-E2B-it.litertlm`) are different files; the app's catalogue (`src/assistant/modelFiles.ts`) names the right one per platform.

References:
- Capacitor: https://capacitorjs.com/docs
- SQLite WASM: https://sqlite.org/wasm
- LiteRT-LM for the web: https://www.npmjs.com/package/@litert-lm/core
- tesseract.js: https://github.com/naptha/tesseract.js
- LiteRT-LM: https://developers.google.com/edge/litert-lm

## 3. Architecture

### 3.1 Logical components

```text
              web app (React + TypeScript, one codebase)
  ------------------------------------------------------------
  React UI (screens, components)
  Hooks / Use Cases
  Domain rules (validation, range check, donor search, emergency rules)
  Repositories
  Database interface (SQLite + FTS5 guidance index)
  Sync Queue + Sync Client (fetch)
  Interfaces: OcrEngine, HealthGuidanceEngine, Speech, LocationProvider
  ------------------------------------------------------------
        |                                     |
  Website build (PWA)                 Android build (Capacitor 8)
  Service worker, SQLite WASM/OPFS    same SQLite WASM/OPFS in the WebView
  tesseract.js OCR, pdf.js            tesseract.js OCR, pdf.js
  LiteRT-LM on WebGPU (optional)      native LiteRT-LM, GemmaPlugin.kt (optional)
  Web Speech API (speak, listen)      Capacitor TTS, SpeechPlugin.kt, notifications
        |                                     |
        +------------- HTTPS API -------------+
                           |
                      FastAPI Backend
                           |
            +--------------+--------------+
            |              |              |
       Authentication  Business Logic  Sync Engine
            |              |              |
            +--------------+--------------+
                           |
                      PostgreSQL
                           |
             Admin / Clinical Content Tools
```

The diagram matches the implementation in `frontend/` and `backend/`.

### 3.2 Architectural rules

1. UI components must not access SQL or HTTP directly.
2. Repositories coordinate local and remote data sources.
3. The local database is the source of truth for what the user sees on the device.
4. Network requests must not be required for local reads or critical local writes.
5. Domain rules must be shared conceptually across clients and enforced again on the server.
6. Every synchronization mutation must be identifiable and idempotent.
7. Clinical guidance must be versioned independently from the language model.
8. The AI must not have unrestricted database or network access.
9. Patient data and donor-directory data must have separate authorization and retention policies.
10. Business rules live once, in the shared TypeScript code under `src/domain/`. Platform differences are small adapters in `src/platform/` and `src/assistant/native.ts`, selected at runtime with `Capacitor.isNativePlatform()`.
11. Clients write to the server only through `POST /api/v1/sync/push`. There are no separate client-facing create/update endpoints.
12. Clinical events (visits) are append-only. Corrections are new amendment records, never in-place updates.

## 4. Offline AI implementation

### 4.1 Model candidate

**Primary candidate:** Gemma 4 E2B instruction-tuned model, deployed through a compatible LiteRT-LM artifact.

The published `.litertlm` bundle is approximately 2.58 GB. Runtime memory use is additional and varies by device, backend, model configuration, and context length. A laptop or phone cannot be declared compatible from its storage capacity alone.

**Comparison candidate:** A smaller, supported local model if testing demonstrates that Gemma 4 E2B is unsuitable for the device tier. Gemma 3n E2B may be evaluated as a separate candidate, but runtime and artifact compatibility must be verified rather than assumed.

**Device tiers (as built):**

| Tier | Model | Notes |
|---|---|---|
| Website, WebGPU available | Gemma 4 E2B web build (2.0 GB) via `@litert-lm/core` | Chrome or Edge on capable laptops |
| Android | Gemma 4 E2B (2.6 GB) via native LiteRT-LM | GPU first; falls back to CPU and remembers it. Measured: a full grounded answer took 68 s on a Pixel 7 emulator CPU in airplane mode |
| Either, optional | Gemma 3n E2B (3.0 GB web / 3.7 GB Android) | Gated licence: the user downloads the file and picks it in the app |
| No model | None | Full app works; answers come straight from the library (§4.6) |

Because the AI only rewords library text and a guard checks every answer, a weak or missing model reduces fluency, not correctness.

**Installation:** the download is explicit and shows its size (More → Offline AI model). On the website the file is stored in OPFS (`models/`), written to a `.part` file and renamed when complete. On Android, `GemmaPlugin.save` downloads into app storage with resume (HTTP Range) and up to five retries, or copies a file the user picks. Only plain `.litertlm` names from the catalogue are accepted, and downloads only from `https://huggingface.co/`. *Proposed:* SHA-256 verification against a signed manifest.

### 4.2 Model selection procedure

For every candidate, record:

- Exact model name and revision.
- Artifact download URL and SHA-256 checksum.
- Model license and redistribution requirements.
- Runtime version and supported operating systems.
- Device model, operating-system version, RAM, and free storage.
- CPU/GPU/NPU backend used.
- Peak memory, cold-start time, response latency, and battery impact.
- Hindi and English performance on a fixed evaluation set.
- Safety evaluation results on health-related prompts.

Do not advertise a hardware requirement until representative tests establish it.

### 4.3 Model lifecycle

1. The app starts without automatically blocking on model initialization.
2. The model manager checks local model metadata and file integrity.
3. The application verifies compatibility before creating the inference engine.
4. Model loading runs on a background dispatcher or worker thread.
5. The application reports `READY`, `NOT_INSTALLED`, `LOADING`, or `ERROR`.
6. Inference runs off the UI thread.
7. If initialization fails, non-AI features remain usable.
8. Updates are downloaded to a temporary location and validated before activation.
9. Old model files are retained until the replacement is confirmed usable, subject to storage constraints.

### 4.4 AI service interface

Implement a platform-neutral domain contract:

```text
HealthGuidanceEngine
  initialize()
  getStatus()
  rewordExplanation(ruleBasedExplanation, language)
  answerFromApprovedGuidance(question, language)
  cancelCurrentRequest()
  close()
```

`rewordExplanation` receives the already-computed rule-based explanation, not raw report text. The output is rejected and the rule-based text is shown instead if any number, unit, or low/normal/high label in the output differs from the input.

As built: `src/assistant/litert.ts` (website, `@litert-lm/core` on WebGPU) and `src/assistant/native.ts` (Android, `GemmaPlugin.kt`) implement the same `ChatModel` interface; with no model installed, `respond.ts` answers from the library. Native inference runs on a background coroutine, one answer at a time, with a fresh conversation per answer.

### 4.5 Retrieval-augmented guidance

The local guidance pipeline must be:

1. Normalize the user's question.
2. Search the local approved guidance index.
3. Retrieve relevant approved passages.
4. Apply deterministic safety and emergency rules.
5. Pass the retrieved passages and constrained task instructions to the model.
6. Validate the response structure.
7. Display the answer with source, version, and review date.
8. Decline unsupported conclusions and direct the user to professional care when appropriate.

For the MVP, use a local keyword or full-text index. Embedding-based retrieval is optional and should be added only after the storage, runtime, and quality cost is measured.

Use SQLite FTS5 on both clients. Both run the same SQLite WASM build (in the browser and in the Android WebView), which includes FTS5. Test the tokenizer with Hindi queries in Phase 0: confirm that Devanagari vowel signs (matras) are kept inside tokens and that `remove_diacritics` does not break Hindi matching. Each guidance item should also carry curated keyword and synonym lists in Hindi, Hinglish, and English, since users will not type the exact clinical term.

As built, `src/domain/hinglish.ts` folds Roman spelling variants to one key (aa/a, ee/i, oo/u, aspirated consonants, nasal n/m before a consonant or at the end, doubled letters, z/j, w/v) and Devanagari nukta and chandrabindu. Questions are folded before search, and keywords are stored with their folded forms when content is seeded, so `bukhaar`, `bukhar` and `bukar` meet. Keywords also include English words in Hindi script (फीवर, ब्लीडिंग) because Hindi voice input writes them that way. These are hand rules for common swaps, not a transliterator.

**Never rely on a system prompt alone as a clinical safety control.** The application must limit source material, enforce output constraints, and test unsafe and ambiguous prompts.

### 4.6 Medical-report processing

The report workflow is:

```text
Image / PDF
    |
    v
File validation
    |
    +--> PDF text extraction when usable text exists
    |
    +--> Page rendering and local OCR when needed
    |
    v
Extracted text + page references
    |
    v
User review and correction
    |
    v
Structured report fields
    |
    v
Range check (report range, else approved fallback reference table)
    |
    v
Rule-based explanation (reviewed text per test + LOW / NORMAL / HIGH)
    |
    +--> Optional: model rewording (validated, §4.4)
    |
    v
Display + read-aloud (TTS)
```

The range check is deterministic TypeScript code in `src/domain/`, shared by the website and the mobile app. Each test in the reviewed catalogue has: canonical name, aliases (as printed on Indian lab reports), unit and unit conversions, fallback ranges by sex/age where applicable, and reviewed Hindi and English text for low, normal, and high results. Tests not in the catalogue are shown with their values and ranges but no explanation, with a "please ask your doctor" message.

OCR is not a clinical validation mechanism. The system must preserve original text and allow correction before extracted values are treated as verified.

The AI should receive the smallest necessary data. Where possible, use a structured report representation instead of an entire personal medical history.

## 5. OCR requirements

### Both builds (as built)

- tesseract.js with `eng` + `hin` traineddata, served from `public/ocr/` (copied by `scripts/copy-ocr-assets.mjs`) and precached; no CDN and no Google Play Services.
- The Android WebView runs the same OCR code; the packager unzips `.gz` assets, so gzip is off on native.
- Each value keeps its OCR confidence; uncertain values are flagged and must be checked before the explanation is shown.
- Still to validate: rotation, blur, low light, handwriting and multi-page reports on the target report population.

### Website (PWA)

- Use tesseract.js in a Web Worker with the `eng` and `hin` traineddata files, precached by the service worker so OCR works offline.
- Extract existing PDF text with pdf.js before rendering pages for OCR.
- Pin pdf.js, tesseract.js, and traineddata versions.
- Expect slower OCR than native; show per-page progress.
- Keep page and bounding-box references where available.
- Handle password-protected and corrupt PDFs with explicit error messages.

### OCR test data

Use consented, de-identified, or synthetic test reports covering:
- Printed English reports.
- Printed Hindi reports where supported.
- Numeric tables and decimal values.
- Units and reference ranges.
- Multi-page reports.
- Low-quality camera captures.

Measure character error rate and field-level accuracy separately. A good overall text score does not guarantee accurate laboratory values.

## 6. Local data model

All primary entities must use stable UUIDs or equivalent collision-resistant identifiers. Use UTC timestamps for synchronization and retain local timezone information when needed for display.

### 6.1 Core tables

**users**
- `id`
- `server_user_id`
- `role` (`asha_worker`, `coordinator`, `supervisor`, `admin`)
- `assigned_scope_json` (villages or area IDs this user may sync)
- `pin_verifier` (salted, slow hash; never the PIN itself)
- `last_server_contact_at`
- `status`
- `created_at`
- `updated_at`

**patients**
- `id`
- `display_name`
- `date_of_birth` or age representation where appropriate
- `sex` only where relevant and lawfully collected
- `local_identifier`
- `scope_id` (village or area; drives sync scope)
- `abha_id` nullable (reserved for future ABDM integration; do not collect in MVP)
- `created_by`
- `created_at`
- `updated_at`
- `record_version`
- `sync_status`
- `deleted_at` nullable tombstone

Collect only fields necessary for the approved workflow. Avoid unnecessary identifiers.

**patient_visits** (append-only)
- `id`
- `patient_id`
- `worker_id`
- `amends_visit_id` nullable (set when this row corrects an earlier visit)
- `amendment_reason` nullable
- `visit_time`
- `notes`
- `observations_json`
- `follow_up_at` nullable
- `created_at`
- `sync_status`
- `voided_at` nullable (a voiding amendment, not a delete)

Rows are never updated after creation except `sync_status`. The current state of a visit is the latest row in its amendment chain. Because two devices can only add rows, visits never produce sync conflicts.

**medical_reports**
- `id`
- `patient_id` nullable when the report is not linked to a patient
- `file_reference`
- `file_hash`
- `report_date` nullable
- `ocr_text`
- `extracted_fields_json`
- `language`
- `ocr_status`
- `created_at`
- `updated_at`
- `record_version`
- `sync_status`
- `deleted_at` nullable tombstone

Do not put report files or OCR text into diagnostic logs.

**lab_test_catalogue** (reviewed content, shipped with the guidance package)
- `id`
- `canonical_name`
- `aliases_json`
- `unit`
- `unit_conversions_json`
- `fallback_ranges_json` (by sex/age where applicable)
- `explanation_low_en`, `explanation_low_hi`
- `explanation_normal_en`, `explanation_normal_hi`
- `explanation_high_en`, `explanation_high_hi`
- `source_reference`
- `reviewed_at`
- `version`

**donors**
- `id`
- `blood_group`
- `approx_latitude` nullable (coarsened server-side to ~1 km grid)
- `approx_longitude` nullable (coarsened server-side to ~1 km grid)
- `locality_label` nullable
- `contact_encrypted` (decryptable only with the coordinator-role key)
- `consent_status`
- `consent_updated_at`
- `last_verified_at` nullable
- `last_synced_at`
- `registration_status`
- `directory_version`
- `updated_at`
- `deleted_at` nullable tombstone (consent withdrawal or expiry)

**guidance_documents**
- `id`
- `title`
- `language`
- `topic`
- `source_name`
- `source_reference`
- `reviewed_by_role`
- `reviewed_at`
- `version`
- `effective_from`
- `effective_until` nullable
- `content_hash`
- `content`
- `status`

**sync_operations**
- `operation_id`
- `entity_type`
- `entity_id`
- `operation_type`
- `payload_reference`
- `base_version` nullable
- `created_at`
- `attempt_count`
- `last_error_code` nullable
- `status`

**audit_events**
- `id`
- `actor_id`
- `action`
- `entity_type`
- `entity_id`
- `timestamp`
- `result`
- `metadata_minimized`

Audit logs must not unnecessarily copy sensitive medical content. Audit events are created locally (including donor contact reveals and offline unlocks) and synced as append-only operations.

### 6.2 Local database constraints

- Use foreign keys where appropriate.
- Add indexes for patient lookup, visit dates, donor blood group, donor status, and sync status.
- Apply migrations with a tested rollback/recovery strategy.
- Use transactions for related local writes.
- Represent deletion with tombstones until the server confirms synchronization, where required.
- Never store plaintext passwords or long-lived bearer tokens in application tables.
- Encrypt sensitive database content and files using an established platform-backed key-management approach.

## 7. Donor search and location

### 7.1 Search algorithm

1. Validate the requested blood group.
2. Filter to active donor registrations with appropriate consent.
3. Exclude records that have expired under the approved freshness policy.
4. Resolve device location or accept manual coordinates/locality.
5. Calculate approximate distance locally.
6. Sort by distance and data freshness.
7. Display a clear timestamp and an unverified-availability warning.
8. Reveal contact information only to coordinator roles; decrypt on demand and write an audit event for every reveal.

A simple great-circle distance calculation such as Haversine is adequate for approximate ranking. Do not use it as proof of road travel time.

### 7.2 Location behavior

- Request location permission (Android or browser) only when the user initiates a location-dependent action.
- GPS may work without internet, but a usable fix is not guaranteed.
- Never block donor search solely because location permission is denied.
- Provide manual locality or coordinate entry.
- The server coarsens donor coordinates before sending them; exact donor coordinates never reach client devices.
- Use approximate distance or locality-level location in the UI.
- Avoid sending exact user coordinates to the server unless necessary and authorized.

### 7.3 Freshness policy

Donor expiry thresholds must be configurable and agreed with the operational partner. The application must not invent availability based on a cached record.

A cached donor directory cannot establish current donor availability while fully offline. The blood bank or treating facility remains responsible for confirming suitability and compatibility.

## 8. Synchronization protocol

### 8.0 Authentication and offline unlock

1. First sign-in (password, new citizen sign-up, or Google) requires network: the server returns an access token (short-lived, e.g. 15 minutes), a refresh token, the user's role, and assigned scope.
2. The user sets a local PIN (4 to 6 digits). One PBKDF2-SHA256 run (310,000 iterations, random 16-byte salt) gives a verifier and an AES-GCM key; the refresh token is stored only encrypted with that key (`src/auth/pin.ts`). The PIN itself is never stored. *Proposed:* encrypting the whole local database, Android Keystore protection and biometric unlock.
3. Offline, the app unlocks with the PIN. No server call is needed for local reads and writes. Android cloud backup and device transfer are disabled (`data_extraction_rules.xml`), so the local database does not leave the phone that way.
4. Offline access expires after `max_offline_days` (default 7) since `last_server_contact_at`. After that, an online sign-in is required.
5. Repeated wrong PINs (e.g. 5) lock the session and require online sign-in.
6. On every sync, the server can return `revoked` for the user or device; the client then wipes that user's session keys.
7. Multiple workers on one device each have their own PIN, session, and scope.

### 8.1 Client behavior

For every critical local change:

1. Commit the entity change and sync operation in one database transaction.
2. Generate a unique `operation_id`.
3. Mark the operation as pending.
4. Display the locally saved record immediately.
5. Start synchronization when network and policy conditions permit.
6. Retry transient failures with exponential backoff.
7. Mark an operation synchronized only after server acknowledgement.
8. Keep failures visible and retryable.

Both clients process the persistent `sync_operations` queue on app open, app resume, the browser/Capacitor `online` event, and a periodic timer while the app is open. True background sync while the app is closed is not guaranteed on either platform in the MVP; the UI must show the count of pending operations so users know to open the app when connected.

**Website storage persistence:** call `navigator.storage.persist()` at first launch and warn the user if the browser refuses. Browser data can be cleared by the user or the browser, so unsynced records on the website are at higher risk than on mobile; the UI must make pending items obvious.

### 8.2 Proposed API contracts

All endpoints use a versioned base path such as `/api/v1`. Every protected endpoint requires authentication and server-side authorization.

**Authentication**
- `POST /api/v1/auth/login`: username and password.
- `POST /api/v1/auth/signup`: `{display_name, username, password}`; always creates `role = citizen`, `scope = []`. 409 `username_taken`; 429 after 5 sign-ups per address per 15 minutes (counted in the login limiter and never refunded).
- `POST /api/v1/auth/google`: `{id_token}`. 503 when `GOOGLE_CLIENT_ID` is unset, 401 `invalid_google_token` when Google rejects it or any claim check fails. Google users get the username `google:<sub>` (sign-up names cannot contain `:`) and a random password nobody knows, so only Google reaches the account.
- `POST /api/v1/auth/refresh`
- `POST /api/v1/auth/logout`

As built: our own accounts with Argon2 hashes and HS256 JWTs; Google is an optional identity provider for citizens only. All sign-in responses have the same shape (`access_token`, `refresh_token`, `user`, `server_time`), so the client sets the PIN the same way after each. Android uses the native account picker because Google blocks its OAuth page inside WebViews.

**Synchronization (the only client write path)**
- `POST /api/v1/sync/push` — patients, visits, visit amendments, reports metadata, donor registrations, consent changes, and audit events, all as operations.
- `GET /api/v1/sync/pull?cursor={cursor}` — incremental changes limited to the caller's assigned scope.

**Donor directory (read-only)**
- `GET /api/v1/donors/directory?since_version={version}` — coarsened locations; contacts encrypted for coordinator roles.

**Guidance and models (read-only)**
- `GET /api/v1/guidance/manifest`
- `GET /api/v1/guidance/updates?since_version={version}` — includes the lab test catalogue.
- `GET /api/v1/models/manifest` — signed list of model artifacts with SHA-256 checksums.

**Administration**
- Served by the server-rendered admin interface (SQLAdmin or equivalent), using the same service layer. Not used by clients.

These are proposed endpoints; they do not imply that the API exists.

### 8.3 Example sync operation

```json
{
  "operation_id": "uuid",
  "entity_type": "patient_visit",
  "entity_id": "uuid",
  "operation": "create",
  "base_version": null,
  "client_timestamp": "2026-10-19T10:00:00Z",
  "payload": {
    "patient_id": "uuid",
    "amends_visit_id": null,
    "visit_time": "2026-10-19T09:45:00Z",
    "notes": "Example test record"
  }
}
```

This is an illustrative contract. Production validation must reject malformed or unauthorized fields.

### 8.4 Idempotency and conflicts

- The server must maintain a unique constraint on accepted operation IDs.
- Repeated requests with the same operation ID must return the existing result rather than duplicate the mutation.
- Append-only entities (visits, amendments, audit events) only use `create` and cannot conflict.
- Conflicts are therefore limited to mutable entities: patient demographics, report metadata, and donor registrations.
- Each mutable record must have a version or revision.
- For patient demographics, merge field by field: if the two edits change different fields, apply both; if they change the same field, keep the server value, store the client value, and flag the record as `needs_review` for a supervisor.
- Clients must provide a base version for updates where concurrent edits are possible.
- If the base version is stale, the server returns a conflict response with sufficient metadata to reconcile safely.
- Do not apply last-write-wins blindly to clinical notes or other safety-critical fields.
- Where automatic merging is unsafe, retain both revisions and request authorized resolution.
- The server must validate every field regardless of client validation.

### 8.5 Sync response

Return, per operation:
- Operation ID.
- Accepted or rejected status.
- Canonical server entity ID.
- Current record version.
- Conflict indicator where applicable.
- Safe error code.
- Server timestamp.

The client removes an operation from the pending queue only after a definitive acknowledgement and the local database has been updated accordingly.

## 9. Backend and server database

### Backend services

**Authentication and authorization service:** Identifies users and checks permissions.

**Patient service:** Validates patient records, visits, and access scopes.

**Donor service:** Enforces registration status, consent, expiry, and restricted contact access.

**Guidance service:** Publishes reviewed, versioned content packages.

**Sync service:** Applies idempotent mutations, handles versions, and returns incremental changes.

**Audit service:** Records security-relevant actions without copying unnecessary sensitive payloads.

**Administration service:** Supports authorized staff management, guidance publishing, and operational review.

### PostgreSQL requirements

- Enforce foreign keys and appropriate unique constraints.
- Use transactions for multi-entity operations.
- Index query and synchronization fields.
- Apply row-level authorization or equivalent service-layer authorization as required by the chosen deployment.
- Encrypt backups and define restoration procedures.
- Separate production, staging, and development data.
- Never use real patient data in ordinary development environments.

## 10. Security and privacy

### Threats to address

- A lost or stolen phone or laptop.
- Unauthorized access on shared devices.
- Compromised user credentials.
- Malicious or tampered synchronization requests.
- Exposure of patient data in logs, exports, backups, or notifications.
- Unauthorized donor contact or location disclosure.
- Model prompt injection through imported reports or documents.
- Compromised or outdated guidance packages.

### Required controls

1. Encrypted transport for all remote API calls.
2. Encryption at rest for sensitive local data and files.
3. Platform-backed key storage where available.
4. Session timeout and device-locking controls.
5. Role-based access control and least privilege.
6. Server-side authorization for every protected resource.
7. Audit trails for access to sensitive records and donor contact details.
8. Secure backup, restoration, revocation, and deletion procedures.
9. Integrity checks for downloaded models and guidance packages.
10. Redaction of sensitive data from application logs and crash reports.
11. Data minimization and configurable retention policies.
12. A documented incident-response and compromised-device procedure.

13. Offline sessions bounded by `max_offline_days` and PIN attempt limits (§8.0).
14. Donor contacts encrypted per role and donor locations coarsened server-side (§6.1, §7.2).
15. Follow-up notifications show no patient names or medical details on the lock screen.

Offline operation creates a revocation limitation: a device that cannot connect cannot instantly receive a revoked permission or withdrawn donor registration. The `max_offline_days` limit bounds this window; donor directory entries older than the freshness policy are hidden.

**Regulatory baseline:** Map consent, notice, purpose limitation, retention, and data-principal rights (access, correction, erasure) to India's Digital Personal Data Protection Act, 2023 and its rules. Consent records for donors and patients must be stored with timestamp and version of the notice shown.

## 11. Medical safety engineering

The model is a language-generation component, not a verified clinical decision engine.

Required controls:
- Curate guidance from authoritative sources with qualified reviewers.
- Track source versions, approval status, and expiry.
- Separate emergency rules from free-form model generation.
- Test adversarial, ambiguous, incomplete, and high-risk prompts.
- Require user review of extracted medical values.
- Avoid unsupported diagnosis, prescribing, and dosing behavior.
- Use approved emergency escalation text that remains available without the model. Escalation screens show 108 (ambulance), 102 (maternal/child transport), 112 (national emergency) and configured local facilities, with one-tap dialing.
- Emergency red-flag rules are a reviewed, versioned rule table (keywords/symptom combinations → escalation level) evaluated in shared `src/domain/` code before any model call. Rule terms and the question are both spelling-folded (`hinglish.ts`) before whole-word matching.
- Record model and guidance versions for evaluation and incident investigation.
- Provide a safe fallback when the model is unavailable or evidence is insufficient.

Clinical content must be reviewed before deployment. The applicable medical-device, privacy, health-data, and other regulatory requirements must be assessed for the actual deployment and intended use.

## 12. Optional Bluetooth / Wi-Fi Direct mesh

**Status: Post-MVP research item.**

Potential use cases include sharing a short emergency alert, a minimum necessary referral record, or a signed update between nearby devices without internet.

Do not replicate the full patient database automatically across nearby devices.

Before implementation, define:
- Device pairing and mutual authentication.
- Message encryption and integrity.
- Expiry and replay protection.
- Message size and queue limits.
- Consent and data-minimization rules.
- Conflict handling after devices reconnect.
- Lost-device and revoked-credential behavior.
- Platform-specific background and radio limitations.

Mesh delivery must be treated as best-effort, not guaranteed emergency communication.

## 13. Testing strategy

### Unit tests
- Validation and data-model rules.
- Lab range check and LOW/NORMAL/HIGH classification, including unit conversion.
- Rejection of model rewording that alters numbers, units, or labels.
- Amendment-chain resolution for visits.
- Offline session expiry and PIN lockout.
- Distance calculations.
- Consent and expiry filtering.
- Idempotency and version comparison.
- Guidance retrieval and emergency-rule evaluation.

### Integration tests
- Local database transactions.
- OCR output persistence.
- Model initialization and failure handling.
- API authentication and authorization.
- Sync queue processing.
- Server conflict and duplicate-operation behavior.

### Offline tests
- Airplane mode during record creation.
- Application force-stop and restart.
- Device reboot with pending sync.
- Missing model file.
- Insufficient storage.
- No GPS fix or denied location permission.
- Stale donor cache.
- OCR with no network.
- Reconnection after several days offline.

### Security tests
- Cross-user access attempts.
- Invalid or expired tokens.
- Tampered payloads.
- Duplicate and replayed operations.
- Database and file protection.
- Sensitive-data leakage through logs and notifications.
- Donor consent revocation.

### AI evaluation
Maintain a reviewed evaluation set for Hindi and English, including:
- Report explanation fidelity.
- Numerical value preservation.
- Unsupported medical claims.
- Citation correctness.
- Emergency escalation.
- Refusal when evidence is insufficient.
- Prompt injection through imported documents.

### Performance tests
Record:
- Cold model startup time.
- Peak memory and storage.
- OCR latency per page.
- AI time to first token and total response time.
- Battery and thermal impact.
- Sync throughput and recovery behavior.

Test on actual target devices; emulator results alone are insufficient.

## 14. Deployment and operations

### Client releases
- Website and Android app are built from the same source and share a version number; the Android build may add a build suffix.
- The website service worker must show "update available" rather than silently replacing the app while unsynced data exists.
- Keep database migrations backward-compatible where practical.
- Provide clear model-download and storage messages.
- Support interrupted downloads, sideloading from SD card/USB/local share, and integrity verification against the signed model manifest.
- Keep the last usable model during upgrades when storage permits.

### Backend releases
- Use separate development, staging, and production environments.
- Run migrations and automated tests before deployment.
- Use managed secrets rather than hard-coded credentials.
- Enable monitoring for sync failures, authentication failures, API errors, and database health.
- Maintain encrypted backups and test restoration regularly.

### Guidance updates
- Only authorized reviewers may publish guidance.
- Every package must have a version and content hash.
- Clients verify package integrity before activation.
- A failed update must leave the previous usable package intact.
- Expired guidance must be marked or disabled according to the reviewed safety policy.

## 15. Proposed repository structure

```text
medisaathi/
├── frontend/                    # React + TypeScript + Vite (website, PWA, Android)
│   ├── src/
│   │   ├── ui/                  # AppShell, LockGate, screens/
│   │   ├── domain/              # range check, donor search, labs
│   │   ├── data/                # repositories
│   │   ├── database/            # schema, migrations, seed, Database interface
│   │   ├── workers/             # sqlite.worker.ts (OPFS)
│   │   ├── assistant/           # respond, guard, answer, litert (web), native (Android), modelFiles
│   │   ├── auth/                # PIN unlock, token wrapping
│   │   ├── sync/                # queue + API client
│   │   ├── platform/            # OCR, speech, voice input, network, notifications
│   │   └── emergencyRules.ts
│   ├── e2e/                     # Playwright specs (phone + laptop projects)
│   ├── android/                 # Capacitor project, GemmaPlugin.kt
│   └── vite.config.ts
├── backend/
│   ├── app/                     # main, auth, sync, blood, admin, db
│   └── tests/
├── contracts/                   # OpenAPI spec exported from the backend
├── content/                     # demo guidance, lab catalogue, emergency rules, donors, places, sample report
├── docs/                        # prd.md, trd.md, design.md
└── README.md
```

## 16. Implementation phases

### Phase 0 — feasibility
- Select representative Android phones and laptops (with Chrome/Edge).
- Verify FTS5 with Hindi queries in SQLite WASM (done; same engine on Android).
- Verify SQLite WASM persistence in OPFS survives browser restarts.
- Measure tesseract.js speed and accuracy on sample reports.
- Test Gemma 4 E2B on target laptops and phones: download size, memory, latency, Hindi quality (emulator CPU done: 68 s per answer; real phone GPUs still to measure).
- Confirm model license and redistribution rights.

### Phase 1 — offline core
- Build the shared TypeScript layer: database interface and both adapters, repositories, domain rules.
- Implement offline PIN unlock, patient registration, append-only visits, and follow-ups.
- Add local guidance browsing with emergency rules.
- Add offline OCR, report review, rule-based range check, and read-aloud.
- Add model adapter (rewording only) with graceful failure handling.

### Phase 2 — BloodLink
- Implement donor registration and consent.
- Add local directory caching.
- Add location permissions, manual location, and approximate-distance search.
- Implement freshness and expiry indicators.

### Phase 3 — backend and synchronization
- Implement authentication, APIs, and database.
- Add idempotent push, incremental pull, versioning, and conflict handling.
- Add monitoring and administrative workflows.
- Test offline-to-online recovery.

### Phase 4 — validation
- Complete clinical, security, localization, and performance testing.
- Conduct a controlled pilot with approved data and supervision.
- Resolve high-risk defects before release.

### Phase 5 — optional expansion
- Evaluate mesh sharing, additional languages, advanced retrieval, and ABDM/ABHA integration.
- Add only after the MVP passes its release gates.

### Hackathon build order (Hack-o-Relay 2026)
Build vertical slices so there is always a demo-able app. All eight steps are done:
1. Vite + React + TypeScript + Tailwind skeleton with PWA plugin; SQLite WASM schema; seed data (patients, donors, guidance, lab catalogue) loaded from `content/`.
2. Patients + append-only visits + follow-up list + PIN unlock (website first).
3. MediScan: tesseract.js OCR → review screen → range check → explanation → TTS.
4. Guidance search (FTS5) + emergency rules + 108/102/112 screen.
5. BloodLink: blood group filter, Haversine sort, freshness labels, manual location.
6. FastAPI: login, `sync/push` with operation-ID idempotency, `sync/pull` by scope.
7. Add Capacitor: build the Android app with the same SQLite WASM and tesseract.js code, plus native TTS and notifications.
8. On-device Gemma 4 E2B with LiteRT-LM: WebGPU on the website, native plugin on Android, behind the guard.

Skipped for the hackathon: mesh, embeddings, conflict-resolution UI beyond the `needs_review` flag. The admin UI is SQLAdmin, not a separate app.

## 17. Technical definition of done

The implementation is acceptable when:

- All critical offline workflows pass on the agreed device matrix.
- Local writes survive restarts and failed synchronization.
- Repeated sync requests cannot create duplicate records.
- Unauthorized users cannot retrieve protected records.
- Donor consent and freshness rules are enforced.
- OCR output is reviewable and tested on representative reports.
- AI answers are evaluated against reviewed reference cases.
- Missing AI, GPS, or internet does not crash core workflows.
- Backup restoration and recovery are tested.
- Security and clinical review sign-offs are documented.

## 18. Verified versus proposed capabilities

**Documented technology capabilities**
- Service workers and installable PWAs support offline web applications.
- SQLite WASM supports persistent storage through OPFS in modern browsers.
- Capacitor packages a web app as an Android app with native plugins.
- `@litert-lm/core` runs LiteRT-LM models in the browser using WebGPU (verified with Gemma 4 E2B).
- LiteRT-LM documents local model inference on Android, and compatible Gemma 4 E2B LiteRT-LM artifacts are published.
- tesseract.js reads Hindi and English lab reports on the device, offline (verified with the sample report on Android).

**Built and tested in this repository**
- The website, PWA and Android app; FastAPI backend with idempotent, scoped sync; PIN unlock; BloodLink consent flow.
- Gemma 4 E2B answers in Hindi and English on the device, checked by the guard (citations, numbers, medicine names).

**Still requiring validation**
- A production-ready medical guidance corpus and safe retrieval pipeline.
- Accuracy of report extraction on the target report population.
- Model performance and safety on actual target devices.
- Donor consent, privacy, expiry, and distance-search implementation.
- Authentication, server authorization, synchronization, conflict handling, and audit trails.
- Regulatory and clinical approval for the intended deployment.
- Bluetooth/Wi-Fi Direct mesh communication.

**Final technical decision:** The hackathon build proves the architecture end to end. Before any pilot, measure the model on real low-cost phones, have the guidance and report text clinically reviewed, and only then lock supported device tiers and release scope.

## 19. Change log

**v1.6**
- Field tools, all offline and pure logic in `src/domain/` with unit tests: `medicine.ts` (name match with edit distance 1, expiry parse), `outbreak.ts` (3+ patients and 2x the previous 7 days per village and symptom), `schedule.ts` (UIP and ANC windows, EDD = LMP + 280 days), `centres.ts` (nearest and nearest 24-hour by `distanceKm`), `fhir.ts` (FHIR R4 collection bundle, ABHA identifier `https://healthid.ndhm.gov.in`, NRCeS profiles), `abha.ts`.
- Symptoms, vaccine doses, ANC checkups and LMP are stored in visit `observations_json`, so the existing append-only visit sync carries them; no new sync entity.
- `patients.date_of_birth` and `patients.abha_id` added on the server (idempotent `ALTER TABLE ... ADD COLUMN` at start) and in sync; `profiles.date_of_birth`, `lmp_date`, `abha_id` added on the device by migration.
- Shared `assistant/ask.ts` used by Chat and the hands-free Saathi screen.
- SMS through `sms:` links (one number per link, audited as `donor_sms`); no gateway.
- New plugins `@capacitor/filesystem` and `@capacitor/share` for exporting files on Android.
- New content: `medicines.json`, `immunization_schedule.json`, `health_centres.json`, `visits.json`; content version bumped.
- ABHA check with DigiLocker (demo): `domain/identity.ts` compares held name, gender and birth date or age with the identity answer; `content/demo_digilocker.json` (synthetic, ABHA numbers starting 00) stands in for DigiLocker; the result is kept device-only in `app_meta` and is void if the ABHA number changes. Real use needs DigiLocker partner (requester) registration and its OAuth consent flow.

**v1.5**
- Voice input: native Android `SpeechPlugin.kt` and on-device Web Speech (`processLocally`), with clear failure messages (§2, §3.1).
- Hinglish spelling folding for emergency rules, Ask and guidance search; content version bumped so installed apps rebuild the index (§4.5, §11).
- Test counts updated (§2).

**v1.4**
- Added citizen sign-up and Google sign-in (website and Android) with their API contracts; worker accounts stay admin-created (§2, §8.0, §8.2).
- Test counts updated (§2).

**v1.3 (as built, October 2026)**
- Added an optional online model: Gemini through the backend, chosen per device, behind the same guard; reports never sent (§2).
- Status changed from proposal to as built; the stack table now records what is implemented (§2).
- AI: Gemma 4 E2B through LiteRT-LM on both platforms (WebGPU on the website, native plugin on Android); Gemma 3n E2B by user-supplied file. WebLLM and Ollama dropped (§2, §4.1).
- Android uses the same SQLite WASM and tesseract.js code as the website; `@capacitor-community/sqlite` and ML Kit dropped (§2, §3.1, §5).
- Offline unlock: PBKDF2 PIN with an AES-GCM-wrapped refresh token; database encryption, Keystore and biometrics stay proposed (§8.0).
- Security hardening: login limiter, operation ids bound to their user, admin behind the same limiter, `DEMO_PASSWORD` required, Android backups off.
- Repository layout and build order updated to the real tree (§15, §16).

**v1.2**
- Platform target changed to **website + Android app only**; no separate desktop app (laptops use the website).
- Replaced Kotlin Multiplatform with one React + TypeScript + Vite codebase: PWA for the website, Capacitor for Android (§2, §3.1, §15).
- Local storage: SQLite WASM on OPFS (website), `@capacitor-community/sqlite` (mobile) (§2, §4.5).
- OCR: tesseract.js (website), ML Kit Capacitor plugin (mobile); PDF via pdf.js (§5).
- AI: WebLLM on the website (optional); on-device LLM on mobile moved to post-MVP (§4.1, §4.4).
- Offline unlock adapted to WebCrypto, IndexedDB, Keystore, and WebAuthn (§8.0).
- Sync runs on open/resume/online/timer; added website storage-persistence rules (§8.1).
- Updated Phase 0, Phase 1, hackathon build order, and verified capabilities (§16, §18).

**v1.1**
- Replaced separate Android (Kotlin) and laptop (PySide6) clients with one Kotlin Multiplatform + Compose Multiplatform codebase (§2, §3.1, §15).
- Added architectural rules: shared business logic, sync as the only client write path, append-only clinical events (§3.2).
- Added model device tiers and sideloading (§4.1); AI now rewords a rule-based explanation and is validated against it (§4.4, §4.6).
- Added lab test catalogue and deterministic range check (§4.6, §6.1).
- Specified FTS5 and Hindi tokenizer testing (§4.5).
- Visits are append-only with amendments; added missing version/tombstone fields to reports and donors; added user scope and PIN verifier (§6.1).
- Donor contacts encrypted per role, coordinates coarsened server-side, reveals audited (§6.1, §7).
- Added offline authentication and unlock (§8.0).
- Removed client CRUD endpoints; added scoped pull and model manifest (§8.2).
- Narrowed conflict handling to mutable entities with a field-level merge rule (§8.4).
- Added DPDP Act 2023 baseline, notification privacy, and Indian emergency numbers (§10, §11).
- Added hackathon build order (§16).
