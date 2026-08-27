/**
 * 発信の4本柱。トレンド発掘の一次スクリーニングはニュース分類ではなくこの軸で切る。
 *
 * 目的が「発信に繋がるか」なので、技術的な重さを測る config/scoring.ts とは別物。
 * 判定に使うのは記事のタイトルと短い説明だけで、本文は取りに行かない。
 */

export type Pillar = {
  name: string;
  patterns: RegExp[];
};

export const PILLARS: Pillar[] = [
  {
    name: 'AIエンジニアリング',
    patterns: [
      /\bAI\b/i,
      /LLM/i,
      /Claude/i,
      /GPT|OpenAI/i,
      /Gemini/i,
      /Anthropic/i,
      /エージェント|agent/i,
      /MCP\b/i,
      /RAG\b/i,
      /プロンプト|prompt/i,
      /Copilot/i,
      /Cursor/i,
      /生成AI/,
      /機械学習|machine learning|deep learning/i,
    ],
  },
  {
    name: '業務',
    patterns: [
      /業務|自動化|効率化|生産性/,
      /automation|workflow/i,
      /SaaS/i,
      /DX\b/,
      /社内/,
      /Excel|スプレッドシート|Notion|Slack/i,
      /ノーコード|no-?code/i,
      /RPA/i,
    ],
  },
  {
    name: '組織',
    patterns: [
      /組織|チーム|マネジメント|マネージャ|評価制度|育成|採用|人事/,
      /culture|management|hiring/i,
      /リモートワーク|働き方/,
      /エンジニアリングマネージャ|EM\b/,
    ],
  },
  {
    name: 'キャリア',
    patterns: [
      /キャリア|転職|副業|年収|給与|学習|独学|資格/,
      /career|salary|junior|senior/i,
      /未経験|新卒|ロードマップ/,
    ],
  },
];

/**
 * 該当した柱を全部返す。どれにも当たらなければ空配列（＝発信には遠い）。
 *
 * 旧実装にあった「モデル」「推論」「運用」「フリーランス」は外している。
 * 前3つは一般語すぎてほぼ全件が AIエンジニアリング／業務に当たってしまい、
 * フリーランスは 2026-08 に会社員へ戻ったため対象外になった。
 */
export function tagPillars(text: string): string[] {
  return PILLARS.filter((pillar) => pillar.patterns.some((pattern) => pattern.test(text))).map(
    (pillar) => pillar.name
  );
}
