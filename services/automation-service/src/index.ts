import express from 'express';
import pg from 'pg';

const { Pool } = pg;
const app = express();
const port = Number(process.env.PORT ?? 4200);
const pool = new Pool({
  connectionString: process.env.DATABASE_URL ?? 'postgres://crm_app:local_only_change_me@localhost:5432/lifecycle_crm',
});

const destinationByStage: Record<string, string> = {
  new_lead: 'marketing',
  warm_lead: 'inside-sales',
  qualified: 'sales',
  closed_won: 'ordering',
  renewal_due: 'ordering',
  awaiting_delivery: 'delivery',
  active_customer: 'retention',
};

app.get('/health', (_req, res) => res.json({ status: 'ok', service: 'automation-service' }));

let polling = false;
async function processOutbox(): Promise<void> {
  if (polling) return;
  polling = true;
  const client = await pool.connect().catch((error: unknown) => {
    console.error('Automation database connection failed', error);
    return undefined;
  });
  if (!client) {
    polling = false;
    return;
  }
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `SELECT id, event_id, payload FROM workflow_outbox
        WHERE processed_at IS NULL ORDER BY id LIMIT 25 FOR UPDATE SKIP LOCKED`,
    );
    for (const message of rows) {
      const targetDepartment = destinationByStage[message.payload.toStage];
      if (targetDepartment) {
        await client.query(
          `INSERT INTO automation_notifications (event_id, customer_id, target_department, message)
           VALUES ($1, $2, $3, $4) ON CONFLICT (event_id) DO NOTHING`,
          [message.event_id, message.payload.customerId, targetDepartment, `${message.payload.name} entered the ${targetDepartment} queue`],
        );
      }
      await client.query('UPDATE workflow_outbox SET processed_at = NOW() WHERE id = $1', [message.id]);
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    console.error('Automation outbox processing failed', error);
  } finally {
    client.release();
    polling = false;
  }
}

app.listen(port, () => console.log(`automation-service listening on ${port}`));
void processOutbox();
setInterval(() => void processOutbox(), 1500);
