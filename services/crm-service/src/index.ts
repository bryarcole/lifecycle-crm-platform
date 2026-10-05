import express, { type NextFunction, type Request, type Response } from 'express';
import pg from 'pg';
import { queueStages, transitions } from './workflow.js';

const { Pool } = pg;
const app = express();
const port = Number(process.env.PORT ?? 4000);
const pool = new Pool({
  connectionString: process.env.DATABASE_URL ?? 'postgres://crm_app:local_only_change_me@localhost:5432/lifecycle_crm',
});

app.use(express.json());

async function initializeDatabase(): Promise<void> {
  await pool.query(`
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
    CREATE INDEX IF NOT EXISTS lifecycle_events_customer_idx ON lifecycle_events (customer_id, created_at DESC);
  `);
  await pool.query(`
    ALTER TABLE customers ADD COLUMN IF NOT EXISTS industry_code TEXT NOT NULL DEFAULT '442110';
    ALTER TABLE customers ADD COLUMN IF NOT EXISTS annual_revenue NUMERIC(14, 2) NOT NULL DEFAULT 0;
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS customers_stage_updated_idx ON customers (lifecycle_stage, updated_at, id);
    CREATE INDEX IF NOT EXISTS customers_industry_revenue_idx ON customers (industry_code, annual_revenue);
    CREATE INDEX IF NOT EXISTS lifecycle_events_customer_stage_idx ON lifecycle_events (customer_id, to_stage);
  `);

  const { rows } = await pool.query<{ count: string }>('SELECT COUNT(*)::text AS count FROM customers');
  if (Number(rows[0]?.count) === 0) {
    await pool.query(`
      INSERT INTO customers (name, company, email, lifecycle_stage, campaign, estimated_value) VALUES
        ('Avery Johnson', 'Northstar Health', 'avery@northstar.example', 'new_lead', 'Fall product launch', 18000),
        ('Jordan Kim', 'Juniper Works', 'jordan@juniper.example', 'warm_lead', 'Operations webinar', 24000),
        ('Riley Patel', 'Clearwater Group', 'riley@clearwater.example', 'qualified', 'Fall product launch', 42000),
        ('Casey Morgan', 'Atlas Field Services', 'casey@atlas.example', 'closed_won', 'Partner referrals', 31500),
        ('Taylor Reed', 'Brightline Studio', 'taylor@brightline.example', 'awaiting_delivery', 'Operations webinar', 12800),
        ('Quinn Rivera', 'Pioneer Systems', 'quinn@pioneer.example', 'active_customer', 'Fall product launch', 56000)
      ON CONFLICT (email) DO NOTHING;
      INSERT INTO orders (customer_id, status, amount)
        SELECT id, 'in_fulfillment', estimated_value FROM customers
        WHERE lifecycle_stage = 'awaiting_delivery'
        AND NOT EXISTS (SELECT 1 FROM orders WHERE orders.customer_id = customers.id);
    `);
  }
  await pool.query(`
    INSERT INTO lifecycle_events (customer_id, department, action, from_stage, to_stage, details)
    SELECT c.id,
      CASE history.stage
        WHEN 'new_lead' THEN 'marketing' WHEN 'warm_lead' THEN 'inside-sales'
        WHEN 'qualified' THEN 'sales' WHEN 'closed_won' THEN 'ordering'
        WHEN 'awaiting_delivery' THEN 'delivery' ELSE 'retention'
      END,
      'sample_history',
      CASE WHEN history.stage_index = 1 THEN NULL ELSE seed.stage_path[(history.stage_index - 1)::int] END,
      history.stage,
      '{"source":"sample data"}'::jsonb
    FROM (VALUES
      ('avery@northstar.example', ARRAY['new_lead']::text[]),
      ('jordan@juniper.example', ARRAY['new_lead', 'warm_lead']::text[]),
      ('riley@clearwater.example', ARRAY['new_lead', 'warm_lead', 'qualified']::text[]),
      ('casey@atlas.example', ARRAY['new_lead', 'warm_lead', 'qualified', 'closed_won']::text[]),
      ('taylor@brightline.example', ARRAY['new_lead', 'warm_lead', 'qualified', 'closed_won', 'awaiting_delivery']::text[]),
      ('quinn@pioneer.example', ARRAY['new_lead', 'warm_lead', 'qualified', 'closed_won', 'awaiting_delivery', 'active_customer']::text[])
    ) AS seed(email, stage_path)
    JOIN customers c ON c.email = seed.email
    CROSS JOIN LATERAL unnest(seed.stage_path) WITH ORDINALITY AS history(stage, stage_index)
    WHERE NOT EXISTS (SELECT 1 FROM lifecycle_events e WHERE e.customer_id = c.id);
  `);
}

app.get('/health', (_req, res) => res.json({ status: 'ok', service: 'crm-service' }));

app.get('/dashboard', async (_req, res, next) => {
  try {
    const stages = ['new_lead', 'warm_lead', 'qualified', 'closed_won', 'renewal_due', 'awaiting_delivery', 'active_customer'];
    const [currentRows, funnelRows, revenueRows] = await Promise.all([
      pool.query(
        `SELECT lifecycle_stage AS stage, COUNT(*)::int AS count,
          COALESCE(SUM(annual_revenue), 0)::text AS "annualRevenue",
          COALESCE(SUM(estimated_value) FILTER (WHERE lifecycle_stage IN ('closed_won', 'awaiting_delivery', 'active_customer', 'renewal_due')), 0)::text AS "pipelineValue"
         FROM customers GROUP BY lifecycle_stage`,
      ),
      pool.query(
      `SELECT stage, COUNT(DISTINCT c.id)::int AS count
       FROM unnest($1::text[]) AS stages(stage)
       LEFT JOIN customers c ON c.lifecycle_stage = stage OR EXISTS (
         SELECT 1 FROM lifecycle_events e WHERE e.customer_id = c.id AND e.to_stage = stage
       ) GROUP BY stage`,
        [stages],
      ),
      pool.query(
        `SELECT industry_code AS "industryCode",
          CASE
            WHEN annual_revenue < 1000000 THEN 'Under $1M'
            WHEN annual_revenue < 5000000 THEN '$1M–$4.99M'
            WHEN annual_revenue < 10000000 THEN '$5M–$9.99M'
            WHEN annual_revenue < 25000000 THEN '$10M–$24.99M'
            WHEN annual_revenue < 100000000 THEN '$25M–$99.99M'
            ELSE '$100M+'
          END AS band,
          COUNT(*)::int AS count, COALESCE(SUM(annual_revenue), 0)::text AS revenue
         FROM customers GROUP BY industry_code, band`,
      ),
    ]);
    const currentByStage = Object.fromEntries(currentRows.rows.map((row) => [row.stage, row]));
    const countByStage = Object.fromEntries(stages.map((stage) => [stage, currentByStage[stage]?.count ?? 0]));
    const funnelByStage = Object.fromEntries(funnelRows.rows.map((row) => [row.stage, row.count]));
    const totalCustomers = currentRows.rows.reduce((sum, row) => sum + row.count, 0);
    const totalAnnualRevenue = currentRows.rows.reduce((sum, row) => sum + Number(row.annualRevenue), 0);
    const pipelineValue = currentRows.rows.reduce((sum, row) => sum + Number(row.pipelineValue), 0);
    res.json({
      countByStage,
      funnelByStage,
      totalCustomers,
      totalAnnualRevenue,
      pipelineValue,
      revenueDistribution: revenueRows.rows,
    });
  } catch (error) {
    next(error);
  }
});

app.get('/events', async (req, res, next) => {
  try {
    const customerId = typeof req.query.customerId === 'string' ? req.query.customerId : undefined;
    const { rows } = await pool.query(
      `SELECT e.id, e.customer_id AS "customerId", c.name AS "customerName", e.department, e.action,
        e.from_stage AS "fromStage", e.to_stage AS "toStage", e.details, e.created_at AS "createdAt"
       FROM lifecycle_events e JOIN customers c ON c.id = e.customer_id
       ${customerId ? 'WHERE e.customer_id = $1' : ''} ORDER BY e.created_at DESC LIMIT 100`,
      customerId ? [customerId] : [],
    );
    res.json({ events: rows });
  } catch (error) {
    next(error);
  }
});

app.get('/notifications', async (_req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT n.event_id AS id, n.customer_id AS "customerId", c.name AS "customerName",
        n.target_department AS "targetDepartment", n.message, n.created_at AS "createdAt", n.read_at AS "readAt"
       FROM automation_notifications n JOIN customers c ON c.id = n.customer_id
       ORDER BY n.created_at DESC LIMIT 30`,
    );
    res.json({ notifications: rows });
  } catch (error) {
    next(error);
  }
});

app.get('/internal/queue/:department', async (req, res, next) => {
  try {
    const stages = queueStages[req.params.department];
    if (!stages) return res.status(404).json({ error: 'Unknown department' });
    const limit = Number(req.query.limit ?? 50);
    const offset = Number(req.query.offset ?? 0);
    const search = typeof req.query.search === 'string' ? req.query.search.trim().slice(0, 100) : '';
    if (!Number.isInteger(limit) || limit < 1 || limit > 100 || !Number.isInteger(offset) || offset < 0) {
      return res.status(400).json({ error: 'Queue limit must be 1–100 and offset must be a non-negative integer' });
    }
    const searchPattern = search ? `%${search.replace(/[\\%_]/g, '\\$&')}%` : null;
    const [queueRows, countRows] = await Promise.all([
      pool.query(
        `SELECT id, name, company, email, lifecycle_stage AS "lifecycleStage", campaign,
          estimated_value AS "estimatedValue", industry_code AS "industryCode",
          annual_revenue AS "annualRevenue", updated_at AS "updatedAt"
         FROM customers
         WHERE lifecycle_stage = ANY($1::text[])
           AND ($4::text IS NULL OR name ILIKE $4 ESCAPE '\\' OR company ILIKE $4 ESCAPE '\\' OR email ILIKE $4 ESCAPE '\\')
         ORDER BY updated_at ASC, id ASC LIMIT $2 OFFSET $3`,
        [stages, limit, offset, searchPattern],
      ),
      pool.query(
        `SELECT COUNT(*)::int AS total FROM customers
         WHERE lifecycle_stage = ANY($1::text[])
           AND ($2::text IS NULL OR name ILIKE $2 ESCAPE '\\' OR company ILIKE $2 ESCAPE '\\' OR email ILIKE $2 ESCAPE '\\')`,
        [stages, searchPattern],
      ),
    ]);
    res.json({ department: req.params.department, customers: queueRows.rows, total: countRows.rows[0].total, limit, offset });
  } catch (error) {
    next(error);
  }
});

app.post('/internal/workflow', async (req, res, next) => {
  const { department, action, customerId, name, company = '', email, campaign = '', estimatedValue = 0 } = req.body ?? {};
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    if (action === 'capture_lead' && department === 'marketing') {
      if (typeof name !== 'string' || typeof email !== 'string' || !name.trim() || !/^\S+@\S+\.\S+$/.test(email)) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'A name and valid email are required to capture a lead' });
      }
      const { rows } = await client.query(
        `INSERT INTO customers (name, company, email, lifecycle_stage, campaign, estimated_value)
         VALUES ($1, $2, $3, 'new_lead', $4, $5)
         RETURNING id, name, company, email, lifecycle_stage AS "lifecycleStage", campaign, estimated_value AS "estimatedValue", updated_at AS "updatedAt"`,
        [name.trim(), String(company).trim(), email.trim().toLowerCase(), String(campaign).trim(), Math.max(0, Number(estimatedValue) || 0)],
      );
      const customer = rows[0];
      const { rows: eventRows } = await client.query(
        `INSERT INTO lifecycle_events (customer_id, department, action, to_stage, details) VALUES ($1, $2, $3, $4, $5) RETURNING id`,
        [customer.id, department, action, customer.lifecycleStage, JSON.stringify({ campaign: customer.campaign })],
      );
      await client.query(
        'INSERT INTO workflow_outbox (event_id, payload) VALUES ($1, $2)',
        [eventRows[0].id, JSON.stringify({ customerId: customer.id, name: customer.name, toStage: customer.lifecycleStage, action })],
      );
      await client.query('COMMIT');
      return res.status(201).json({ customer });
    }

    const transition = transitions[action];
    if (!transition || !customerId || typeof customerId !== 'string') {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Unsupported action or missing customerId' });
    }
    if (transition.department !== department) {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: 'Action is not available to this department' });
    }
    const { rows: currentRows } = await client.query('SELECT * FROM customers WHERE id = $1 FOR UPDATE', [customerId]);
    const current = currentRows[0];
    if (!current) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Customer not found' });
    }
    if (!transition.from.includes(current.lifecycle_stage)) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: `Cannot perform ${action} while customer is ${current.lifecycle_stage}` });
    }
    await client.query('UPDATE customers SET lifecycle_stage = $1, updated_at = NOW() WHERE id = $2', [transition.to, customerId]);
    if (action === 'create_order') {
      await client.query('INSERT INTO orders (customer_id, status, amount) VALUES ($1, $2, $3)', [customerId, 'in_fulfillment', current.estimated_value]);
    }
    if (action === 'mark_delivered') {
      await client.query("UPDATE orders SET status = 'delivered' WHERE customer_id = $1 AND status = 'in_fulfillment'", [customerId]);
    }
    const { rows: updatedRows } = await client.query(
      `UPDATE customers SET updated_at = NOW() WHERE id = $1
       RETURNING id, name, company, email, lifecycle_stage AS "lifecycleStage", campaign, estimated_value AS "estimatedValue", updated_at AS "updatedAt"`,
      [customerId],
    );
    const { rows: eventRows } = await client.query(
      `INSERT INTO lifecycle_events (customer_id, department, action, from_stage, to_stage, details) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
      [customerId, department, action, current.lifecycle_stage, transition.to, JSON.stringify({ note: req.body.note ?? '' })],
    );
    await client.query(
      'INSERT INTO workflow_outbox (event_id, payload) VALUES ($1, $2)',
      [eventRows[0].id, JSON.stringify({ customerId, name: current.name, toStage: transition.to, action })],
    );
    await client.query('COMMIT');
    return res.json({ customer: updatedRows[0] });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    next(error);
  } finally {
    client.release();
  }
});

app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
  console.error(error);
  const message = error instanceof Error ? error.message : 'Unexpected server error';
  const status = message.includes('duplicate key') ? 409 : 500;
  res.status(status).json({ error: status === 409 ? 'A customer with this email already exists' : 'CRM service error' });
});

async function start(): Promise<void> {
  await initializeDatabase();
  app.listen(port, () => console.log(`crm-service listening on ${port}`));
}

start().catch((error) => {
  console.error('CRM service failed to start', error);
  process.exit(1);
});
