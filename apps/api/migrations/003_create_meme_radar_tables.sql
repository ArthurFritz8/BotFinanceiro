CREATE TABLE IF NOT EXISTS meme_radar_pairs (
  fingerprint TEXT PRIMARY KEY,
  chain TEXT NOT NULL CHECK (chain IN ('solana', 'base')),
  pair_address TEXT NOT NULL,
  dex_id TEXT,
  pair_url TEXT,
  base_token_address TEXT,
  base_token_symbol TEXT NOT NULL,
  base_token_name TEXT NOT NULL,
  quote_token_symbol TEXT,
  launched_at TIMESTAMPTZ,
  discovered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  metrics JSONB NOT NULL DEFAULT '{}'::jsonb,
  socials JSONB NOT NULL DEFAULT '[]'::jsonb,
  sources TEXT[] NOT NULL DEFAULT '{}'::text[]
);

CREATE INDEX IF NOT EXISTS idx_meme_radar_pairs_chain_updated_at
ON meme_radar_pairs (chain, updated_at DESC);

CREATE TABLE IF NOT EXISTS meme_radar_sentiment_snapshots (
  id BIGSERIAL PRIMARY KEY,
  pair_fingerprint TEXT NOT NULL REFERENCES meme_radar_pairs(fingerprint) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  model TEXT NOT NULL,
  payload JSONB NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_meme_radar_sentiment_pair_created_at
ON meme_radar_sentiment_snapshots (pair_fingerprint, created_at DESC);

CREATE TABLE IF NOT EXISTS meme_radar_notifications (
  id BIGSERIAL PRIMARY KEY,
  pair_fingerprint TEXT NOT NULL UNIQUE REFERENCES meme_radar_pairs(fingerprint) ON DELETE CASCADE,
  priority TEXT NOT NULL CHECK (priority IN ('critical', 'high', 'watch')),
  pinned BOOLEAN NOT NULL DEFAULT FALSE,
  dismissed BOOLEAN NOT NULL DEFAULT FALSE,
  headline TEXT NOT NULL,
  summary TEXT NOT NULL,
  risk_flags TEXT[] NOT NULL DEFAULT '{}'::text[],
  catalysts TEXT[] NOT NULL DEFAULT '{}'::text[],
  last_score NUMERIC(5, 2) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_meme_radar_notifications_board
ON meme_radar_notifications (pinned DESC, priority, last_score DESC, updated_at DESC);
