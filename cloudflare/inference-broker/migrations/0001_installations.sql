CREATE TABLE installations (
  id TEXT PRIMARY KEY,
  token_hash TEXT NOT NULL UNIQUE,
  created_at INTEGER NOT NULL,
  last_seen_at INTEGER NOT NULL,
  disabled_at INTEGER,
  period_end INTEGER NOT NULL,
  included_remaining INTEGER NOT NULL,
  purchased_remaining INTEGER NOT NULL
);

CREATE INDEX installations_token_hash_idx ON installations(token_hash);
