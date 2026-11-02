-- Value Matrix Board: initial schema.
-- Follows "Architecture and hosting" in the specification. Netlify applies every file in
-- this directory, in name order, on each production deploy and deploy preview; locally,
-- run `npm run db:migrate`. Never edit a migration that has shipped: add a new one.

-- People and sign-in ---------------------------------------------------------------------

CREATE TABLE users (
  user_id         text PRIMARY KEY,                -- lowercase first name, e.g. 'malak'
  display_name    text NOT NULL,
  role            text NOT NULL CHECK (role IN ('admin', 'editor')),
  can_backup      boolean NOT NULL DEFAULT false,  -- snapshot + off-site backup (Malak, Kwame)
  access_id_hash  text,                            -- hash only; access IDs never stored in clear
  active          boolean NOT NULL DEFAULT true,   -- admin revokes access by setting false
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE sessions (
  session_id   text PRIMARY KEY,                   -- hash of the random cookie token
  user_id      text NOT NULL REFERENCES users (user_id),
  created_at   timestamptz NOT NULL DEFAULT now(),
  expires_at   timestamptz NOT NULL,               -- 12 hours after sign-in
  revoked_at   timestamptz
);
CREATE INDEX sessions_user_idx ON sessions (user_id);

-- Imported data (read-only after import) -------------------------------------------------

CREATE TABLE snippets (
  snippet_id      text PRIMARY KEY,                -- paper_id || '|' || highlight_id
  paper_id        text NOT NULL,
  highlight_id    text NOT NULL,
  cite            text NOT NULL,
  text            text NOT NULL CHECK (char_length(text) BETWEEN 1 AND 2000),
  codes           text[] NOT NULL CHECK (cardinality(codes) >= 1),
  side            text NOT NULL CHECK (side IN ('buyer', 'brand_seller', 'platform', 'community', 'multi')),
  multi_pairs     text[] NOT NULL DEFAULT '{}',
  stance          text NOT NULL CHECK (stance IN ('documents', 'proposes', 'critiques', 'measures')),
  page            integer,
  memo            text,
  reviewer        text NOT NULL,
  source_version  text NOT NULL,
  imported_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (paper_id, highlight_id),
  CHECK (side <> 'multi' OR cardinality(multi_pairs) >= 1)
);

-- Board objects --------------------------------------------------------------------------

CREATE TABLE category_labels (
  label_id    text PRIMARY KEY,
  name        text NOT NULL UNIQUE,
  created_by  text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE categories (
  category_id     text PRIMARY KEY,                -- never reused; a merge retires one ID
  cell_code       text NOT NULL,
  cell_side       text NOT NULL,                   -- side row, or a multi pair row such as 'multi:buyer_seller'
  name            text NOT NULL,
  definition      text NOT NULL DEFAULT '',
  inclusion_note  text NOT NULL DEFAULT '',
  label_id        text REFERENCES category_labels (label_id),
  status          text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived', 'retired')),
  merged_into     text REFERENCES categories (category_id),
  x               double precision NOT NULL DEFAULT 0,
  y               double precision NOT NULL DEFAULT 0,
  created_by      text NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  last_edited_by  text,
  last_edited_at  timestamptz
);
CREATE INDEX categories_cell_idx ON categories (cell_code, cell_side);

CREATE TABLE cards (
  card_id        text PRIMARY KEY,                 -- snippet_id || '#' || copy
  snippet_id     text NOT NULL REFERENCES snippets (snippet_id),
  copy           integer NOT NULL CHECK (copy >= 1),
  original_code  text NOT NULL,
  code           text NOT NULL,
  original_side  text NOT NULL,
  side           text NOT NULL,
  category_id    text REFERENCES categories (category_id),  -- null = uncategorized area of the cell
  starred        boolean NOT NULL DEFAULT false,
  x              double precision NOT NULL DEFAULT 0,
  y              double precision NOT NULL DEFAULT 0,
  removed_at     timestamptz,                      -- copy removed (soft); the last copy cannot be
  UNIQUE (snippet_id, copy)
);
CREATE INDEX cards_cell_idx ON cards (code, side);
CREATE INDEX cards_category_idx ON cards (category_id);

CREATE TABLE cell_notes (
  code                  text NOT NULL,
  side                  text NOT NULL,
  note                  text NOT NULL DEFAULT '',
  evidence_snippet_ids  text[] NOT NULL DEFAULT '{}',
  llm_draft             boolean NOT NULL DEFAULT false,
  accepted_by           text,
  accepted_at           timestamptz,
  updated_by            text,
  updated_at            timestamptz,
  PRIMARY KEY (code, side)
);

CREATE TABLE notes (
  note_id     text PRIMARY KEY,
  text        text NOT NULL DEFAULT '',
  color       text,
  x           double precision NOT NULL DEFAULT 0,
  y           double precision NOT NULL DEFAULT 0,
  created_by  text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  deleted_at  timestamptz                          -- soft delete, logged
);

CREATE TABLE comments (
  comment_id   bigserial PRIMARY KEY,
  target_type  text NOT NULL CHECK (target_type IN ('snippet', 'category')),  -- comments belong to the snippet, not the copy
  target_id    text NOT NULL,
  author       text NOT NULL,
  text         text NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  resolved_by  text,
  resolved_at  timestamptz
);
CREATE INDEX comments_target_idx ON comments (target_type, target_id);

CREATE TABLE locks (
  target_type  text NOT NULL,
  target_id    text NOT NULL,
  user_id      text NOT NULL,
  acquired_at  timestamptz NOT NULL DEFAULT now(),
  expires_at   timestamptz NOT NULL,               -- 30 seconds of inactivity
  PRIMARY KEY (target_type, target_id)
);

-- Relate mode ----------------------------------------------------------------------------

CREATE TABLE relations (
  relation_id     text PRIMARY KEY,
  from_category   text NOT NULL REFERENCES categories (category_id),
  to_category     text NOT NULL REFERENCES categories (category_id),
  relation        text NOT NULL,                   -- draft vocabulary; validated in the API, not here
  direction       text NOT NULL CHECK (direction IN ('one_way', 'both_ways')),
  condition       text NOT NULL DEFAULT '',
  third_category  text REFERENCES categories (category_id),
  mechanism_note  text NOT NULL DEFAULT '',
  basis           text NOT NULL CHECK (basis IN ('asserted', 'inferred')),
  status          text NOT NULL DEFAULT 'proposed' CHECK (status IN ('proposed', 'agreed', 'rejected')),
  needs_review    boolean NOT NULL DEFAULT false,  -- set when a related category is split, merged or relabelled
  author          text NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  removed_at      timestamptz
);

CREATE TABLE relation_evidence (
  relation_id  text NOT NULL REFERENCES relations (relation_id),
  snippet_id   text NOT NULL REFERENCES snippets (snippet_id),  -- evidence points at the snippet, not the card
  added_by     text NOT NULL,
  added_at     timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (relation_id, snippet_id)
);

CREATE TABLE propositions (
  proposition_id  text PRIMARY KEY,
  relation_id     text NOT NULL REFERENCES relations (relation_id),
  wording         text NOT NULL DEFAULT '',
  author          text NOT NULL,
  edited_at       timestamptz NOT NULL DEFAULT now()
);

-- Audit log (append-only) ----------------------------------------------------------------

CREATE TABLE events (
  event_id       bigserial PRIMARY KEY,
  board_version  text NOT NULL,
  at             timestamptz NOT NULL DEFAULT now(),
  user_id        text NOT NULL REFERENCES users (user_id),
  session_id     text,
  action         text NOT NULL CHECK (action IN (
    'import', 'card_move', 'card_reposition', 'card_recode', 'card_recode_revert',
    'card_copy', 'card_copy_remove', 'card_star',
    'category_create', 'category_rename', 'category_define', 'category_label',
    'category_merge', 'category_split', 'category_archive',
    'label_create', 'label_rename', 'cell_note_edit', 'cell_note_accept',
    'note_create', 'note_edit', 'note_delete', 'comment_add', 'comment_resolve',
    'categories_freeze', 'relation_create', 'relation_edit', 'relation_status',
    'relation_remove', 'evidence_add', 'evidence_remove', 'proposition_edit',
    'board_lock', 'board_unlock', 'snapshot_create', 'snapshot_restore',
    'backup_download', 'export', 'sign_in'
  )),
  target_type    text NOT NULL CHECK (target_type IN ('card', 'pile', 'note', 'board')),
  target_id      text NOT NULL,
  before         jsonb,
  after          jsonb,
  conflict       boolean NOT NULL DEFAULT false
);
CREATE INDEX events_target_idx ON events (target_type, target_id);
CREATE INDEX events_user_idx ON events (user_id, at);

-- Events are never edited or deleted, by anyone. The spec asks for role grants
-- (INSERT and SELECT only); these triggers enforce the same rule for every role,
-- including the one Netlify Functions connect as.
CREATE FUNCTION events_reject_change() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'events is append-only: % is not allowed', TG_OP
    USING ERRCODE = 'insufficient_privilege';
END;
$$;

CREATE TRIGGER events_no_update_delete
  BEFORE UPDATE OR DELETE ON events
  FOR EACH ROW EXECUTE FUNCTION events_reject_change();

CREATE TRIGGER events_no_truncate
  BEFORE TRUNCATE ON events
  FOR EACH STATEMENT EXECUTE FUNCTION events_reject_change();
