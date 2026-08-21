import { Hono } from 'hono';

export function healthRoutes(): Hono {
  const app = new Hono();

  app.get('/health', (c) => c.json({ status: 'ok', time: new Date().toISOString() }));

  return app;
}
