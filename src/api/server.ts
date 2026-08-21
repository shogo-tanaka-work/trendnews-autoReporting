/**
 * Node.js 向けエントリ。Node 依存（serve / signal handling）はこのファイルだけに置く。
 */
import { serve } from '@hono/node-server';
import { createApp } from './app.js';
import { createContext } from '../context.js';
import { logger, toErrorMessage } from '../lib/logger.js';

const context = createContext();
const app = createApp(context);

// 既定で 127.0.0.1 のみに bind する。外部公開する場合は前段で認証を掛けること。
const server = serve(
  { fetch: app.fetch, hostname: context.env.API_HOST, port: context.env.API_PORT },
  (info) => {
    logger.info('API を起動しました', {
      host: context.env.API_HOST,
      port: info.port,
      adminApi: context.env.ADMIN_TOKEN ? 'enabled' : 'disabled',
    });
  }
);

function shutdown(signal: string): void {
  logger.info('シャットダウンします', { signal });
  server.close(() => {
    context.close();
    process.exit(0);
  });
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('unhandledRejection', (reason: unknown) => {
  logger.error('未処理の Promise 拒否を検出しました', { error: toErrorMessage(reason) });
});
