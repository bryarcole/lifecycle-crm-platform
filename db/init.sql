CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  company TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL UNIQUE,
  lifecycle_stage TEXT NOT NULL,
  campaign TEXT NOT NULL DEFAULT '',
  estimated_value NUMERIC(12, 2) NOT NULL DEFAULT 0,
  industry_code TEXT NOT NULL DEFAULT '442110',
  annual_revenue NUMERIC(14, 2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS lifecycle_events (
  id BIGSERIAL PRIMARY KEY,
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  department TEXT NOT NULL,
  action TEXT NOT NULL,
  from_stage TEXT,
  to_stage TEXT NOT NULL,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  status TEXT NOT NULL,
  amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS workflow_outbox (
  id BIGSERIAL PRIMARY KEY,
  event_id BIGINT NOT NULL UNIQUE REFERENCES lifecycle_events(id) ON DELETE CASCADE,
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS automation_notifications (
  event_id BIGINT PRIMARY KEY REFERENCES lifecycle_events(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  target_department TEXT NOT NULL,
  message TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  read_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS customers_stage_idx ON customers (lifecycle_stage);
CREATE INDEX IF NOT EXISTS customers_stage_updated_idx ON customers (lifecycle_stage, updated_at, id);
CREATE INDEX IF NOT EXISTS customers_industry_revenue_idx ON customers (industry_code, annual_revenue);
CREATE INDEX IF NOT EXISTS lifecycle_events_customer_idx ON lifecycle_events (customer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS lifecycle_events_customer_stage_idx ON lifecycle_events (customer_id, to_stage);
