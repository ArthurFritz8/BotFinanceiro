CREATE TABLE IF NOT EXISTS copilot_user_conversations (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  title TEXT NOT NULL DEFAULT 'Nova conversa',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_message_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_copilot_user_conversations_user_last_message
ON copilot_user_conversations (user_id, last_message_at DESC, created_at DESC);

CREATE TABLE IF NOT EXISTS copilot_user_messages (
  id BIGSERIAL PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES copilot_user_conversations(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  model TEXT,
  total_tokens INTEGER,
  is_error BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_copilot_user_messages_conversation_created
ON copilot_user_messages (conversation_id, created_at ASC, id ASC);

CREATE INDEX IF NOT EXISTS idx_copilot_user_messages_user_created
ON copilot_user_messages (user_id, created_at DESC);

DO $$
BEGIN
  IF to_regprocedure('auth.uid()') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE copilot_user_conversations ENABLE ROW LEVEL SECURITY';
    EXECUTE 'ALTER TABLE copilot_user_messages ENABLE ROW LEVEL SECURITY';

    IF NOT EXISTS (
      SELECT 1
      FROM pg_policies
      WHERE schemaname = current_schema()
        AND tablename = 'copilot_user_conversations'
        AND policyname = 'copilot_user_conversations_owner_all'
    ) THEN
      EXECUTE '
        CREATE POLICY copilot_user_conversations_owner_all
        ON copilot_user_conversations
        FOR ALL
        USING (auth.uid()::text = user_id)
        WITH CHECK (auth.uid()::text = user_id)
      ';
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM pg_policies
      WHERE schemaname = current_schema()
        AND tablename = 'copilot_user_messages'
        AND policyname = 'copilot_user_messages_owner_all'
    ) THEN
      EXECUTE '
        CREATE POLICY copilot_user_messages_owner_all
        ON copilot_user_messages
        FOR ALL
        USING (auth.uid()::text = user_id)
        WITH CHECK (auth.uid()::text = user_id)
      ';
    END IF;
  END IF;
END
$$;
