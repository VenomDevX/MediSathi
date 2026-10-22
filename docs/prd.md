# MediSaathi
## Product Requirements Document (PRD)

**Document version:** 1.4  
**Status:** Hackathon build delivered (October 2026); requirements not yet met are listed in §10 (see §14 change log)  
**Product category:** Offline-first AI healthcare support platform  
**Primary platforms:** Android app and offline-capable website (used on laptops and desktops)  
**Primary deployment context:** Rural communities, ASHA workers, low-connectivity areas, and disaster-response environments

---

## 1. Product overview

MediSaathi is an offline-first healthcare companion designed to help people understand medical reports, maintain basic patient records, access reviewed health guidance, and locate registered potential blood donors when internet connectivity is unavailable.

The platform consists of four primary modules:

1. **MediScan:** Medical-report OCR and simplified explanations.
2. **ASHA Assist:** Offline patient records, visit notes, and follow-up management.
3. **BloodLink:** Search a locally cached directory of consenting potential donors.
4. **Offline Health Guidance:** Access clinically reviewed health information and emergency first-aid guidance without relying on a live AI service.

A synchronization service allows authorized devices to exchange changes with a central backend when connectivity becomes available.

### Product vision

Make essential health information and basic healthcare workflows available even when the internet is unreliable, while keeping clinical decisions with qualified healthcare professionals.

### Core principles

- Offline operation for essential workflows.
- Privacy and consent by default.
- Simple interfaces suitable for non-technical and low-literacy users, including read-aloud of explanations and guidance.
- Hindi and English support, with room for additional Indian languages.
- Deterministic, reviewed logic first; generative AI only as an optional rewording layer.
- Clear distinction between extracted medical facts and AI-generated explanations.
- Human clinical oversight for consequential medical decisions.
- Transparent data freshness and synchronization status.

## 2. Problem statement

People in rural or disaster-affected areas may have limited connectivity, difficulty understanding medical reports, fragmented patient records, and limited access to current local donor information.

Cloud-dependent applications can become unusable when connectivity disappears. Unverified AI-generated medical answers can also introduce risks if users interpret them as diagnoses or treatment instructions.

MediSaathi addresses these problems by moving essential data storage, OCR, approved guidance retrieval, and selected AI inference onto supported devices.

## 3. Target users

### Primary personas

**P1 — Patient or caregiver**
- Wants a medical report explained in simple language.
- Needs access to previously saved reports without internet.
- Needs clear instructions on when to seek professional help.

**P2 — ASHA worker or community health worker**
- Needs to register patients and record visits in the field.
- Needs a follow-up list that works offline.
- Needs to synchronize records securely when a connection returns.

**P3 — Emergency or relief worker**
- Needs rapid access to reviewed first-aid information.
- May need a cached donor directory or locally available patient records.
- May work with limited power, connectivity, and device storage.

**P4 — Healthcare supervisor or authorized administrator**
- Needs to manage staff access and approved content.
- Needs to review synchronization failures and record changes.
- Needs to maintain donor registration and consent processes.

## 4. Product goals and non-goals

### Goals

- Make saved patient records accessible offline.
- Extract text from supported medical-report images and PDFs.
- Preserve original laboratory values, units, and reference ranges wherever available.
- Explain extracted information in plain Hindi or English.
- Provide offline access to a versioned library of clinically reviewed guidance.
- Search a cached donor directory using blood group and approximate distance.
- Queue authorized record changes and synchronize them reliably.
- Support Android phones (app) and laptops/desktops (website) with differing hardware capabilities.
- Protect patient and donor information from unauthorized access.

### Non-goals for the initial release

- Autonomous diagnosis or treatment planning.
- AI-generated prescriptions or medication dosing decisions.
- Replacing doctors, laboratories, blood banks, or emergency services.
- Determining definitive blood-transfusion compatibility.
- Guaranteeing that an offline donor is alive, available, reachable, or eligible to donate.
- Requiring real-time cloud AI for core offline functionality.
- Guaranteeing Bluetooth or Wi-Fi Direct mesh communication in the MVP.
- Claiming clinical accuracy before formal evaluation.

## 5. Product modules and requirements

### 5.1 MediScan — report understanding

**MS-01:** Users must be able to import supported report images and PDFs.

**MS-02:** The application must run OCR locally for supported formats and installed language packs.

**MS-03:** The original file must remain available unless the user explicitly deletes it.

**MS-04:** Extracted text must be displayed for review and correction before it is treated as verified data.

**MS-05:** Where detected, the application should identify test names, values, units, reference ranges, and report dates.

**MS-06:** The explanation engine must distinguish extracted report content from its own explanation.

**MS-07:** Explanations must use plain language and support Hindi and English.

**MS-08:** Uncertain OCR results must be flagged rather than silently corrected or guessed.

**MS-09:** The interface must state that an explanation is educational and is not a diagnosis.

**MS-10:** Report import, extraction, and access to previously saved reports must work without internet.

**MS-11:** The baseline explanation must be rule-based: each verified value is compared with its reference range (from the report, or from an approved fallback reference table when the report has none) and mapped to clinically reviewed plain-language text for that test. This must work on every supported device, with no language model.

**MS-12:** When the local model is available, the user may optionally request a simpler rewording of the rule-based explanation. The rewording must not change values, units, ranges, or the low/normal/high classification.

**MS-13:** Explanations must be readable aloud using on-device text-to-speech in Hindi and English.

**MS-14:** When a reference range comes from the fallback table instead of the report, the interface must say so and show the table's source.

**Acceptance criteria**
- A previously imported report can be reopened in airplane mode.
- OCR output can be reviewed and corrected.
- Uncertain values are visibly identified.
- Original values and units are not silently replaced by generated content.
- AI inference can be disabled while OCR, report viewing, and rule-based explanations remain usable.
- An explanation can be played aloud offline in Hindi.

### 5.2 ASHA Assist — patient records

**AA-01:** Authorized workers must be able to create a patient record offline.

**AA-02:** Workers must be able to record visits, observations, notes, and follow-up dates.

**AA-03:** Records must persist after the application closes or the device restarts.

**AA-04:** The application must display whether a record is local-only, pending synchronization, synchronized, or in conflict.

**AA-05:** Users must be able to search locally stored records within their authorized scope.

**AA-06:** Follow-up reminders must be generated from locally stored dates without requiring internet.

**AA-07:** Visits are append-only. A correction is recorded as an amendment that references the original visit; the original is never overwritten. The visit view shows the latest amended state, with history available.

**AA-08:** Access must be restricted by user role and assigned scope.

**AA-09:** Patient identity must not depend on a name alone; the system must use a stable internal identifier.

**AA-10:** After a first successful online sign-in, a worker must be able to unlock the app offline with a local PIN or device biometric. Offline access expires after a configurable maximum period without server contact (default: 7 days), after which an online sign-in is required.

**AA-11:** A device downloads only the patients within the signed-in worker's assigned scope (for example, assigned villages or area), not the full patient database.

**AA-12:** One device may be shared by several workers. Each worker's session, scope, and audit trail must be separate.

**Acceptance criteria**
- Creating and reopening a visit works in airplane mode.
- A worker who signed in online once can unlock the app offline with a PIN.
- Pending records remain queued after a restart.
- A synchronization failure never silently deletes a local record.
- A user cannot open records outside their authorized scope.
- Amending a visit preserves the original and records who amended it and when.

### 5.3 BloodLink — potential donor search

**BL-01:** Authorized users must be able to search the locally cached donor directory by blood group.

**BL-02:** The application should calculate approximate distance when usable location coordinates are available.

**BL-03:** Users must be able to enter a village, locality, relief camp, or coordinates manually if GPS is unavailable.

**BL-04:** Results must show the donor directory's last verification or synchronization time.

**BL-05:** Donor contact information may only be revealed to authorized coordinator roles under the defined consent policy. Contact data is stored encrypted on the device and is not readable by other roles. Every reveal is recorded in the audit log, including when offline, and synchronized later.

**BL-06:** Donors must be able to consent to, update, or withdraw participation.

**BL-07:** The system must support donor deactivation and expiry of stale registrations.

**BL-08:** Results must be labeled as potential matches, not confirmed available or eligible donors.

**BL-09:** The application must never claim that blood-group matching alone establishes transfusion compatibility.

**BL-10:** The interface must direct emergency users to the relevant hospital, blood bank, or emergency-response channel.

**BL-11:** Donor locations must be coarsened on the server (approximately 1 km grid or locality level) before being sent to devices. Exact donor coordinates are never stored on client devices.

**Acceptance criteria**
- Blood-group search works using a previously synchronized cache in airplane mode.
- A non-coordinator user cannot view donor contact details.
- Each contact reveal produces an audit event.
- Results show their data freshness.
- A donor who has withdrawn consent is removed after the updated directory is received.
- The system never describes an unverified donor as confirmed available.
- Search remains usable with manually entered locations.

### 5.4 Offline Health Guidance

**HG-01:** Users must be able to browse a locally stored, clinically reviewed guidance library.

**HG-02:** Guidance must be searchable offline by symptom topic, first-aid topic, or category.

**HG-03:** Each guidance item must show its source, review date, version, intended audience, and limitations.

**HG-04:** A local AI model may explain approved guidance in simpler language.

**HG-05:** The AI must not invent a source or imply that unsupported information came from an approved guideline.

**HG-06:** Emergency escalation must use reviewed, deterministic safety rules and clear instructions, not depend exclusively on generative AI. Escalation screens must show India's emergency numbers (108 ambulance, 102 maternal/child transport, 112 national emergency) and any locally configured facility contacts, with one-tap calling.

**HG-07:** When the model cannot answer safely from available material, it must say so.

**HG-08:** The app must not generate autonomous diagnoses, prescriptions, or definitive treatment decisions.

**Acceptance criteria**
- Approved guidance is accessible with networking disabled.
- Each answer based on the guidance library identifies the relevant source.
- Missing or uncertain evidence produces a limitation message.
- High-risk emergency prompts trigger the reviewed escalation pathway.

### 5.5 Offline AI model management

**AI-01:** The application must verify that a compatible model artifact exists before enabling local inference.

**AI-02:** Model loading and inference must not block the user interface.

**AI-03:** The application must show a useful status if the device cannot load the model.

**AI-04:** The user must still be able to use non-AI functions when the model is unavailable.

**AI-05:** Model versions, licenses, supported languages, and tested hardware must be documented.

**AI-06:** Model updates must not overwrite the only working model until the new version passes integrity checks.

**AI-07:** Model downloads must be explicit and show their size. The model is downloaded once and kept on the device for offline use (website and Android). Models must also be installable without a large internet download by choosing a file already on the device (built). Checksum verification before activation is still required before a pilot.

**AI-08:** The application must support device tiers: an in-browser model on laptops whose browser supports WebGPU, an on-device model on Android phones (GPU first, CPU fallback), and a no-model tier where all non-AI features, including library answers and rule-based explanations, remain fully usable. The no-model tier is the default until the user downloads a model.

**AI-09:** The supported models are Gemma 4 E2B (default, one-tap download) and Gemma 3n E2B (the user accepts Google's licence and supplies the file), both run with Google LiteRT-LM.

### 5.6 Synchronization and multi-device support

**SY-01:** All critical local writes must be committed to local storage before being queued for synchronization.

**SY-02:** The system must retry temporary network failures.

**SY-03:** Retried operations must not create duplicate visits, patients, or donor registrations.

**SY-04:** Concurrent edits must follow documented conflict rules.

**SY-05:** The user must be able to see pending, successful, failed, and conflicted operations.

**SY-06:** Server-side authorization must be enforced even if a client has modified its local data.

**SY-07:** Sensitive synchronization traffic must be encrypted in transit.

**SY-08:** Each device synchronizes only the data within its signed-in users' authorized scope.

**Acceptance criteria**
- An offline visit synchronizes after connectivity returns.
- Repeating a request does not create a duplicate record.
- Conflicting edits are surfaced or resolved by a documented rule.
- A server rejection does not erase the user's local record.

### 5.7 Ask: health questions in plain words

**AQ-01:** Anyone can ask a health question by text or voice, in Hindi or English, with no internet.

**AQ-02:** Emergency rules run before anything else. A red-flag question (for example snake bite, not breathing, heavy bleeding) shows the emergency card with one-tap calling, and the model is not asked.

**AQ-03:** Answers come from the guidance library. When a model is installed it rewords the matched library item and must cite it; an answer without a valid citation, with a number not in the source, or naming a medicine is replaced by the library text.

**AQ-04:** Every answer shows where it came from, and says that MediSaathi is not a doctor and does not diagnose or give medicine doses.

**AQ-06 (prototype):** A user may choose an online model (Google Gemini) instead of the on-device one. It is off by default, the choice explains what is sent, only the question and matched library cards leave the device (never records or reports), answers pass the same guard and are labelled "Explained online", and without internet the app falls back to the on-device model or the library. The API key stays on the server.

**AQ-05:** Answers can be read aloud. Conversations are kept on the device and can be deleted.

**Acceptance criteria**
- "Someone was bitten by a snake" shows the emergency card and never calls the model.
- A fever question in Hindi gets a Hindi answer that cites the fever card.
- "How much paracetamol" never returns a dose.

### 5.8 Family health records

**FR-01:** A personal user can keep health records for themselves and family members on the device, without a worker account.

**FR-02:** Saved reports can be linked to a family member so their ranges and history are used.

### 5.9 Blood requests

**BR-01:** A person who needs blood can send a request for a blood group near a place, without creating an account.

**BR-02:** Donors of that group see the request. A donor's phone number is shared with the requester only after that donor accepts, and every share is audited.

**BR-03:** The requester's name and number are not sent to donors.

### 5.10 Accounts: sign up and sign in

**AC-01:** A person can create their own account with a name, username and password. Self sign-up always creates a **citizen** account with no village scope; ASHA worker, coordinator and admin accounts are created by an administrator, because they grant access to other people's records.

**AC-02:** A person can sign in or sign up with Google, on the website and in the Android app. The first Google sign-in creates a citizen account; later ones reuse it. Google sign-in is shown only when the deployment has configured it.

**AC-03:** Sign-up is limited per network address, usernames are unique, and passwords have at least 8 characters. A Google account cannot be reached with a password.

**AC-04:** After any sign-in or sign-up the person sets a local PIN, and the app then opens offline exactly as in AA-10. The offline demo accounts stay available without a server.

**Acceptance criteria**
- Creating an account signs the person in and lands them on their own home after setting a PIN.
- Choosing a taken username shows "That username is taken" and creates nothing.
- A sign-up request that asks for a worker role or a village scope still creates a citizen with no scope.

## 6. Cross-platform requirements

MediSaathi ships as two products built from one web codebase: a mobile app and a website. Domain rules, data access, synchronization, donor search, and guidance search are implemented once. Only platform-specific parts (OCR engine, AI runtime, notifications, location, text-to-speech, secure key storage) differ. There is no separate installable desktop application; laptops and desktops use the website.

### Mobile app (Android)
- Android app installed from an APK or app store.
- Local database and on-device OCR (English and Hindi), with Android cloud backup turned off. Full database encryption is still required before a pilot.
- Rule-based explanations and offline read-aloud.
- Optional on-device AI (Gemma 4 E2B with LiteRT-LM), downloaded once.
- Synchronization when the app is opened or the network returns.
- Local notifications for follow-ups.
- GPS location with manual entry as a fallback.

### Website (laptops and desktops)
- Works in current Chrome and Edge; other modern browsers should work for non-AI features.
- Installable as an app (PWA) and usable offline after the first visit.
- Local database and in-browser OCR (English and Hindi).
- Optional in-browser AI where the browser and hardware support it.
- Manual location entry; browser location when permitted.
- The website must ask the browser to keep its stored data, and warn the user that clearing browser data deletes unsynced records.

Both products use the same data contracts, business rules, and backend.

## 7. User journeys

### Journey A — explain a report without internet
1. User opens MediScan.
2. User imports a saved report or captures an image.
3. Local OCR extracts text.
4. User reviews uncertain fields.
5. The application compares each value with its reference range and shows the reviewed plain-language explanation.
6. Optionally, the local model rewords the explanation more simply in the selected language.
7. The user can listen to the explanation read aloud.
8. The user saves or exports the explanation, subject to privacy controls.

### Journey B — record a field visit
1. An authorized worker unlocks the app (online sign-in the first time, then offline PIN or biometric).
2. The worker opens or creates a patient record.
3. The worker records the visit and follow-up date.
4. The database saves the visit locally.
5. The application marks it as pending synchronization.
6. When connectivity returns, the sync service uploads it.
7. The application displays the server acknowledgement.

### Journey C — find a potential donor
1. An authorized user chooses a requested blood group.
2. The application obtains a location fix or accepts manual location input.
3. It searches the local donor cache.
4. It sorts eligible directory matches by approximate distance.
5. It displays freshness and consent-controlled contact options; a coordinator reveal is audited.
6. The hospital or blood bank verifies donor suitability and availability.

## 8. Non-functional requirements

**Availability:** Core local workflows must not depend on a successful server request.

**Performance:** Local database operations should feel immediate; expensive inference and OCR should run off the UI thread.

**Accessibility:** Use readable typography, large touch targets, simple navigation, and clear error messages.

**Localization:** Hindi and English must be supported in the MVP. Additional languages require translation and validation.

**Reliability:** Pending data must survive process termination and device restart.

**Security:** Encrypt sensitive data at rest and in transit, restrict access, and avoid exposing personal information in logs or notifications.

**Maintainability:** Use modular services, versioned schemas, documented APIs, automated tests, and repeatable builds.

**Power and storage:** Model downloads must be explicit, storage requirements visible, and inference should respect device resource limits.

**Safety:** Medical guidance and escalation logic require qualified clinical review before release.

**Regulatory and privacy:** Consent, purpose limitation, retention, and data-principal rights must follow India's Digital Personal Data Protection Act, 2023 and its rules. Integration with ABDM / ABHA health IDs is a later goal and should not be blocked by the data model.

## 9. Success metrics

Proposed targets for the pilot, subject to baseline measurement:

- 100% of critical local-write tests pass without connectivity.
- 100% of queued synchronization operations survive application restart tests.
- Zero duplicate records in the defined idempotency test suite.
- Zero unauthorized record disclosures in the security acceptance suite.
- 100% of released guidance items have an approved source and review metadata.
- At least 95% successful OCR extraction on a defined, representative test set for supported report layouts; report field-level accuracy separately.
- Local AI response latency and memory use are measured on every supported hardware tier before release.
- Donor results always display freshness and potential-match status.

These are project acceptance targets, not claims of achieved performance.

## 10. MVP scope

### Include
- Android app.
- Offline-capable website (PWA) for laptops and desktops, from the same codebase.
- Offline patient records and append-only visit notes.
- Offline PIN unlock (biometric unlock deferred).
- Local OCR for supported report images and PDFs.
- Report review, rule-based plain-language explanations, and read-aloud.
- Versioned offline guidance library.
- Cached donor directory and approximate-distance search.
- Secure synchronization and conflict visibility.
- Authentication, role-based authorization, audit events, and consent controls.

### Defer until later
- Bluetooth/Wi-Fi Direct mesh messaging.
- Automatic clinical-system integrations.
- Predictive risk scoring.
- Autonomous clinical recommendations.
- Broad multilingual model guarantees.
- Real-time donor availability claims.
- ABDM / ABHA integration.

### Hackathon demo scope (Hack-o-Relay 2026): delivered
The hackathon build delivers a working vertical slice on the website, as a PWA and as an Android app from the same code:
1. Local database, patients, append-only visits, follow-up reminders, and offline PIN unlock. Two demo accounts (ASHA worker and citizen).
2. MediScan: OCR on the device → review screen with flagged values → range check → reviewed explanation + read-aloud.
3. Ask (§5.7): emergency rules, library search and on-device Gemma 4 E2B in Hindi and English, behind the answer guard.
4. Guidance library with offline search, deterministic emergency rules and the 108/102/112 screen.
5. BloodLink with seeded donors, approximate distance, freshness labels, manual location, and blood requests with donor consent (§5.9).
6. Backend with sync push/pull, operation-ID idempotency, scoped access, token authentication, login limits, and SQLAdmin.
7. Accounts (§5.10): citizen sign-up and Google sign-in (Google's button on the website, the system account picker on Android), each followed by the offline PIN.

Measured on a Pixel 7 emulator in airplane mode: every feature above works offline; a full Gemma answer took 68 s on the emulator CPU. Tests: 168 unit, 81 backend, 23 end-to-end flows on phone and laptop sizes.

Not delivered yet: mesh, embedding retrieval, advanced conflict UI, full local-database encryption, biometric unlock, model checksum verification, clinical review of content.

## 11. Dependencies and risks

| Risk | Mitigation |
|---|---|
| Low RAM or unsupported hardware | Device-tier testing and graceful model fallback |
| Incorrect OCR | Reviewable extraction and uncertainty flags |
| Unsafe generated content | Reviewed retrieval library, constrained prompts, clinical validation |
| Stale donor directory | Freshness indicators, expiry policy, online confirmation when possible |
| Lost or conflicting records | Durable local writes, operation IDs, versioning, audit trail |
| Device theft or shared devices | Authentication, encryption, session locking, minimum retained data |
| Weak connectivity | Persistent queue and retry with backoff |
| Model download too large | Optional download, integrity checks, storage warnings |
| Unclear regulatory obligations | DPDP Act 2023 assessment, legal, privacy, and clinical review before pilot |
| Device too weak for any model | Rule-based explanations work with no model (MS-11) |
| Model download impossible on rural networks | AI is optional; library answers and rule-based explanations need no model; a model file can be copied onto the device and chosen (AI-07, MS-11) |
| Browser clears website data before sync | Request persistent storage, show pending count prominently, warn users (§6) |
| Browser lacks AI support | Website works fully without AI (AI-08) |
| Model gives an unsafe or invented answer | Emergency rules before the model; answer guard requires a citation and blocks new numbers and medicine names (AQ-02, AQ-03) |
| Lost device leaks donor directory | Coordinator-only encrypted contacts, coarsened locations (BL-05, BL-11) |
| Worker cannot sign in without network | Offline PIN unlock with bounded offline period (AA-10) |
| Divergent rules between website and app | One shared codebase for domain logic (§6) |

## 12. Release gates

**Gate 1 — Technical proof of concept:** Offline storage, OCR, and local model inference work on representative devices.

**Gate 2 — Functional MVP:** All core user journeys pass acceptance tests.

**Gate 3 — Safety and security:** Clinical content is reviewed, privacy controls are tested, and threat-model findings are addressed.

**Gate 4 — Controlled pilot:** Test with consenting users and synthetic or properly authorized data, collect failures, and review them.

**Gate 5 — Production release:** Release only after technical, clinical, operational, and applicable legal requirements are satisfied.

## 13. Definition of done

A feature is complete only when its implementation, tests, failure handling, documentation, security review, and offline behavior have been verified. A screen or mockup alone does not satisfy a requirement.

**Product decision:** MediSaathi is a decision-support and health-information tool, not an autonomous clinical system. Human healthcare professionals retain responsibility for diagnosis, treatment, and transfusion decisions.

## 14. Change log

**v1.4**
- Added accounts (§5.10): citizen self sign-up and Google sign-in on the website and Android; worker accounts stay admin-created (AC-01 to AC-04).
- Delivered scope and test counts updated (§10).

**v1.3**
- Status: hackathon build delivered; §10 lists what was built, what was measured, and what is still missing.
- On-device AI is no longer post-MVP: Gemma 4 E2B through LiteRT-LM on the website (WebGPU) and Android; Gemma 3n E2B by user file (AI-07 to AI-09).
- Added Ask (§5.7), family health records (§5.8) and blood requests with donor consent (§5.9).
- Mobile requirements updated: local database encryption and biometric unlock are still open (§6, §10).

**v1.2**
- Platforms changed to **Android app + offline-capable website** from one codebase; the separate Windows desktop application is removed (header, §4, §6, §10).
- AI model delivery updated: browser-cached model on the website; on-device AI on mobile moved to post-MVP (AI-07, AI-08).
- Added website storage-persistence requirement and related risks (§6, §11).
- Hackathon scope updated: website first, then Android app (§10).

**v1.1**
- Rule-based report explanation is now the baseline; LLM is an optional rewording layer (MS-11 to MS-14).
- Added offline text-to-speech for low-literacy users (MS-13).
- Visits are append-only with amendments (AA-07).
- Added offline PIN/biometric unlock, scoped sync, and shared-device sessions (AA-10 to AA-12, SY-08).
- Donor contacts restricted to coordinators, encrypted, audited; donor locations coarsened (BL-05, BL-11).
- Indian emergency numbers on escalation screens (HG-06).
- Model sideloading and device tiers (AI-07, AI-08).
- Shared codebase for Android and laptop (§6).
- DPDP Act 2023 and future ABDM/ABHA noted (§8).
- Added hackathon demo scope and new risks (§10, §11).
