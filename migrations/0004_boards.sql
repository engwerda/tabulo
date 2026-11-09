-- Saved views of one organization. The default board has a row only after a member first changes
-- it. Every write names the version it read, so concurrent writers compare and swap.
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
