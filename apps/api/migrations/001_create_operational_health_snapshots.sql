CREATE TABLE IF NOT EXISTS operational_health_snapshots (
  id BIGSERIAL PRIMARY KEY,
  recorded_at TIMESTAMPTZ NOT NULL,
  snapshot JSONB NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_operational_health_snapshots_recorded_at
ON operational_health_snapshots (recorded_at DESC);
