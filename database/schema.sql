CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS receipts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_date DATE NOT NULL,
  store TEXT NOT NULL,
  receipt_number TEXT,
  receipt_total NUMERIC(14, 2),
  currency CHAR(3) NOT NULL DEFAULT 'AMD',
  source_filename TEXT,
  source_mime_type TEXT,
  source_hash CHAR(64) UNIQUE,
  raw_extraction JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT receipt_total_nonnegative CHECK (receipt_total IS NULL OR receipt_total >= 0)
);

CREATE TABLE IF NOT EXISTS expenses (
  id BIGSERIAL PRIMARY KEY,
  receipt_id UUID REFERENCES receipts(id) ON DELETE CASCADE,
  purchase_date DATE NOT NULL,
  item_name TEXT NOT NULL,
  item_name_en TEXT,
  item_category TEXT NOT NULL DEFAULT 'Other',
  store TEXT NOT NULL,
  quantity NUMERIC(12, 3) NOT NULL DEFAULT 1,
  unit_price NUMERIC(14, 2),
  total_price NUMERIC(14, 2) NOT NULL,
  currency CHAR(3) NOT NULL DEFAULT 'AMD',
  extraction_confidence NUMERIC(4, 3),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT expense_quantity_positive CHECK (quantity > 0),
  CONSTRAINT expense_unit_price_nonnegative CHECK (unit_price IS NULL OR unit_price >= 0),
  CONSTRAINT expense_total_price_nonnegative CHECK (total_price >= 0),
  CONSTRAINT expense_confidence_range CHECK (
    extraction_confidence IS NULL OR extraction_confidence BETWEEN 0 AND 1
  )
);

CREATE INDEX IF NOT EXISTS expenses_purchase_date_idx ON expenses (purchase_date DESC);
CREATE INDEX IF NOT EXISTS expenses_item_category_idx ON expenses (item_category);
CREATE INDEX IF NOT EXISTS expenses_store_idx ON expenses (store);
CREATE INDEX IF NOT EXISTS expenses_total_price_idx ON expenses (total_price);
CREATE INDEX IF NOT EXISTS expenses_receipt_id_idx ON expenses (receipt_id);

CREATE TABLE IF NOT EXISTS chat_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL DEFAULT 'New conversation',
  model TEXT NOT NULL,
  total_estimated_cost_nanos BIGINT NOT NULL DEFAULT 0,
  last_cost_warning_dollars INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chat_conversation_cost_nonnegative CHECK (total_estimated_cost_nanos >= 0),
  CONSTRAINT chat_conversation_warning_nonnegative CHECK (last_cost_warning_dollars >= 0)
);

CREATE TABLE IF NOT EXISTS chat_messages (
  id BIGSERIAL PRIMARY KEY,
  conversation_id UUID NOT NULL REFERENCES chat_conversations(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  sources JSONB NOT NULL DEFAULT '[]'::jsonb,
  input_tokens INTEGER,
  output_tokens INTEGER,
  cache_creation_5m_input_tokens INTEGER NOT NULL DEFAULT 0,
  cache_creation_1h_input_tokens INTEGER NOT NULL DEFAULT 0,
  cache_read_input_tokens INTEGER NOT NULL DEFAULT 0,
  web_search_requests INTEGER NOT NULL DEFAULT 0,
  estimated_cost_nanos BIGINT NOT NULL DEFAULT 0,
  pricing_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chat_message_role CHECK (role IN ('user', 'assistant')),
  CONSTRAINT chat_message_content_nonempty CHECK (length(btrim(content)) > 0),
  CONSTRAINT chat_message_input_tokens_nonnegative CHECK (input_tokens IS NULL OR input_tokens >= 0),
  CONSTRAINT chat_message_output_tokens_nonnegative CHECK (output_tokens IS NULL OR output_tokens >= 0),
  CONSTRAINT chat_message_cache_creation_5m_nonnegative CHECK (cache_creation_5m_input_tokens >= 0),
  CONSTRAINT chat_message_cache_creation_1h_nonnegative CHECK (cache_creation_1h_input_tokens >= 0),
  CONSTRAINT chat_message_cache_read_nonnegative CHECK (cache_read_input_tokens >= 0),
  CONSTRAINT chat_message_web_searches_nonnegative CHECK (web_search_requests >= 0),
  CONSTRAINT chat_message_cost_nonnegative CHECK (estimated_cost_nanos >= 0)
);

ALTER TABLE chat_conversations
  ADD COLUMN IF NOT EXISTS total_estimated_cost_nanos BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_cost_warning_dollars INTEGER NOT NULL DEFAULT 0;

ALTER TABLE chat_messages
  ADD COLUMN IF NOT EXISTS cache_creation_5m_input_tokens INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cache_creation_1h_input_tokens INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cache_read_input_tokens INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS web_search_requests INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS estimated_cost_nanos BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS pricing_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb;

-- Historical messages predate detailed billing capture, so their estimate includes only
-- the input/output tokens that were stored at the time. New messages retain the full
-- pricing snapshot and server-tool usage used for their estimate.
UPDATE chat_messages AS message
SET estimated_cost_nanos = COALESCE(message.input_tokens, 0)::bigint * 2000
                           + COALESCE(message.output_tokens, 0)::bigint * 10000,
    pricing_snapshot = jsonb_build_object(
      'model', conversation.model,
      'currency', 'USD',
      'effectiveDate', '2026-08-22',
      'inputPerMillionTokens', 2,
      'outputPerMillionTokens', 10,
      'legacyTokenOnlyEstimate', true
    )
FROM chat_conversations AS conversation
WHERE message.conversation_id = conversation.id
  AND conversation.model = 'claude-sonnet-5'
  AND message.role = 'assistant'
  AND message.estimated_cost_nanos = 0
  AND (COALESCE(message.input_tokens, 0) > 0 OR COALESCE(message.output_tokens, 0) > 0);

UPDATE chat_conversations AS conversation
SET total_estimated_cost_nanos = message_cost.total_estimated_cost_nanos
FROM (
  SELECT conversation_id, COALESCE(SUM(estimated_cost_nanos), 0)::bigint AS total_estimated_cost_nanos
  FROM chat_messages
  GROUP BY conversation_id
) AS message_cost
WHERE conversation.id = message_cost.conversation_id
  AND conversation.total_estimated_cost_nanos IS DISTINCT FROM message_cost.total_estimated_cost_nanos;

CREATE INDEX IF NOT EXISTS chat_conversations_updated_at_idx
  ON chat_conversations (updated_at DESC);
CREATE INDEX IF NOT EXISTS chat_messages_conversation_id_idx
  ON chat_messages (conversation_id, id);

CREATE OR REPLACE FUNCTION set_expenses_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS expenses_updated_at_trigger ON expenses;
CREATE TRIGGER expenses_updated_at_trigger
BEFORE UPDATE ON expenses
FOR EACH ROW EXECUTE FUNCTION set_expenses_updated_at();

COMMENT ON TABLE expenses IS 'One row per purchased item extracted from a receipt.';
COMMENT ON COLUMN expenses.item_name IS 'Original item name, usually Armenian, exactly as reviewed by the user.';
COMMENT ON COLUMN expenses.item_name_en IS 'English translation used for search and display.';
COMMENT ON TABLE chat_conversations IS 'Durable Claude chat threads available for later continuation.';
COMMENT ON TABLE chat_messages IS 'User and assistant messages replayed to preserve conversation memory.';
