// Local schema for one person and their family. All ids are UUID text; timestamps are UTC ISO-8601 text.
const now = "(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))"

export const schema = `
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS app_meta (key TEXT PRIMARY KEY, value TEXT);

-- The device owner: optional app lock (PIN) and optional account for backup / blood requests.
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  server_user_id TEXT,
  display_name TEXT NOT NULL,
  pin_verifier TEXT,
  pin_salt TEXT,
  wrapped_secret TEXT,
  failed_pin_attempts INTEGER NOT NULL DEFAULT 0,
  last_server_contact_at TEXT,
  created_at TEXT NOT NULL DEFAULT ${now}
);

-- Me and my family.
CREATE TABLE IF NOT EXISTS profiles (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  relation TEXT NOT NULL DEFAULT 'self',
  birth_year INTEGER,
  sex TEXT,
  blood_group TEXT,
  conditions TEXT NOT NULL DEFAULT '',
  allergies TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT ${now},
  updated_at TEXT NOT NULL DEFAULT ${now},
  deleted_at TEXT
);

-- Append-only health diary: a correction is a new row pointing at the row it amends.
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
  created_at TEXT NOT NULL DEFAULT ${now},
  voided_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_entries_profile ON health_entries (profile_id, entry_time);
CREATE INDEX IF NOT EXISTS idx_entries_follow_up ON health_entries (follow_up_at);

CREATE TABLE IF NOT EXISTS reports (
  id TEXT PRIMARY KEY,
  profile_id TEXT REFERENCES profiles (id),
  file_reference TEXT,
  file_hash TEXT,
  file_name TEXT,
  report_date TEXT,
  ocr_text TEXT,
  extracted_fields_json TEXT NOT NULL DEFAULT '[]',
  ocr_status TEXT NOT NULL DEFAULT 'new',
  created_at TEXT NOT NULL DEFAULT ${now},
  updated_at TEXT NOT NULL DEFAULT ${now},
  deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS chats (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  report_id TEXT REFERENCES reports (id),
  created_at TEXT NOT NULL DEFAULT ${now},
  updated_at TEXT NOT NULL DEFAULT ${now}
);
CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  chat_id TEXT NOT NULL REFERENCES chats (id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'answer',
  sources_json TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL DEFAULT ${now}
);
CREATE INDEX IF NOT EXISTS idx_messages_chat ON messages (chat_id, created_at);

-- Reference content, replaced when the bundled content version changes.
CREATE TABLE IF NOT EXISTS lab_test_catalogue (
  id TEXT PRIMARY KEY,
  canonical_name TEXT NOT NULL,
  data_json TEXT NOT NULL,
  version TEXT NOT NULL
);

-- Potential donors without contacts. Contacts are shared only by a donor accepting a request, on the server.
CREATE TABLE IF NOT EXISTS donors (
  id TEXT PRIMARY KEY,
  blood_group TEXT NOT NULL,
  approx_latitude REAL,
  approx_longitude REAL,
  locality_label TEXT,
  consent_status TEXT NOT NULL,
  last_verified_at TEXT,
  last_synced_at TEXT,
  registration_status TEXT NOT NULL DEFAULT 'active'
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
  reviewed_at TEXT,
  reviewed INTEGER NOT NULL DEFAULT 0,
  audience TEXT,
  limitations TEXT,
  version TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active'
);

-- remove_diacritics 0: keep Devanagari vowel signs intact.
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
`
