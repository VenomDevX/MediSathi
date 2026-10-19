# MediSaathi
## Technical Requirements Document (TRD)

**Document version:** 1.2  
**Status:** Proposed — implementation blueprint, revised for website + mobile app (see §19 change log)  
**Related document:** MediSaathi PRD v1.1

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

## 2. Proposed technology stack

| Layer | Proposed technology | Status |
|---|---|---|
| Client codebase | React + TypeScript + Vite, one codebase for website and Android app | Proposed |
| Styling | Tailwind CSS | Proposed |
| Website offline shell | Installable PWA with service worker (`vite-plugin-pwa`) | Proposed |
| Mobile app shell | Capacitor (Android) wrapping the same web build | Proposed |
| Website local database | SQLite WASM persisted to the Origin Private File System (OPFS), with FTS5 | Proposed; verify FTS5 + Hindi in Phase 0 |
| Mobile local database | `@capacitor-community/sqlite` (SQLCipher-encrypted) with FTS5 | Proposed; verify FTS5 + Hindi in Phase 0 |
| Data access | One TypeScript repository layer over a `Database` interface with two adapters (WASM, Capacitor) | Proposed |
| Validation / contracts | Zod schemas generated from or checked against the OpenAPI spec | Proposed |
| Website OCR | tesseract.js (WASM) with `eng` + `hin` traineddata cached for offline use | Proposed |
| Mobile OCR | ML Kit text recognition via Capacitor plugin (Latin + Devanagari); tesseract.js fallback | Plugin Devanagari support must be verified |
| PDF (both) | pdf.js: text extraction first, page rendering for OCR | Proposed |
| Website local AI | WebLLM (WebGPU) with a WebLLM-compatible (MLC) small Gemma-family build | Optional; requires WebGPU (Chrome/Edge on laptops); verify model availability |
| Mobile local AI | Post-hackathon: custom Capacitor plugin wrapping LiteRT-LM (Gemma 4 E2B or ~1B-class model) | Optional; MVP uses rule-based explanations only |
| Text-to-speech | Web Speech API (website); `@capacitor-community/text-to-speech` (mobile, offline Hindi/English voices) | Proposed |
| Location | Browser Geolocation API (website); `@capacitor/geolocation` (mobile); manual entry on both | Proposed |
| API backend | FastAPI | Proposed |
| Server database | PostgreSQL | Proposed |
| Authentication | Backend-issued short-lived JWT access token + rotating refresh token; offline PIN/biometric unlock on device (§8.0) | Proposed |
| Admin tools | SQLAdmin (or equivalent server-rendered admin) on the FastAPI app | Proposed; no separate SPA |
| API format | HTTPS REST with versioned JSON contracts | Proposed |
| Sync trigger | On app open, on `online` event, on app resume, and a periodic timer while open (both clients) | Proposed |
| Website hosting | Static hosting (Vercel or Netlify) | Proposed |
| API + database hosting | Railway or Render with managed PostgreSQL, backups, and monitoring | Proposed for hackathon; re-evaluate for production |

**Important:** LiteRT-LM, GGUF, and WebLLM (MLC) model artifacts are different formats. Do not assume a model file can be loaded by any runtime. Select the exact model, artifact format, runtime version, license, and platform combination together.

References:
- Capacitor: https://capacitorjs.com/docs
- SQLite WASM: https://sqlite.org/wasm
- WebLLM: https://webllm.mlc.ai
- tesseract.js: https://github.com/naptha/tesseract.js
- LiteRT-LM: https://developers.google.com/edge/litert-lm
- ML Kit text recognition: https://developers.google.com/ml-kit/vision/text-recognition/v2

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
  Website build (PWA)                 Android build (Capacitor)
  Service worker, SQLite WASM/OPFS    @capacitor-community/sqlite
  tesseract.js OCR, pdf.js            ML Kit OCR plugin, pdf.js
  WebLLM (optional, WebGPU)           LiteRT-LM plugin (post-MVP)
  Web Speech API, browser geolocation Capacitor TTS, geolocation
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

The diagram represents the intended architecture, not an existing implementation.

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
10. Business rules live once, in the shared TypeScript code under `src/domain/`. Platform adapters (`src/platform/web/`, `src/platform/native/`) implement only the interfaces listed in §3.1, selected at runtime with `Capacitor.isNativePlatform()`.
11. Clients write to the server only through `POST /api/v1/sync/push`. There are no separate client-facing create/update endpoints.
12. Clinical events (visits) are append-only. Corrections are new amendment records, never in-place updates.

## 4. Offline AI implementation

### 4.1 Model candidate

**Primary candidate:** Gemma 4 E2B instruction-tuned model, deployed through a compatible LiteRT-LM artifact.

The published `.litertlm` bundle is approximately 2.58 GB. Runtime memory use is additional and varies by device, backend, model configuration, and context length. A laptop or phone cannot be declared compatible from its storage capacity alone.

**Comparison candidate:** A smaller, supported local model if testing demonstrates that Gemma 4 E2B is unsuitable for the device tier. Gemma 3n E2B may be evaluated as a separate candidate, but runtime and artifact compatibility must be verified rather than assumed.

**Device tiers:**

| Tier | Model | Notes |
|---|---|---|
| Website, WebGPU available | Small Gemma-family model in WebLLM (MLC) format | Runs in Chrome/Edge on capable laptops; size and quality measured in Phase 0 |
| Mobile standard (post-MVP) | Gemma 4 E2B LiteRT-LM (~2.58 GB) via custom plugin | Thresholds set only after Phase 0 measurements |
| Mobile low (post-MVP) | ~1B-class LiteRT-LM model (~0.5 GB) via custom plugin | Expect weak Hindi; used for rewording only |
| None (MVP mobile default) | No model | Full app works; rule-based explanations (§4.6) |

Because the AI only rewords a rule-based explanation, a weak or missing model reduces fluency, not correctness.

**Installation:** On the website, WebLLM downloads the model once into the browser cache (Cache Storage); the download must be explicit and show its size. On mobile (post-MVP), models may be downloaded or sideloaded from SD card, USB, or a local file share. The model manager verifies the SHA-256 checksum against a signed manifest before activation, whatever the source.

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

This is an interface specification, not ready-to-run code. The WebLLM adapter (website), the LiteRT-LM plugin adapter (mobile, post-MVP), and a `NoModel` adapter (always available) must implement equivalent behavior. All inference runs in a Web Worker or native background thread, never on the UI thread.

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

Use SQLite FTS5 on both clients (SQLite WASM on the website, `@capacitor-community/sqlite` on mobile). Confirm in Phase 0 that both builds include FTS5. Test the tokenizer with Hindi queries in Phase 0: confirm that Devanagari vowel signs (matras) are kept inside tokens and that `remove_diacritics` does not break Hindi matching. Each guidance item should also carry curated keyword and synonym lists in Hindi, Hinglish, and English, since users will not type the exact clinical term.

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

### Mobile app (Android, Capacitor)

- Use an ML Kit text-recognition Capacitor plugin; verify in Phase 0 that it exposes the Devanagari recognizer. If it does not, write a thin custom plugin or fall back to tesseract.js.
- Bundle the selected ML Kit OCR models so initial OCR does not depend on downloading a model through Google Play Services.
- Include Latin and Devanagari recognition as required by the selected release.
- Validate image rotation, blur, low light, shadows, handwriting, tables, and multi-page reports.
- Keep the original image or PDF according to the user's retention settings.
- Show OCR uncertainty and allow edits.

ML Kit documentation: https://developers.google.com/ml-kit/vision/text-recognition/v2

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

1. First sign-in requires network: the server returns an access token (short-lived, e.g. 15 minutes), a refresh token, the user's role, and assigned scope.
2. The user sets a local PIN (or enables device biometric). The refresh token and the database key are wrapped by a key derived from the PIN (PBKDF2 or Argon2 via WebCrypto/WASM). On mobile, the wrapped key is additionally protected by Android Keystore through a secure-storage plugin, and biometric unlock is available. On the website, the wrapped key is stored in IndexedDB as a non-extractable WebCrypto key; biometric unlock may use WebAuthn where supported.
3. Offline, the app unlocks with the PIN or biometric. No server call is needed for local reads and writes.
4. Offline access expires after `max_offline_days` (default 7) since `last_server_contact_at`. After that, local data stays encrypted and an online sign-in is required.
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
- `POST /api/v1/auth/login`
- `POST /api/v1/auth/refresh`
- `POST /api/v1/auth/logout`

The exact identity provider and token strategy must be selected during implementation.

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
- Emergency red-flag rules are a reviewed, versioned rule table (keywords/symptom combinations → escalation level) evaluated in shared `src/domain/` code before any model call.
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
├── app/                         # React + TypeScript + Vite (website + mobile)
│   ├── src/
│   │   ├── ui/                  # screens and components
│   │   ├── domain/              # rules: range check, donor search, emergency rules
│   │   ├── data/                # repositories
│   │   ├── database/            # schema, migrations, FTS5, Database interface
│   │   ├── sync/                # queue + API client
│   │   ├── platform/
│   │   │   ├── types.ts         # OcrEngine, HealthGuidanceEngine, Speech, Location interfaces
│   │   │   ├── web/             # SQLite WASM, tesseract.js, WebLLM, Web Speech
│   │   │   └── native/          # Capacitor SQLite, ML Kit, TTS, geolocation
│   │   └── workers/             # OCR and AI Web Workers
│   ├── public/                  # PWA manifest, icons, OCR traineddata
│   ├── android/                 # generated by Capacitor
│   ├── capacitor.config.ts
│   └── vite.config.ts
├── backend/
│   ├── api/
│   ├── auth/
│   ├── patients/
│   ├── donors/
│   ├── guidance/
│   ├── sync/
│   ├── audit/
│   ├── admin/                   # SQLAdmin views
│   └── tests/
├── contracts/                   # OpenAPI spec + JSON schemas (source for both TypeScript and FastAPI models)
├── content/                     # reviewed guidance, lab test catalogue, emergency rules
├── docs/
│   ├── PRD.md
│   ├── TRD.md
│   ├── SECURITY.md
│   ├── API.md
│   ├── DATA_DICTIONARY.md
│   └── TEST_PLAN.md
└── README.md
```

This is the proposed structure; adjust it to the actual repository.

## 16. Implementation phases

### Phase 0 — feasibility
- Select representative Android phones and laptops (with Chrome/Edge).
- Verify FTS5 with Hindi queries in both SQLite WASM and `@capacitor-community/sqlite`.
- Verify SQLite WASM persistence in OPFS survives browser restarts.
- Verify the ML Kit Capacitor plugin supports Devanagari.
- Measure tesseract.js speed and accuracy on sample reports.
- Test a WebLLM model on target laptops: download size, memory, latency, Hindi quality.
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
Build vertical slices so there is always a demo-able app:
1. Vite + React + TypeScript + Tailwind skeleton with PWA plugin; SQLite WASM schema; seed data (patients, donors, guidance, lab catalogue) loaded from `content/`.
2. Patients + append-only visits + follow-up list + PIN unlock (website first).
3. MediScan: tesseract.js OCR → review screen → range check → explanation → TTS.
4. Guidance search (FTS5) + emergency rules + 108/102/112 screen.
5. BloodLink: blood group filter, Haversine sort, freshness labels, manual location.
6. FastAPI: login, `sync/push` with operation-ID idempotency, `sync/pull` by scope.
7. Add Capacitor: build the Android app, switch to the Capacitor SQLite adapter, then ML Kit OCR and native TTS.
8. If time remains: WebLLM rewording on the website.

Skip for the hackathon: mesh, embeddings, admin UI (seed by script), conflict-resolution UI beyond the `needs_review` flag.

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
- WebLLM runs language models in the browser using WebGPU.
- LiteRT-LM documents local model inference on Android, and compatible Gemma 4 E2B LiteRT-LM artifacts are published.
- ML Kit provides on-device text recognition options.

**Still requiring implementation and validation**
- The complete MediSaathi website and Android app.
- Devanagari support in the chosen ML Kit Capacitor plugin.
- Availability and Hindi quality of a WebLLM-compatible Gemma build.
- A production-ready medical guidance corpus and safe retrieval pipeline.
- Accuracy of report extraction on the target report population.
- Model performance and safety on actual target devices.
- Donor consent, privacy, expiry, and distance-search implementation.
- Authentication, server authorization, synchronization, conflict handling, and audit trails.
- Regulatory and clinical approval for the intended deployment.
- Bluetooth/Wi-Fi Direct mesh communication.

**Final technical decision:** Start with a small offline proof of concept, measure it on real hardware, and only then lock the model, runtime, supported device tiers, and release scope. Treat the architecture and code contracts in this document as specifications to implement and test, not as proof that those features already exist.

## 19. Change log

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
