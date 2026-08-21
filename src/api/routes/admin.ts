/**
 * 管理用エンドポイント。インターネットへ無認証公開しないこと（要件 15 / 26章）。
 * ADMIN_TOKEN 未設定なら fail closed で 503 を返す。
 */
import { Hono } from 'hono';
import { bearerAuth } from 'hono/bearer-auth';
import { z } from 'zod';
import { CATEGORY_KEYS } from '../../config/categories.js';
import { logger, toErrorMessage } from '../../lib/logger.js';
import { collectAll, collectByKey, type CollectDeps } from '../../services/collect.js';

const BodySchema = z.object({ category: z.string().max(64).optional() });

export function adminRoutes(deps: CollectDeps, adminToken: string | undefined): Hono {
  const app = new Hono();

  if (!adminToken) {
    app.all('/admin/*', (c) =>
      c.json({ error: 'ADMIN_TOKEN が未設定のため管理 API を無効化しています' }, 503)
    );
    return app;
  }

  app.use('/admin/*', bearerAuth({ token: adminToken }));

  // 収集は重い処理なので同時実行させない
  let running = false;

  app.post('/admin/collect', async (c) => {
    const body: unknown = await c.req.json().catch(() => ({}));
    const parsed = BodySchema.safeParse(body);
    if (!parsed.success) return c.json({ error: 'invalid body' }, 400);

    const category = parsed.data.category;
    if (category && !CATEGORY_KEYS.includes(category)) {
      return c.json({ error: 'unknown category', available: CATEGORY_KEYS }, 400);
    }

    if (running) return c.json({ error: '収集ジョブが実行中です' }, 409);
    running = true;

    try {
      const summaries = category
        ? [await collectByKey(deps, category)]
        : await collectAll(deps);

      return c.json({ ok: true, summaries });
    } catch (err) {
      logger.error('管理 API からの収集に失敗しました', { error: toErrorMessage(err) });
      return c.json({ error: '収集に失敗しました' }, 500);
    } finally {
      running = false;
    }
  });

  return app;
}
