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

/** 日本語の文字の間だけの空白。Google は「脆弱 性」のように分かち書きして返す */
const SPACE_BETWEEN_JAPANESE = /(?<=[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}ー])\s+(?=[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}ー])/gu;

/** 表示用の表記。日本語の間の空白を詰め、英語の語間は残す */
export function normalizeQuery(query: string): string {
  return query.trim().replace(SPACE_BETWEEN_JAPANESE, '');
}

/** 比較用のキー。大小文字と空白（英語の語間を含む）の違いを無視する */
function matchKey(text: string): string {
  return text.toLowerCase().replace(/\s+/g, '');
}

/** 英字の要素は単語境界で、日本語を含む要素は部分一致で比べる */
const ASCII_TOKEN = /^[\x21-\x7e]+$/;
/** 「AI」のような短い英字の要素は、無関係な語（「aim」など）に紛れやすいので関連の判定に使わない */
const MIN_ASCII_TOKEN_LENGTH = 3;

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * 元の語の要素（空白区切り）のどれかを含むか。
 * 「Cursor Claude Code 比較」に対する「cursor vs claude code」のように、語全体でなく要素で見る。
 * 英字は単語境界で比べ、「RAG」が「storage」に一致しないようにする。
 */
function mentionsKeyword(query: string, keyword: string): boolean {
  const lowerQuery = query.toLowerCase();
  const queryKey = matchKey(query);

  return keyword
    .toLowerCase()
    .split(/\s+/)
    .filter((token) => token !== '')
    .some((token) => {
      if (!ASCII_TOKEN.test(token)) return queryKey.includes(token);
      if (token.length < MIN_ASCII_TOKEN_LENGTH) return false;
      return new RegExp(`(^|[^a-z0-9])${escapeRegExp(token)}($|[^a-z0-9])`).test(lowerQuery);
    });
}

export type RisingFilterOptions = {
  ignored: string[];
  maxPerKeyword: number;
};

/**
 * 急上昇の関連クエリからノイズを除き、1語あたりの件数に切る。純関数。
 *
 * - 除外リストの語を落とす
 * - 2語以上に同時に出たクエリは、元の語と無関係な全体の急上昇（「jev」など）とみなして落とす。
 *   ただし元の語の要素を含むもの（Codex の「codex app server」）は関連が明らかなので残す
 * - 除外は全語を取り終えてから行う。先に件数で切ると、除いた分だけ妥当な語を取りこぼすため
 *
 * 既知の取りこぼし: 元の語を含まない妥当なクエリが近い2語に同時に出ると落ちる
 * （「opencode」が Codex と Claude Code の両方に出た場合など）。
 * 閾値を3語に上げると2語だけに出る無関係語（「how to bake a cake」）が残るため、こちらを許容する。
 * また関連クエリの取得に失敗した語は数に入らないので、失敗が多い回は全体の急上昇が残りやすい。
 *
 * dropped は除外リストの見直し用に「語: クエリ」の組で返す。
 */
export function refineRisingQueries(
  trends: KeywordTrend[],
  options: RisingFilterOptions
): { trends: KeywordTrend[]; dropped: string[] } {
  const ignored = new Set(options.ignored.map(matchKey));

  const normalized = trends.map((trend) => {
    const seen = new Set<string>();
    const queries = trend.risingQueries.flatMap((rising) => {
      const query = normalizeQuery(rising.query);
      const key = matchKey(query);
      // 同じ語の中の重複は1件に数える。2語に出たと誤って数えないため
      if (key === '' || seen.has(key)) return [];
      seen.add(key);
      return [{ ...rising, query }];
    });
    return { trend, queries };
  });

  const keywordsPerQuery = new Map<string, number>();
  for (const { queries } of normalized) {
    for (const { query } of queries) {
      const key = matchKey(query);
      keywordsPerQuery.set(key, (keywordsPerQuery.get(key) ?? 0) + 1);
    }
  }

  const dropped: string[] = [];
  const refined = normalized.map(({ trend, queries }) => {
    const kept = queries.filter(({ query }) => {
      const key = matchKey(query);
      const isShared = (keywordsPerQuery.get(key) ?? 0) >= 2 && !mentionsKeyword(query, trend.keyword);
      const isNoise = ignored.has(key) || isShared;
      if (isNoise) dropped.push(`${trend.keyword}: ${query}`);
      return !isNoise;
    });
    return { ...trend, risingQueries: kept.slice(0, options.maxPerKeyword) };
  });

  return { trends: refined, dropped };
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
