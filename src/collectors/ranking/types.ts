/**
 * ランキング型 Collector の共通部品。
 *
 * 各 provider は「上位から順に並んだ生データ」を返すことだけを担当し、
 * RawItem への詰め替えはここへ集約する。
 */
import type { RawItem } from '../../domain/article.js';

/** provider ごとの既定取得件数。TK 時代の perSourceLimit を踏襲する */
export const DEFAULT_RANKING_LIMIT = 30;

/** provider が必要とする資格情報。未設定なら該当 provider だけを飛ばす */
export type RankingCredentials = {
  githubToken: string | undefined;
  youtubeApiKey: string | undefined;
  serpApiKey: string | undefined;
};

export type RankedEntry = {
  /** 安定した一意キー。URL が安定しない provider では ID を使う */
  externalId: string;
  title: string;
  url: string;
  /** 注目度の実数（ブックマーク数・star 数など）。表示と説明のためだけに使う */
  metric?: number;
  metricLabel?: string;
  /** 分類・言語・チャンネル名など、記事の性格を表す短い語 */
  context?: string[];
  publishedAt?: string | undefined;
};

/**
 * 並び順をそのまま順位にして RawItem へ変換する。
 * 採点は selector 側の責務なので、ここでは順位を落とさないことだけを保証する。
 */
export function toRawItems(entries: RankedEntry[], limit: number): RawItem[] {
  return entries.slice(0, limit).map((entry, index) => {
    const metric =
      entry.metric === undefined ? [] : [`${entry.metric.toLocaleString('en-US')} ${entry.metricLabel ?? ''}`.trim()];
    const context = entry.context ?? [];

    return {
      externalId: entry.externalId,
      title: entry.title,
      url: entry.url,
      rank: index + 1,
      description: [...metric, ...context].join(' ｜ ') || undefined,
      publishedAt: entry.publishedAt,
      categories: context,
    } satisfies RawItem;
  });
}
