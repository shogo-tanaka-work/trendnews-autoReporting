/**
 * 収集ジョブの CLI エントリ。systemd の tech-radar-collect@<category>.service から実行する。
 *
 *   node dist/jobs/collect.js <category|all>
 */
import { CATEGORY_KEYS } from '../config/categories.js';
import { createContext } from '../context.js';
import { logger, toErrorMessage } from '../lib/logger.js';
import { collectAll, collectByKey } from '../services/collect.js';

async function main(): Promise<number> {
  const target = process.argv[2] ?? 'all';

  if (target !== 'all' && !CATEGORY_KEYS.includes(target)) {
    logger.error('未知のカテゴリです', { target, available: CATEGORY_KEYS.join(',') });
    return 1;
  }

  const context = createContext();

  try {
    const summaries =
      target === 'all'
        ? await collectAll(context.collectDeps)
        : [await collectByKey(context.collectDeps, target)];

    const failed = summaries.filter((s) => s.errors.length > 0 && s.fetched === 0);
    return failed.length === summaries.length ? 1 : 0;
  } finally {
    context.close();
  }
}

main()
  .then((code) => process.exit(code))
  .catch((err: unknown) => {
    logger.error('収集ジョブが異常終了しました', { error: toErrorMessage(err) });
    process.exit(1);
  });
