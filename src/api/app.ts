/**
 * Hono app の組み立て。Node.js 固有処理は server.ts 側に置く。
 * 将来 Workers へ移す際は `export default { fetch: app.fetch, scheduled }` を足すだけにする。
 */
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import type { AppContext } from '../context.js';
import { logger, toErrorMessage } from '../lib/logger.js';
import { adminRoutes } from './routes/admin.js';
import { articleRoutes } from './routes/articles.js';
import { healthRoutes } from './routes/health.js';
import { sourceRoutes } from './routes/sources.js';

export function createApp(context: AppContext): Hono {
  const app = new Hono();

  app.onError((err, c) => {
    // 認証失敗などの意図した HTTP エラーは、そのままのステータスで返す
    if (err instanceof HTTPException) return err.getResponse();

    logger.error('API でエラーが発生しました', {
      path: c.req.path,
      error: toErrorMessage(err),
    });
    return c.json({ error: 'internal server error' }, 500);
  });

  app.route('/', healthRoutes());
  app.route('/', articleRoutes(context.repos.articles));
  app.route('/', sourceRoutes(context.repos.sources));
  app.route('/', adminRoutes(context.collectDeps, context.env.ADMIN_TOKEN));

  app.notFound((c) => c.json({ error: 'not found' }, 404));

  return app;
}
