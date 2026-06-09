-- ============================================================
-- ENGAGEMENT MONITOR — Supabase schema (run once in SQL Editor)
-- Shares the same Supabase project as the other Club F1 tools.
-- Tables are populated via CSV import for now (Hapana API later).
-- ============================================================

-- Members + their current engagement tags (one tag per category).
CREATE TABLE IF NOT EXISTS em_members (
  member_number   TEXT PRIMARY KEY,
  member_name     TEXT NOT NULL,
  attendance_tag  TEXT,
  membership_tag  TEXT,
  goal_tag        TEXT,
  bookings_tag    TEXT,
  offset_tag      TEXT,
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Tag → risk points (the scoring config). Editable in the Table Editor.
CREATE TABLE IF NOT EXISTS em_tag_weights (
  tag         TEXT PRIMARY KEY,
  category    TEXT,            -- e.g. "Attendance-Based Tags"
  risk_points INTEGER NOT NULL DEFAULT 0
);

-- SMS template library, keyed by category + condition (tag) + version.
CREATE TABLE IF NOT EXISTS em_sms_templates (
  id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category  TEXT NOT NULL,     -- e.g. "Attendance-Based Tags"
  condition TEXT NOT NULL,     -- the tag, e.g. "No sessions in last 3 days"
  version   TEXT NOT NULL,     -- e.g. "V_01"
  message   TEXT NOT NULL,
  UNIQUE (category, condition, version)
);

-- Decision / sent log: every approve or skip. Drives version rotation + cooldown.
CREATE TABLE IF NOT EXISTS em_messages (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  member_number TEXT NOT NULL,
  condition     TEXT,
  version       TEXT,
  message       TEXT,
  decision      TEXT NOT NULL CHECK (decision IN ('approved','skipped')),
  reason        TEXT,
  decided_by    TEXT,
  decided_at    TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_em_messages_member ON em_messages(member_number, decided_at DESC);

ALTER TABLE em_members       ENABLE ROW LEVEL SECURITY;
ALTER TABLE em_tag_weights   ENABLE ROW LEVEL SECURITY;
ALTER TABLE em_sms_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE em_messages      ENABLE ROW LEVEL SECURITY;
