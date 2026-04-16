CREATE TABLE IF NOT EXISTS binary_options_ghost_audit_logs (
  id BIGSERIAL PRIMARY KEY,
  recorded_at TIMESTAMPTZ NOT NULL,
  payload JSONB NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_binary_options_ghost_audit_logs_recorded_at
ON binary_options_ghost_audit_logs (recorded_at DESC);

CREATE INDEX IF NOT EXISTS idx_binary_options_ghost_audit_logs_session_signal
ON binary_options_ghost_audit_logs ((payload ->> 'sessionId'), (payload ->> 'signalId'));
