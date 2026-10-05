import express, { type NextFunction, type Request, type Response } from 'express';

const app = express();
const department = process.env.DEPARTMENT ?? 'marketing';
const port = Number(process.env.PORT ?? 4101);
const crmUrl = process.env.CRM_URL ?? 'http://localhost:4000';
const departmentActions: Record<string, string[]> = {
  marketing: ['capture_lead', 'engage_lead'],
  'inside-sales': ['qualify', 'disqualify'],
  sales: ['close_won', 'close_lost'],
  ordering: ['create_order'],
  delivery: ['mark_delivered'],
  retention: ['start_renewal', 'cross_sell'],
};

app.use(express.json());
app.get('/health', (_req, res) => res.json({ status: 'ok', service: `${department}-service` }));

app.get('/queue', async (req, res, next) => {
  try {
    const target = new URL(`/internal/queue/${department}`, crmUrl);
    for (const [key, value] of Object.entries(req.query)) {
      if (typeof value === 'string') target.searchParams.set(key, value);
    }
    const response = await fetch(target);
    res.status(response.status).json(await response.json());
  } catch (error) {
    next(error);
  }
});

app.post('/actions', async (req, res, next) => {
  const action = req.body?.action;
  if (typeof action !== 'string' || !departmentActions[department]?.includes(action)) {
    return res.status(400).json({ error: `Action is not supported by ${department}` });
  }
  try {
    const response = await fetch(`${crmUrl}/internal/workflow`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ...req.body, department }),
    });
    res.status(response.status).json(await response.json());
  } catch (error) {
    next(error);
  }
});

app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
  console.error(`${department} service error`, error);
  res.status(502).json({ error: 'Unable to reach the CRM service' });
});

app.listen(port, () => console.log(`${department}-service listening on ${port}`));
