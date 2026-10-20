# SDD ledger — plan: C:\Users\PARTH\.claude\plans\go-ahead-create-full-distributed-thunder.md
Pre-flight: phases share the Database interface (types.ts) and content/ seed shapes; no conflicts found.
Ruling: no per-task brief/scripts (plan is phase-level, not writing-plans format); ledger kept by hand — cost if wrong: none, git log is the record.
Ruling: working on main in a brand-new repo (no prior history to protect) — cost if wrong: branch later.
Ruling: Phosphor icons instead of lucide-react (taste + minimalist skills ban Lucide) — cost if wrong: icon swap.
Ruling: oxlint (Vite 8 template default) instead of ESLint+Prettier — cost if wrong: add ESLint later.
Ruling: content JSON bundled via import instead of fetched from public/ — works offline with no SW dependency — cost if wrong: bundle size grows with content.
Ruling: HashRouter so the same build runs under Capacitor file:// and static hosts — cost if wrong: URLs contain #.
Phase 1: complete (commit f785b2d; tests: vitest 6/6, playwright shell 2/2)
Ruling: sentence case for headings/buttons instead of WIG "Title Case" — Hindi has no case; frontend-design skill mandates sentence case — cost if wrong: copy edit.
Ruling: no unsaved-changes navigation guard on forms (WIG) — forms are short, data saved locally on submit — cost if wrong: lost half-typed visit note.
Ruling: PIN expiry skipped while last_server_contact_at is NULL (seeded demo user only); Phase 6 login always sets it — cost if wrong: demo device never expires.
Phase 2: complete (commit c76f75d; tests: vitest 27/27, playwright 4/4)
Ruling: lab catalogue read from the bundled JSON in the UI (labCatalogue.ts); the lab_test_catalogue table stays for future guidance-package updates — cost if wrong: two copies until updates ship.
Ruling: OCR assets (~16 MB: 3 core variants + eng/hin data) precached in full so first offline use works — cost if wrong: heavy first load on 2G; trim to one core variant if measured too slow.
Ruling: plausibility guard (per-test plausible bounds, 5x-outside-printed-range, reversed range) flags values for review instead of correcting them — cost if wrong: extra review taps on real extreme values.
Ruling: clientsClaim on SW install (no skipWaiting) — first visit works offline without reload; updates still wait — cost if wrong: none found.
Phase 3: complete (commit f48df4f; tests: vitest 51/51, playwright 6/6)
Security: fixed XSS via same-origin blob of untrusted file (allowlist at import + fixed display type); regression test files.test.ts written after the fix
Ruling: no configured local facilities list on the Emergency screen yet — invented phone numbers could reach real people; add when a partner supplies verified numbers — cost if wrong: one more tap to find the PHC.
Ruling: /emergency is reachable while locked (no patient data on it) — cost if wrong: none; bystanders need it.
Process note: guidance.ts was written before its test; moved aside to observe RED, then restored.
Phase 4: complete (commit 85fcc1c; tests: vitest 62/62, playwright 10/10)
Ruling: donor contacts are not encrypted on device in Phase 5; instead the server (Phase 6) sends contacts only to coordinator devices, so other devices never hold them — stronger than a shared key — cost if wrong: coordinator device loss exposes contacts (mitigated by PIN + offline expiry).
Ruling: demo donor contacts are labelled strings, not phone numbers — invented numbers could reach real people.
Ruling: exact blood-group match only; no compatibility suggestions (PRD BL-09).
Phase 5: complete (commit 235cb10; tests: vitest 74/74, playwright 12/12)
Security: fixed consent bypass on reveal + contacts in client bundle (moved to content/server); test: refuses withdrawn consent RED->GREEN
Ruling: backend tests run on in-memory SQLite (SQLAlchemy is portable); Postgres via docker-compose for running — cost if wrong: a Postgres-only behaviour slips past tests.
Ruling: "Use the demo account" offline sign-in kept beside real sign-in so the website demos without a server — cost if wrong: confusion; mitigated by labelling and "demo does not sync".
Ruling: no client UI for editing patient demographics yet; server merge rules for patient updates are implemented and tested — cost if wrong: field-merge path only exercised by pytest.
Ruling: sync on a shared device pushes all queued ops with the signed-in worker's token — cost if wrong: another worker's unsynced ops get attributed to / rejected for the current user; add per-op owner when shared devices are piloted.
Final-candidate minor: header pending badge refreshes on sync runs, not instantly after each local write.
Phase 6: complete (commit 3349a6b; tests: vitest 83/83, playwright 14/14, pytest 23/23)
Phase 7: PARTIAL (commit pending): Capacitor android project added, native TTS adapter. NOT done: local notifications, location permissions in manifest, APK build/emulator run, e2e on device. Phase 8 (WebLLM) not started. Final whole-branch review not run.
Phase 7: Ruling: built with the existing ~/.jdks/jbr-21.0.11 via per-command JAVA_HOME instead of installing a JDK or changing the global JAVA_HOME (Android Studio JBR 25) — Capacitor 8 needs Java 21 and Gradle 8.14 cannot run on 25 — cost if wrong: README tells the user to point JAVA_HOME at a JDK 21.
Phase 7: Ruling: skipped @capacitor-community/sqlite (encrypted) and native geolocation — the WebView runs the same sqlite-wasm/OPFS and navigator.geolocation with manifest permissions, proven on the emulator — cost if wrong: on-device DB is not encrypted at rest (already a documented ceiling).
Phase 7: Ruling: reminders ask permission when a follow-up is saved, never on background — Android silently denied a prompt raised while backgrounding (seen on emulator) — cost if wrong: none.
Phase 7: found on device and fixed: WebView navigator.onLine stuck true (now @capacitor/network); .gz OCR assets unpacked by Android packager (gzip:false on native); header under status bar (safe-area insets); false "browser may clear data" banner on native.
Phase 7: complete (scripts/device-check.mjs on Pixel_7 AVD, airplane mode → all 8 steps ok; vitest 86/86; playwright 14/14; backend untouched so pytest not rerun)

# Pivot 2026-10-20: personal offline assistant (Next.js web/ + Gemma 3n) — plan rewritten in place
P1: Ruling: workbox-build generateSW over out/ instead of @serwist/next — static export is a plain folder; Serwist's Turbopack route handler targets server builds — cost if wrong: swap to Serwist later, one script.
P1: Ruling: sqlite-wasm loaded unbundled from public/sqlite via turbopackIgnore import — its browser entry spawns workers from dynamic URLs Turbopack cannot resolve — cost if wrong: none found; verified OPFS persistent + Hindi FTS in Chromium.
P1: Ruling: personal schema written fresh (profiles, health_entries, reports, chats, messages); dropped sync_operations/audit_events/scope until backup returns — no data to migrate.
P1: complete (web/ vitest 53/53, next build static export OK, Chromium smoke: persistent=true fts=fever-hi,fever-en,heat-stroke-hi)
P2: complete (design v2 docs/design.md; shell/home/emergency/more; vitest 53/53; playwright web 4/4 incl. offline via SW; screenshots reviewed 360/1280 light/dark hi/en)
P3: Ruling: SQLite worker is plain JS in web/public/db-worker.mjs, schema sent via 'init' — Turbopack's worker bootstrap reads config from the URL fragment, lost when the SW serves the script (broke every SW-controlled load) — cost if wrong: worker logic duplicated in ~10 lines with src/database/sqlite.ts.
P3: Ruling: chat retrieval = filler-word removal + OR terms + must hit title/keywords + one item per topic — AND search found nothing for natural sentences — cost if wrong: tune FILLER list.
P3: found+fixed: Chromium scroll methods return a Promise (implicit-return effect crashed /chat); questions asked before first-run seed finished were dropped (now await whenReady; e2e RED->GREEN).
P3: complete (vitest 63/63; playwright 10/10: grounded answer + source, emergency first, unknown -> 104, history, Hindi chip, early question)
P4: Ruling: respond() takes the model as a promise — emergencies never wait on Ollama detection — cost if wrong: one signature change.
P4: Ruling: model detected per question via /api/tags (1.5 s timeout), choice auto/e2b/e4b/off in localStorage — Ollama can start/stop anytime — cost: one extra local request per question.
P4: Ruling: crude English suffix stemming in retrieve ("burned" found nothing) — cost if wrong: occasional over-broad match.
P4: Ruling: streamed text aria-hidden; the saved answer is announced once — cost: SR users hear the answer only when finished.
Phase 4: complete (vitest 89/89, Playwright 18/18, real gemma3n:e2b checked en+hi: ~2-3 s warm, dose question falls back to library). Audits (web-design-guidelines, ponytail-review, code review) not run this phase.
P4b (LiteRT-LM): Ruling: Ollama removed; Gemma 4 E2B + Gemma 3n E2B run in-browser via @litert-lm/core (WebGPU), files in OPFS — user asked for LiteRT-LM — cost: needs WebGPU browser, 2-3 GB download.
P4b: Ruling: @litert-lm/core pinned to exactly 0.18.0 — 0.18.1's packaged WASM doesn't match its JS (ModelAssets.create is not a function); 0.18.0 verified on RTX 4050 — cost: miss fixes until a newer release is re-verified.
P4b: Ruling: runtime WASM served from /litert/<version>/ and runtime-cached (not precached, 4 builds x 23-36 MB) — a version bump never pairs old WASM with new JS.
P4b: Ruling: Gemma 3n E2B is gated (Google licence) — added by "choose file" only; loading it in @litert-lm/core is UNVERIFIED (no file without the user's HF login). If it fails, respond() falls back to the library.
P4b: complete (vitest 87/87, Playwright 20/20, real Gemma 4 E2B in headless Chrome: grounded en+hi answers, ~1 s answer + ~3.5 s first load, emergency bypasses model).
P5: Ruling: a checked report becomes a numbered assistant source (reportSource) instead of a separate prompt path — the guard's number check then covers report values for free — cost: report answers are limited to 3 sources incl. the report.
P5: Ruling: guard holds back a trailing "9." while streaming (found via report decimals; library had only integers) — test added RED→GREEN.
P5: Ruling: Records tab = family list + link to Reports; reports reachable from Home tile, Records and each person — cost: one extra tap to Reports from the tab.
P5: Ruling: deletes use an inline two-step button, never window.confirm (blocks automation, poor on mobile).
Phase 5: complete (vitest 104/104, Playwright 24/24 incl. offline OCR report journey + family/coming-up). Audits (web-design-guidelines, ponytail-review, code review) still not run — batch them before Phase 7 sign-off.
P6: Ruling: no accounts for blood requests — each request and each donor registration gets a random device token (only its sha256 stored); a lost token means a new request/registration — cost if wrong: no cross-device access; add sign-in if users need it.
P6: Ruling: donor contact reaches a requester only after that donor accepts that request; withdrawn/inactive donors' accepted contacts stop showing; withdraw erases the number; every accept writes AuditEvent donor_contact_shared.
P6: Ruling: donor tokens in a new donor_tokens table instead of a column on donors — create_all cannot add columns to the existing dev DB — cost: one extra join.
P6: Ruling: donors see every open request of their group (no distance cut-off) — ponytail-marked; add a radius when requests span more than a district.
P6: Ruling: no rate limiting on anonymous request creation — demo scope — cost if wrong: spam requests; add per-IP limits before a public deploy.
P6: Ruling: e2e routes localhost:8000 to a throwaway in-memory backend on :8010 (second Playwright webServer) so specs never touch the dev DB.
Phase 6: complete (pytest 36/36, vitest 110/110, Playwright 28/28 incl. donor accept → requester sees number, offline request). Pre-existing lint errors (set-state-in-effect in app-context/chat/more/home/first-aid, rules-of-hooks in emergency) left for the audit batch.
Security: fixed self-registered donor contacts leaking via coordinator /donors/directory (found by automated commit review) — test_self_registered_donors_never_appear_in_the_coordinator_directory RED->GREEN, pytest 37/37
P7 (in progress): Ruling: native Gemma via Capacitor plugin GemmaPlugin.kt (litertlm-android 0.18.0, GPU then CPU fallback); Android uses the non-web model files (gemma-4-E2B-it.litertlm 2.58 GB; gated gemma-3n-E2B-it-int4.litertlm 3.66 GB) chosen by catalogue(android) — tested.
P7: Ruling: Android "Choose file" uses the system picker and copies natively (multi-GB files cannot cross the WebView bridge); browser model runtime excluded from the APK (!litert).
P7: found on emulator: HF download stalled at 98% (read timeout) and failed; added Range resume with 5 attempts. NOT yet re-verified on device. Gemma answers on device NOT yet verified. app/ NOT yet deleted (a preview server on :4173 may use it).
