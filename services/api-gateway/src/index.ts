import express, { type NextFunction, type Request, type Response } from 'express';

const app = express();
const port = Number(process.env.PORT ?? 8080);
const crmUrl = process.env.CRM_URL ?? 'http://localhost:4000';
const services: Record<string, string> = {
  marketing: process.env.MARKETING_URL ?? 'http://localhost:4101',
  'inside-sales': process.env.INSIDE_SALES_URL ?? 'http://localhost:4102',
  sales: process.env.SALES_URL ?? 'http://localhost:4103',
  ordering: process.env.ORDERING_URL ?? 'http://localhost:4104',
  delivery: process.env.DELIVERY_URL ?? 'http://localhost:4105',
  retention: process.env.RETENTION_URL ?? 'http://localhost:4106',
};

app.use(express.json());
app.get('/health', (_req, res) => res.json({ status: 'ok', service: 'api-gateway' }));

app.use('/api', async (req, res, next) => {
  const [resource, department] = req.path.split('/').filter(Boolean);
  const originalPath = req.originalUrl.split('?')[0];
  const queryString = req.originalUrl.includes('?') ? req.originalUrl.slice(req.originalUrl.indexOf('?')) : '';
  let baseUrl: string;
  let path: string;
  if (resource === 'dashboard' || resource === 'events' || resource === 'notifications') {
    baseUrl = crmUrl;
    path = originalPath.replace(/^\/api/, '');
  } else if (department && resource === 'departments' && services[department]) {
    baseUrl = services[department];
    path = originalPath.replace(/^\/api\/departments\/[^/]+/, '');
    if (!path) path = '/';
  } else if (resource && services[resource]) {
    baseUrl = services[resource];
    path = originalPath.replace(new RegExp(`^/api/${resource}`), '');
    if (!path) path = '/';
  } else {
    return res.status(404).json({ error: 'API route not found' });
  }
  try {
    const target = new URL(path + queryString, baseUrl);
    const headers = new Headers();
    if (req.headers['content-type']) headers.set('content-type', req.headers['content-type']);
    const response = await fetch(target, {
      method: req.method,
      headers,
      body: ['GET', 'HEAD'].includes(req.method) ? undefined : JSON.stringify(req.body ?? {}),
    });
    const contentType = response.headers.get('content-type');
    if (contentType) res.setHeader('content-type', contentType);
    res.status(response.status).send(await response.text());
  } catch (error) {
    next(error);
  }
});

app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
  console.error('API gateway error', error);
  res.status(502).json({ error: 'A downstream service is unavailable' });
});

app.listen(port, () => console.log(`api-gateway listening on ${port}`));
