-- Boards: saved views of one organization, each a name, repositories, a column order, and hidden
-- columns. The default board, id 'default', has a row only after a member first changes it.
-- repos, column_order, and hidden_columns are JSON arrays of strings. Every write names the
-- version it read, so concurrent writers compare and swap. Card order stays in card_ranks.
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
