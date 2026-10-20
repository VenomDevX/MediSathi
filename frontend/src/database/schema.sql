-- MediSaathi local schema (TRD §6.1). All ids are UUID text; all timestamps are UTC ISO-8601 text.
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  server_user_id TEXT,
  display_name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('asha_worker', 'coordinator', 'supervisor', 'admin', 'citizen')),
  assigned_scope_json TEXT NOT NULL DEFAULT '[]',
  pin_verifier TEXT,
  pin_salt TEXT,
  wrapped_secret TEXT,
  failed_pin_attempts INTEGER NOT NULL DEFAULT 0,
  last_server_contact_at TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS patients (
  id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  date_of_birth TEXT,
  age_years INTEGER,
  sex TEXT,
  local_identifier TEXT,
  phone TEXT,
  village TEXT,
  scope_id TEXT NOT NULL,
  abha_id TEXT,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  record_version INTEGER NOT NULL DEFAULT 1,
  sync_status TEXT NOT NULL DEFAULT 'pending',
  deleted_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_patients_scope ON patients (scope_id, display_name);
CREATE INDEX IF NOT EXISTS idx_patients_sync ON patients (sync_status);

-- Append-only: rows are never updated except sync_status.
CREATE TABLE IF NOT EXISTS patient_visits (
  id TEXT PRIMARY KEY,
  patient_id TEXT NOT NULL REFERENCES patients (id),
  worker_id TEXT NOT NULL,
  amends_visit_id TEXT REFERENCES patient_visits (id),
  amendment_reason TEXT,
  visit_time TEXT NOT NULL,
  notes TEXT NOT NULL DEFAULT '',
  observations_json TEXT NOT NULL DEFAULT '{}',
  follow_up_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  sync_status TEXT NOT NULL DEFAULT 'pending',
  voided_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_visits_patient ON patient_visits (patient_id, visit_time);
CREATE INDEX IF NOT EXISTS idx_visits_follow_up ON patient_visits (follow_up_at);

CREATE TABLE IF NOT EXISTS medical_reports (
  id TEXT PRIMARY KEY,
  patient_id TEXT REFERENCES patients (id),
  file_reference TEXT,
  file_hash TEXT,
  file_name TEXT,
  report_date TEXT,
  ocr_text TEXT,
  extracted_fields_json TEXT NOT NULL DEFAULT '[]',
  language TEXT,
  ocr_status TEXT NOT NULL DEFAULT 'new',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  record_version INTEGER NOT NULL DEFAULT 1,
  sync_status TEXT NOT NULL DEFAULT 'pending',
  deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS lab_test_catalogue (
  id TEXT PRIMARY KEY,
  canonical_name TEXT NOT NULL,
  data_json TEXT NOT NULL,
  version TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS donors (
  id TEXT PRIMARY KEY,
  blood_group TEXT NOT NULL,
  approx_latitude REAL,
  approx_longitude REAL,
  locality_label TEXT,
  contact_encrypted TEXT,
  consent_status TEXT NOT NULL,
  consent_updated_at TEXT,
  last_verified_at TEXT,
  last_synced_at TEXT,
  registration_status TEXT NOT NULL DEFAULT 'active',
  directory_version INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT,
  deleted_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_donors_group ON donors (blood_group, registration_status);

CREATE TABLE IF NOT EXISTS guidance_documents (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  language TEXT NOT NULL,
  topic TEXT NOT NULL,
  category TEXT,
  summary TEXT,
  content TEXT NOT NULL,
  keywords TEXT NOT NULL DEFAULT '',
  source_name TEXT NOT NULL,
  source_reference TEXT,
  reviewed_by_role TEXT,
  reviewed_at TEXT,
  reviewed INTEGER NOT NULL DEFAULT 0,
  audience TEXT,
  limitations TEXT,
  version TEXT NOT NULL,
  effective_from TEXT,
  effective_until TEXT,
  content_hash TEXT,
  status TEXT NOT NULL DEFAULT 'active'
);

-- remove_diacritics 0: keep Devanagari vowel signs intact (TRD §4.5).
CREATE VIRTUAL TABLE IF NOT EXISTS guidance_fts USING fts5 (
  id UNINDEXED, title, content, keywords,
  tokenize = 'unicode61 remove_diacritics 0'
);
CREATE TRIGGER IF NOT EXISTS guidance_ai AFTER INSERT ON guidance_documents BEGIN
  INSERT INTO guidance_fts (id, title, content, keywords) VALUES (new.id, new.title, new.content, new.keywords);
END;
CREATE TRIGGER IF NOT EXISTS guidance_ad AFTER DELETE ON guidance_documents BEGIN
  DELETE FROM guidance_fts WHERE id = old.id;
END;
CREATE TRIGGER IF NOT EXISTS guidance_au AFTER UPDATE ON guidance_documents BEGIN
  DELETE FROM guidance_fts WHERE id = old.id;
  INSERT INTO guidance_fts (id, title, content, keywords) VALUES (new.id, new.title, new.content, new.keywords);
END;

CREATE TABLE IF NOT EXISTS sync_operations (
  operation_id TEXT PRIMARY KEY,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  operation_type TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  base_version INTEGER,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  attempt_count INTEGER NOT NULL DEFAULT 0,
  next_attempt_at TEXT,
  last_error_code TEXT,
  status TEXT NOT NULL DEFAULT 'pending'
);
CREATE INDEX IF NOT EXISTS idx_sync_status ON sync_operations (status, created_at);

CREATE TABLE IF NOT EXISTS audit_events (
  id TEXT PRIMARY KEY,
  actor_id TEXT NOT NULL,
  action TEXT NOT NULL,
  entity_type TEXT,
  entity_id TEXT,
  timestamp TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  result TEXT NOT NULL DEFAULT 'ok',
  metadata_minimized TEXT
);

-- Personal use: the device owner and their family.
CREATE TABLE IF NOT EXISTS profiles (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  relation TEXT NOT NULL DEFAULT 'self',
  birth_year INTEGER,
  sex TEXT,
  blood_group TEXT,
  conditions TEXT NOT NULL DEFAULT '',
  allergies TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  deleted_at TEXT
);

-- Personal health diary: append-only; a correction is a new row pointing at the one it amends.
CREATE TABLE IF NOT EXISTS health_entries (
  id TEXT PRIMARY KEY,
  profile_id TEXT NOT NULL REFERENCES profiles (id),
  kind TEXT NOT NULL CHECK (kind IN ('note', 'medicine', 'reading', 'visit')),
  amends_entry_id TEXT REFERENCES health_entries (id),
  amendment_reason TEXT,
  entry_time TEXT NOT NULL,
  text TEXT NOT NULL DEFAULT '',
  data_json TEXT NOT NULL DEFAULT '{}',
  follow_up_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  voided_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_entries_profile ON health_entries (profile_id, entry_time);
CREATE INDEX IF NOT EXISTS idx_entries_follow_up ON health_entries (follow_up_at);

-- Chat conversations with the assistant.
CREATE TABLE IF NOT EXISTS chats (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  report_id TEXT REFERENCES medical_reports (id),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  chat_id TEXT NOT NULL REFERENCES chats (id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'answer',
  sources_json TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX IF NOT EXISTS idx_messages_chat ON messages (chat_id, created_at);

CREATE TABLE IF NOT EXISTS app_meta (
  key TEXT PRIMARY KEY,
  value TEXT
);
