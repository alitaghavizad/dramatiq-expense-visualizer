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
