/**
 * ルールベーススクリーニングの配点。
 *
 * LLM へ送る前に通常のコードで絞り込むための設定。閾値と配点はここだけを編集する。
 * 単語境界での一致にしたいので、パターンは正規表現で持つ。
 */

export type ScoreRule = {
  /** ログと説明用のラベル */
  label: string;
  pattern: RegExp;
  points: number;
};

/** 技術キーワード（何についての情報か） */
export const TOPIC_RULES: ScoreRule[] = [
  { label: 'Agent', pattern: /\bagents?\b/i, points: 5 },
  { label: 'MCP', pattern: /\bmcp\b|model context protocol/i, points: 5 },
  { label: 'Claude', pattern: /\bclaude\b|\banthropic\b/i, points: 5 },
  { label: 'OpenAI', pattern: /\bopenai\b|\bgpt-\d/i, points: 5 },
  { label: 'LangGraph', pattern: /\blanggraph\b/i, points: 4 },
  { label: 'TanStack', pattern: /\btanstack\b/i, points: 4 },
  { label: 'Workers', pattern: /\bworkers?\b(?!\s*compensation)/i, points: 4 },
  { label: 'AWS', pattern: /\baws\b|\bbedrock\b|\blambda\b|\bagentcore\b/i, points: 4 },
  { label: 'React', pattern: /\breact\b/i, points: 4 },
  { label: 'TypeScript', pattern: /\btypescript\b/i, points: 3 },
  { label: 'Hono', pattern: /\bhono\b/i, points: 3 },
  { label: 'D1', pattern: /\bd1\b/i, points: 3 },
  { label: 'R2', pattern: /\br2\b/i, points: 3 },
  { label: 'Durable Objects', pattern: /durable objects?/i, points: 3 },
  { label: 'Vectorize', pattern: /\bvectorize\b/i, points: 3 },
];

/** リリース種別（どれくらい重い変更か） */
export const EVENT_RULES: ScoreRule[] = [
  { label: 'GA', pattern: /\bga\b|generally available/i, points: 5 },
  { label: 'Breaking Change', pattern: /breaking[- ]change/i, points: 5 },
  { label: 'Deprecated', pattern: /\bdeprecat(?:ed|ion)\b|廃止/i, points: 5 },
  { label: 'RFC', pattern: /\brfc\b/i, points: 5 },
  { label: 'Public Beta', pattern: /public beta|open beta/i, points: 4 },
  { label: 'New API', pattern: /new api|新 ?api/i, points: 4 },
  { label: 'Release', pattern: /\brelease[ds]?\b|\blaunch(?:e[sd])?\b|提供開始/i, points: 4 },
];

/** ノイズ（下げたいもの） */
export const NOISE_RULES: ScoreRule[] = [
  { label: 'typo', pattern: /\btypos?\b|誤字/i, points: -5 },
  { label: 'docs only', pattern: /docs?[- ]only|documentation fix/i, points: -5 },
  { label: 'localization', pattern: /\bl10n\b|localization|翻訳/i, points: -4 },
  { label: 'minor fix', pattern: /minor fix|chore\b|bump(?:ed)? version/i, points: -3 },
];

export const SCORE_RULES: ScoreRule[] = [...TOPIC_RULES, ...EVENT_RULES, ...NOISE_RULES];

/** importance の閾値。A: 今見る / B: 週次で見る / C: 無視してよい */
export const IMPORTANCE_THRESHOLDS = {
  A: 9,
  B: 4,
} as const;

/** description のうちスコアリング対象にする長さ（本文全体は使わない） */
export const SCORING_DESCRIPTION_CHARS = 500;
