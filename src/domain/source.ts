/**
 * 情報源とカテゴリの型定義。実データは config/categories.ts に置く。
 */
import type { SourceType } from './article.js';

type SourceBase = {
  /** DB の primary key。安定した slug を手で付ける */
  id: string;
  name: string;
  emoji?: string;
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

export type SourceConfig = RssSourceConfig | GithubSourceConfig | YoutubeSourceConfig;

export type CategoryConfig = {
  key: string;
  label: string;
  /** Slack チャンネル ID を保持する環境変数名 */
  channelEnvKey: string;
  /** systemd timer の OnCalendar 式（Asia/Tokyo） */
  schedule: string;
  /**
   * ルールベーススコアで絞り込むか。
   * 技術系カテゴリのみ true。既存カテゴリは全件通知のまま。
   */
  useScoring: boolean;
  /** useScoring 時、この点数未満の記事は通知しない */
  minScore?: number;
  /** 1ソースあたりの通知上限 */
  maxPerSource?: number;
  sources: SourceConfig[];
};

export function sourceUrlOf(source: SourceConfig): string {
  switch (source.type) {
    case 'rss':
      return source.url;
    case 'github':
      return `https://github.com/${source.repo}/releases`;
    case 'youtube':
      return source.channelRef.startsWith('@')
        ? `https://www.youtube.com/${source.channelRef}`
        : `https://www.youtube.com/channel/${source.channelRef}`;
  }
}

export function sourceTypeOf(source: SourceConfig): SourceType {
  return source.type;
}
