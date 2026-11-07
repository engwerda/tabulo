-- Card order within a board column. Forgejo has no rank field; this is the only board state
-- Tabulo keeps. A row whose column_key is not the card's current column is ignored.
CREATE TABLE card_ranks (
  org TEXT NOT NULL,
  issue_key TEXT NOT NULL,
  column_key TEXT NOT NULL,
  rank TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  updated_by TEXT NOT NULL,
  PRIMARY KEY (org, issue_key)
);
