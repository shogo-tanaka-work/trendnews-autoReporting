import { Hono } from 'hono';
import { z } from 'zod';
import type { ArticleRepository } from '../../db/repositories/types.js';

const QuerySchema = z.object({
  category: z.string().max(64).optional(),
  source: z.string().max(64).optional(),
  importance: z.enum(['A', 'B', 'C']).optional(),
  from: z.string().datetime({ offset: true }).or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).optional(),
  limit: z.coerce.number().int().min(1).max(500).optional(),
});

export function articleRoutes(articles: ArticleRepository): Hono {
  const app = new Hono();

  app.get('/articles', async (c) => {
    const parsed = QuerySchema.safeParse(c.req.query());
    if (!parsed.success) {
      return c.json({ error: 'invalid query', issues: parsed.error.issues }, 400);
    }

    const { category, source, importance, from, limit } = parsed.data;
    const rows = await articles.list({ category, sourceId: source, importance, from, limit });

    return c.json({ count: rows.length, articles: rows });
  });

  app.get('/articles/:id', async (c) => {
    const id = Number(c.req.param('id'));
    if (!Number.isInteger(id) || id <= 0) {
      return c.json({ error: 'invalid id' }, 400);
    }

    const article = await articles.findById(id);
    if (!article) return c.json({ error: 'not found' }, 404);

    return c.json(article);
  });

  return app;
}
