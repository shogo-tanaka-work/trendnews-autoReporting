/**
 * ランキング型 Collector。provider ごとの取得を束ねる。
 *
 * 鍵が要る provider は、鍵が未設定なら空配列を返して黙って外れる。
 * 例外にすると鍵を用意するまで毎回 job が partial になり、本当の障害が埋もれるため。
 * ただし何が外れたかは分かる必要があるので warn を残す。
 */
import type { RawItem } from '../../domain/article.js';
import type { RankingSourceConfig } from '../../domain/source.js';
import { logger } from '../../lib/logger.js';
import type { Collector } from '../types.js';
import {
  fetchGithubTrending,
  fetchGoogleTrends,
  fetchHackerNews,
  fetchQiita,
  fetchYoutubeTrending,
  fetchZenn,
} from './api-providers.js';
import { fetchHatena } from './hatena.js';
import { DEFAULT_RANKING_LIMIT, toRawItems, type RankedEntry, type RankingCredentials } from './types.js';

export class RankingCollector implements Collector<RankingSourceConfig> {
  constructor(
    private readonly credentials: RankingCredentials,
    private readonly now: () => Date
  ) {}

  /** 鍵が無い provider を飛ばす。戻り値が null なら「収集せず正常終了」 */
  private missingCredential(source: RankingSourceConfig): string | null {
    if (source.provider === 'youtube_trending' && !this.credentials.youtubeApiKey) {
      return 'YOUTUBE_API_KEY';
    }
    if (source.provider === 'google_trends' && !this.credentials.serpApiKey) {
      return 'SERPAPI_API_KEY';
    }
    return null;
  }

  private async fetchEntries(source: RankingSourceConfig, limit: number): Promise<RankedEntry[]> {
    const now = this.now();

    switch (source.provider) {
      case 'hatena':
        return fetchHatena();
      case 'hackernews':
        return fetchHackerNews(limit, now);
      case 'qiita':
        return fetchQiita(limit, now);
      case 'zenn':
        return fetchZenn(limit);
      case 'github_trending':
        return fetchGithubTrending(limit, now, this.credentials.githubToken);
      case 'youtube_trending':
        return fetchYoutubeTrending(limit, this.credentials.youtubeApiKey as string);
      case 'google_trends':
        return fetchGoogleTrends(limit, this.credentials.serpApiKey as string);
    }
  }

  async collect(source: RankingSourceConfig): Promise<RawItem[]> {
    const missing = this.missingCredential(source);
    if (missing) {
      logger.warn('APIキー未設定のため情報源をスキップします', { source: source.id, envKey: missing });
      return [];
    }

    const limit = source.limit ?? DEFAULT_RANKING_LIMIT;

    return toRawItems(await this.fetchEntries(source, limit), limit);
  }
}
