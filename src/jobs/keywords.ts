/**
 * 追いかけるキーワードの検索トレンド通知ジョブ。tech-radar-keywords.service から実行する。
 *
 *   node dist/jobs/keywords.js
 */
import { createContext } from '../context.js';
import { slackChannelFor } from '../lib/env.js';
import { logger, toErrorMessage } from '../lib/logger.js';
import { collectKeywordTrends } from '../services/keywords.js';

async function main(): Promise<number> {
  const context = createContext();

  try {
    if (!context.env.SERPAPI_API_KEY) {
      logger.warn('SERPAPI_API_KEY が未設定のためスキップします');
      return 0;
    }

    await collectKeywordTrends(context.collectDeps, slackChannelFor('SLACK_CHANNEL_NETA_WEEKLY'));
    return 0;
  } finally {
    context.close();
  }
}

main()
  .then((code) => process.exit(code))
  .catch((err: unknown) => {
    logger.error('キーワードジョブが異常終了しました', { error: toErrorMessage(err) });
    process.exit(1);
  });
