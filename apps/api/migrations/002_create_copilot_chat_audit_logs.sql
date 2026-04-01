CREATE TABLE IF NOT EXISTS copilot_chat_audit_logs (
  id BIGSERIAL PRIMARY KEY,
  recorded_at TIMESTAMPTZ NOT NULL,
  payload JSONB NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_copilot_chat_audit_logs_recorded_at
ON copilot_chat_audit_logs (recorded_at DESC);
