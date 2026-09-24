/**
 * キーワードの検索トレンドの集計。純関数のみ。
 */
import type { RisingQuery, TimelinePoint } from '../collectors/google-trends-keywords.js';

const WEEK = 7;

export type KeywordTrend = {
  keyword: string;
  group: string;
  /** 直近7日の平均（同じリクエスト内の相対値） */
  recentAverage: number;
  /**
   * 前週比（%）。前週がゼロで今週だけ出てきたときは 'new'、
   * どちらもゼロ（検索が少なすぎて出ない）か日数が足りないときは null。
   */
  changePct: number | 'new' | null;
  risingQueries: RisingQuery[];
  /** 関連クエリだけ取得に失敗した（推移は出せている） */
  risingError: boolean;
  /** 推移の取得に失敗した場合の理由。部分的な失敗でも他の語は出す */
  error: string | null;
};

function average(values: number[]): number {
  return values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length;
}

/**
 * 直近7日と、その前の7日の平均を比べる。
 * 値はその語の期間内最大を 100 とした相対値だが、同じ語の中の比なので影響しない。
 */
export function weekOverWeek(points: TimelinePoint[]): { recentAverage: number; changePct: KeywordTrend['changePct'] } {
  const sorted = [...points].sort((a, b) => a.timestamp - b.timestamp);
  if (sorted.length < WEEK * 2) return { recentAverage: average(sorted.map((p) => p.value)), changePct: null };

  const recent = average(sorted.slice(-WEEK).map((p) => p.value));
  const previous = average(sorted.slice(-WEEK * 2, -WEEK).map((p) => p.value));

  if (previous === 0) return { recentAverage: recent, changePct: recent > 0 ? 'new' : null };

  return { recentAverage: recent, changePct: Math.round(((recent - previous) / previous) * 100) };
}

/** 通知に載せるべき動きがあるか。前週比が閾値以上か、急上昇の関連クエリがある */
export function isNotable(trend: KeywordTrend, thresholdPct: number): boolean {
  if (trend.error) return false;
  if (trend.risingQueries.length > 0) return true;
  if (trend.changePct === 'new') return true;
  return trend.changePct !== null && Math.abs(trend.changePct) >= thresholdPct;
}

/** 動きの大きい順。新出 → 変化率の絶対値 → 関連クエリの数 */
export function byMovement(a: KeywordTrend, b: KeywordTrend): number {
  const magnitude = (trend: KeywordTrend): number =>
    trend.changePct === 'new' ? Number.MAX_SAFE_INTEGER : Math.abs(trend.changePct ?? 0);

  return magnitude(b) - magnitude(a) || b.risingQueries.length - a.risingQueries.length;
}

export function formatChange(changePct: KeywordTrend['changePct']): string {
  if (changePct === 'new') return '新出';
  if (changePct === null) return 'データ不足';
  if (changePct > 0) return `+${changePct}%`;
  return `${changePct}%`;
}

/** 昇格台帳（archive/）用の Markdown。全キーワードを残す */
export function renderKeywordDigest(date: string, trends: KeywordTrend[]): string {
  const lines = [`# キーワードの動き ${date}`, '', '前週比は直近7日と前の7日の平均の比較（Google Trends、JP）。', ''];

  const groups = [...new Set(trends.map((trend) => trend.group))];
  for (const group of groups) {
    lines.push(`## ${group}`, '');
    for (const trend of trends.filter((t) => t.group === group)) {
      const status = trend.error ? `取得失敗（${trend.error}）` : formatChange(trend.changePct);
      lines.push(`- [ ] **${trend.keyword}** ${status}`);
      for (const rising of trend.risingQueries) lines.push(`  - ${rising.query}（${rising.value}）`);
    }
    lines.push('');
  }

  return `${lines.join('\n').trimEnd()}\n`;
}
