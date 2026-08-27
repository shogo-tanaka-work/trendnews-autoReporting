import { Hono } from 'hono';
import { CATEGORIES } from '../../config/categories.js';
import type { SourceRepository } from '../../db/repositories/types.js';

export function sourceRoutes(sources: SourceRepository): Hono {
  const app = new Hono();

  app.get('/sources', async (c) => {
    const rows = await sources.list();
    return c.json({ count: rows.length, sources: rows });
  });

  app.get('/categories', (c) =>
    c.json({
      categories: CATEGORIES.map((category) => ({
        key: category.key,
        label: category.label,
        schedule: category.schedule,
        selector: category.selector ?? 'per_source',
        maxPerNotification: category.maxPerNotification ?? null,
        sourceCount: category.sources.length,
      })),
    })
  );

  return app;
}
