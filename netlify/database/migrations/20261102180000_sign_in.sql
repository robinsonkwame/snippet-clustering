-- Sign-in and sessions (spec: Architecture and hosting, "Sign-in").
--
-- sessions.session_id becomes a random public ID (it appears in events.session_id),
-- and the cookie token is stored only as its SHA-256 hash in token_hash, so neither the
-- events log nor a database read reveals a usable token. The table has no rows before
-- this migration, so the NOT NULL column needs no default.
ALTER TABLE sessions ADD COLUMN token_hash text NOT NULL UNIQUE;

-- Every sign-in attempt, for the lockout: five failures from one client within
-- 15 minutes block that client until the oldest of them is 15 minutes old.
-- The client IP is stored only as a hash.
CREATE TABLE sign_in_attempts (
  attempt_id  bigserial PRIMARY KEY,
  ip_hash     text NOT NULL,
  user_id     text REFERENCES users (user_id),   -- set on success only
  success     boolean NOT NULL,
  at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX sign_in_attempts_ip_idx ON sign_in_attempts (ip_hash, at);
