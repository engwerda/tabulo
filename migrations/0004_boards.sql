CREATE TABLE boards (
  org TEXT NOT NULL,
  id TEXT NOT NULL,
  name TEXT NOT NULL,
  repos TEXT NOT NULL,
  column_order TEXT NOT NULL,
  hidden_columns TEXT NOT NULL,
  version INTEGER NOT NULL CHECK (version >= 1),
  updated_at INTEGER NOT NULL,
  updated_by TEXT NOT NULL,
  PRIMARY KEY (org, id)
);
