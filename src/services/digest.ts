/**
 * 昇格台帳（archive/YYYY/MM/YYYY-MM-DD.md）の本文生成。純関数のみ。
 *
 * Slack は「気づく」ための入口で、掘る対象を選ぶのはこちら。
 * チェックを付けた行を picks/ へ切り出し、発信運用側から参照する。
 */
import type { NotifiableArticle } from '../notifiers/blocks/articles.js';

export type DigestStats = {
  /** 収集した生の件数 */
  fetched: number;
  /** 重複排除後に新規保存された件数 */
  newCount: number;
};

export type DigestInput = {
  /** JST の YYYY-MM-DD */
  date: string;
  label: string;
  articles: NotifiableArticle[];
  stats: DigestStats;
};

function renderEntry(article: NotifiableArticle, index: number): string {
  const tags = article.tags && article.tags.length > 0 ? article.tags.join(' / ') : 'タグなし';
  const score = article.score === undefined ? '—' : article.score.toFixed(2);
  const sources = article.sourceNames?.join(' ＋ ') ?? '';
  const detail = article.detail ? `（${article.detail}）` : '';

  return [
    `- [ ] **${index + 1}. ${article.title}**`,
    `  - score \`${score}\` ｜ ${tags}`,
    `  - ${article.url}`,
    `  - ${sources}${detail}`,
  ].join('\n');
}

export function renderDigest(input: DigestInput): string {
  const header = [
    `# ${input.label} ${input.date}`,
    '',
    `収集 ${input.stats.fetched} 件 → 新規 ${input.stats.newCount} 件 → 通知 ${input.articles.length} 件`,
    '',
    'チェックを付けたものが昇格候補。`picks/` へ移して発信運用から参照する。',
    '',
    '',
  ].join('\n');

  if (input.articles.length === 0) return `${header}（通知対象なし）\n`;

  return `${header}${input.articles.map(renderEntry).join('\n')}\n`;
}
