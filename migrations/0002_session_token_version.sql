-- Incremented by every token write, so concurrent refreshes can compare and swap.
ALTER TABLE sessions ADD COLUMN token_version INTEGER NOT NULL DEFAULT 0;
