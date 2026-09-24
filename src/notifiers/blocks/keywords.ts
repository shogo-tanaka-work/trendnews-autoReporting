/**
 * キーワードの動きの Block Kit ペイロード生成。純関数のみ。
 *
 * 動いた語だけを本文に載せ、残りは1行にまとめる。全件は昇格台帳に残す。
 */
import type { KnownBlock } from '@slack/web-api';
import { formatJst } from '../../lib/datetime.js';
import { byMovement, formatChange, isNotable, type KeywordTrend } from '../../services/keyword-trend.js';

/** 1語2ブロック程度。Slack の上限 50 ブロックに十分収まる件数 */
const MAX_NOTABLE = 15;

function trendArrow(trend: KeywordTrend): string {
  if (trend.changePct === 'new') return ':new:';
  if (trend.changePct === null) return ':small_blue_diamond:';
  if (trend.changePct > 0) return ':arrow_upper_right:';
  if (trend.changePct < 0) return ':arrow_lower_right:';
  return ':arrow_right:';
}

function exploreUrl(keyword: string): string {
  return `https://trends.google.com/trends/explore?q=${encodeURIComponent(keyword)}&geo=JP`;
}

function trendText(trend: KeywordTrend): string {
  const head = `${trendArrow(trend)} *<${exploreUrl(trend.keyword)}|${trend.keyword}>*  ${formatChange(trend.changePct)}  _${trend.group}_`;
  if (trend.risingQueries.length === 0) return head;

  const rising = trend.risingQueries.map((q) => `${q.query}（${q.value}）`).join(' / ');
  return `${head}\n      急上昇の関連語: ${rising}`;
}

export function buildKeywordMessage(
  trends: KeywordTrend[],
  thresholdPct: number,
  now: Date
): { text: string; blocks: KnownBlock[] } | null {
  if (trends.length === 0) return null;

  const notable = trends.filter((trend) => isNotable(trend, thresholdPct)).sort(byMovement).slice(0, MAX_NOTABLE);
  const notableSet = new Set(notable);
  const quiet = trends.filter((trend) => !trend.error && !notableSet.has(trend));
  const failed = trends.filter((trend) => trend.error);

  const blocks: KnownBlock[] = [
    { type: 'header', text: { type: 'plain_text', text: '📈 キーワードの動き（前週比）', emoji: true } },
    {
      type: 'context',
      elements: [{ type: 'mrkdwn', text: `:clock1: 取得日時: ${formatJst(now.toISOString())}　Google Trends（JP）` }],
    },
    { type: 'divider' },
  ];

  if (notable.length === 0) {
    blocks.push({ type: 'section', text: { type: 'mrkdwn', text: `前週比 ±${thresholdPct}% を超えた語はありません。` } });
  } else {
    for (const trend of notable) {
      blocks.push({ type: 'section', text: { type: 'mrkdwn', text: trendText(trend) } });
    }
  }

  const footer: string[] = [];
  if (quiet.length > 0) footer.push(`大きな変化なし: ${quiet.map((trend) => trend.keyword).join(' / ')}`);
  if (failed.length > 0) footer.push(`:warning: 取得失敗: ${failed.map((trend) => trend.keyword).join(' / ')}`);
  const risingFailed = trends.filter((trend) => trend.risingError).length;
  if (risingFailed > 0) footer.push(`:warning: 関連語の取得失敗: ${risingFailed}語`);
  if (footer.length > 0) {
    blocks.push({ type: 'context', elements: [{ type: 'mrkdwn', text: footer.join('\n') }] });
  }

  return {
    text: `📈 キーワードの動き: ${notable.length}語が前週から動きました`,
    blocks,
  };
}
