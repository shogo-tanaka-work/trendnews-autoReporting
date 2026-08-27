/**
 * 情報源とカテゴリの型定義。実データは config/categories.ts に置く。
 */
import type { SourceType } from './article.js';

type SourceBase = {
  /** DB の primary key。安定した slug を手で付ける */
  id: string;
  name: string;
  emoji?: string;
  /**
   * ランキング選抜での重み（0〜1）。情報源の信頼度・ノイズの少なさを表す。
   * selector: 'ranking' のカテゴリでのみ使う。未指定は 1（減点しない）。
   */
  weight?: number;
};

export type RssSourceConfig = SourceBase & {
  type: 'rss';
  url: string;
  /**
   * RSS の category 要素での絞り込み。指定時、いずれかに一致する記事だけを採用する。
   * Cloudflare Changelog のようにプロダクト単位で category が付くフィード向け。
   */
  includeCategories?: string[];
};

export type GithubSourceConfig = SourceBase & {
  type: 'github';
  /** owner/repo */
  repo: string;
  includePrerelease?: boolean;
};

export type YoutubeSourceConfig = SourceBase & {
  type: 'youtube';
  /**
   * `UC...` 形式のチャンネル ID、または `@handle`。
   * handle は channels.list(forHandle) で ID へ解決する。
   */
  channelRef: string;
};

/**
 * ランキング型の情報源。「特定の購読先の新着」ではなく「世の中の上位N件」を取る。
 * 取得先ごとに API も並び順の意味も違うため、provider で実装を切り替える。
 */
export type RankingProvider =
  | 'hatena'
  | 'hackernews'
  | 'qiita'
  | 'zenn'
  | 'github_trending'
  | 'youtube_trending'
  | 'google_trends';

export type RankingSourceConfig = SourceBase & {
  type: 'ranking';
  provider: RankingProvider;
  /** 取り込む上位件数。未指定は provider ごとの既定値 */
  limit?: number;
};

export type SourceConfig =
  | RssSourceConfig
  | GithubSourceConfig
  | YoutubeSourceConfig
  | RankingSourceConfig;

/**
 * 通知対象の選び方。
 *
 * - 'per_source': 情報源ごとに束ねて全件を出す。取りこぼしを許さない用途向け。
 * - 'ranking':    情報源内の順位と重みで採点し、カテゴリ全体の上位だけを出す。
 *                 同じ URL が複数の情報源に現れたら加点して束ねる。
 * - 'scoring':    キーワード配点（config/scoring.ts）で minScore 未満を捨てる。
 */
export type SelectorKind = 'per_source' | 'ranking' | 'scoring';

export type CategoryConfig = {
  key: string;
  label: string;
  /** Slack チャンネル ID を保持する環境変数名 */
  channelEnvKey: string;
  /** systemd timer の OnCalendar 式（Asia/Tokyo） */
  schedule: string;
  /** 未指定は 'per_source'（従来の挙動） */
  selector?: SelectorKind;
  /** selector: 'scoring' のとき、この点数未満の記事は通知しない */
  minScore?: number;
  /**
   * 1回の通知に載せる総件数の上限。
   * maxPerSource だけでは情報源を増やすたびに通知量が増えてしまうため、
   * カテゴリ全体の上限をここで押さえる。
   */
  maxPerNotification?: number;
  /** 1情報源あたりの通知上限 */
  maxPerSource?: number;
  sources: SourceConfig[];
};

export function sourceUrlOf(source: SourceConfig): string | null {
  switch (source.type) {
    case 'rss':
      return source.url;
    case 'github':
      return `https://github.com/${source.repo}/releases`;
    case 'youtube':
      return source.channelRef.startsWith('@')
        ? `https://www.youtube.com/${source.channelRef}`
        : `https://www.youtube.com/channel/${source.channelRef}`;
    case 'ranking':
      // ランキングは単一の購読 URL を持たない（provider が複数の口を叩くこともある）
      return null;
  }
}

export function sourceTypeOf(source: SourceConfig): SourceType {
  return source.type;
}
