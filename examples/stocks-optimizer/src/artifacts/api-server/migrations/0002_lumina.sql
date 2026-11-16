-- Lúmina application data; Better Auth maintains its own authentication tables.
-- Additive migration: all records are owned by a signed-in user ID.
CREATE TABLE IF NOT EXISTS lumina_goals (
  id text PRIMARY KEY,
  owner_id text NOT NULL,
  title text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 160),
  target_amount numeric(18, 2),
  target_date date,
  description text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS lumina_goals_owner_updated_idx ON lumina_goals (owner_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS lumina_practice_choices (
  id text PRIMARY KEY,
  owner_id text NOT NULL,
  goal_id text,
  goal_label text NOT NULL DEFAULT 'your money',
  amount numeric(18, 2) NOT NULL CHECK (amount >= 100 AND amount <= 10000000),
  exposed_percent integer NOT NULL CHECK (exposed_percent BETWEEN 0 AND 100),
  horizon text CHECK (horizon IN ('soon', 'middle', 'later', 'unsure')),
  rationale text NOT NULL DEFAULT '',
  provenance text NOT NULL DEFAULT 'illustrative' CHECK (provenance = 'illustrative'),
  executed boolean NOT NULL DEFAULT false CHECK (executed = false),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS lumina_practice_owner_idx ON lumina_practice_choices (owner_id, created_at DESC);

CREATE TABLE IF NOT EXISTS lumina_conversations (
  id text PRIMARY KEY,
  owner_id text NOT NULL,
  title text NOT NULL DEFAULT 'A thought',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS lumina_conversations_owner_idx ON lumina_conversations (owner_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS lumina_messages (
  id text PRIMARY KEY,
  owner_id text NOT NULL,
  conversation_id text NOT NULL REFERENCES lumina_conversations(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('user', 'assistant')),
  content text NOT NULL CHECK (char_length(content) BETWEEN 1 AND 8000),
  provenance text NOT NULL CHECK (provenance IN ('user-provided', 'illustrative', 'ai-generated')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS lumina_messages_thread_idx ON lumina_messages (owner_id, conversation_id, created_at ASC);

CREATE TABLE IF NOT EXISTS lumina_inbox (
  id text PRIMARY KEY,
  owner_id text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('market-watch', 'verification', 'information')),
  title text NOT NULL,
  body text NOT NULL,
  source text NOT NULL,
  evidence_at timestamptz,
  seen_at timestamptz,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS lumina_inbox_owner_idx ON lumina_inbox (owner_id, created_at DESC);

CREATE TABLE IF NOT EXISTS lumina_market_watches (
  id text PRIMARY KEY,
  owner_id text NOT NULL,
  symbol text NOT NULL CHECK (symbol IN ('BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT')),
  direction text NOT NULL CHECK (direction IN ('above', 'below')),
  threshold numeric(24, 8) NOT NULL CHECK (threshold > 0),
  active boolean NOT NULL DEFAULT true,
  triggered_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS lumina_watches_owner_idx ON lumina_market_watches (owner_id, active);
