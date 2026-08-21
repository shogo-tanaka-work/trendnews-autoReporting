/**
 * Connpass セミナー通知ジョブ。tech-radar-connpass.service から実行する。
 *
 *   node dist/jobs/connpass.js
 */
import { createContext, parseKeywords } from '../context.js';
import { slackChannelFor } from '../lib/env.js';
import { logger, toErrorMessage } from '../lib/logger.js';
import { collectConnpass } from '../services/collect.js';

async function main(): Promise<number> {
  const context = createContext();

  try {
    if (!context.env.CONNPASS_API_KEY) {
      logger.warn('CONNPASS_API_KEY が未設定のためスキップします');
      return 0;
    }

    await collectConnpass(
      context.collectDeps,
      parseKeywords(context.env.CONNPASS_KEYWORDS),
      slackChannelFor('SLACK_CHANNEL_CONNPASS')
    );

    return 0;
  } finally {
    context.close();
  }
}

main()
  .then((code) => process.exit(code))
  .catch((err: unknown) => {
    logger.error('Connpass ジョブが異常終了しました', { error: toErrorMessage(err) });
    process.exit(1);
  });
