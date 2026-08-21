/**
 * ルールベースの重要度判定。純関数のみ。
 * LLM 判定（Phase 3）はこの後段に足す想定で、article_scores の llm_reason 列を空けてある。
 */
import type { Importance } from '../domain/article.js';
import {
  IMPORTANCE_THRESHOLDS,
  SCORE_RULES,
  SCORING_DESCRIPTION_CHARS,
  type ScoreRule,
} from '../config/scoring.js';

export type ScorableArticle = {
  title: string;
  description?: string | null;
  categories?: string[];
};

export type ScoreResult = {
  score: number;
  importance: Importance;
  matchedLabels: string[];
};

function scoringText(article: ScorableArticle): string {
  const description = (article.description ?? '').slice(0, SCORING_DESCRIPTION_CHARS);
  const categories = (article.categories ?? []).join(' ');
  return [article.title, description, categories].join('\n');
}

export function toImportance(score: number): Importance {
  if (score >= IMPORTANCE_THRESHOLDS.A) return 'A';
  if (score >= IMPORTANCE_THRESHOLDS.B) return 'B';
  return 'C';
}

/**
 * 記事へルールを適用してスコアと importance を返す。
 * 同じルールが複数回一致しても加点は1回だけ（連呼による水増しを防ぐ）。
 */
export function scoreArticle(article: ScorableArticle, rules: ScoreRule[] = SCORE_RULES): ScoreResult {
  const text = scoringText(article);

  let score = 0;
  const matchedLabels: string[] = [];

  for (const rule of rules) {
    if (!rule.pattern.test(text)) continue;
    score += rule.points;
    matchedLabels.push(rule.label);
  }

  return { score, importance: toImportance(score), matchedLabels };
}

export const IMPORTANCE_EMOJI: Record<Importance, string> = {
  A: ':fire:',
  B: ':large_yellow_circle:',
  C: ':white_circle:',
};
