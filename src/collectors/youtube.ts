/**
 * YouTube Collector。
 *
 * channels.list で uploads playlist を引き、playlistItems.list で新着を取る（要件 6.4）。
 * search.list による全体検索は quota 効率とノイズの観点から使わない。
 *
 * @see https://developers.google.com/youtube/v3/docs/channels
 * @see https://developers.google.com/youtube/v3/docs/playlistItems/list
 */
import { z } from 'zod';
import type { RawItem } from '../domain/article.js';
import type { YoutubeSourceConfig } from '../domain/source.js';
import { httpGetJson } from '../lib/http.js';
import type { Collector } from './types.js';

const API_BASE = 'https://www.googleapis.com/youtube/v3';
const MAX_RESULTS = 5;
const DESCRIPTION_MAX_CHARS = 400;

const ChannelListSchema = z.object({
  items: z
    .array(
      z.object({
        id: z.string(),
        contentDetails: z.object({
          relatedPlaylists: z.object({ uploads: z.string() }),
        }),
      })
    )
    .optional(),
});

const PlaylistItemsSchema = z.object({
  items: z
    .array(
      z.object({
        snippet: z.object({
          title: z.string(),
          description: z.string().optional(),
          publishedAt: z.string().optional(),
          channelTitle: z.string().optional(),
          resourceId: z.object({ videoId: z.string() }),
        }),
      })
    )
    .optional(),
});

export class YoutubeCollector implements Collector<YoutubeSourceConfig> {
  /** handle → uploads playlist の解決結果を1回の実行内で使い回し、quota を節約する */
  private readonly uploadsCache = new Map<string, string>();

  constructor(private readonly apiKey: string) {}

  private buildUrl(path: string, params: Record<string, string>): string {
    const url = new URL(`${API_BASE}/${path}`);
    for (const [name, value] of Object.entries(params)) url.searchParams.set(name, value);
    url.searchParams.set('key', this.apiKey);
    return url.toString();
  }

  private async resolveUploadsPlaylistId(channelRef: string): Promise<string> {
    const cached = this.uploadsCache.get(channelRef);
    if (cached) return cached;

    const params: Record<string, string> = { part: 'contentDetails' };
    if (channelRef.startsWith('@')) params.forHandle = channelRef;
    else params.id = channelRef;

    const payload = await httpGetJson(this.buildUrl('channels', params), {
      label: `YouTube channels ${channelRef}`,
    });

    const parsed = ChannelListSchema.safeParse(payload);
    if (!parsed.success) {
      throw new Error(`YouTube channels.list のレスポンス形式が想定と異なります (${channelRef})`);
    }

    const uploads = parsed.data.items?.[0]?.contentDetails.relatedPlaylists.uploads;
    if (!uploads) {
      throw new Error(`YouTube チャンネルが見つかりません (${channelRef})`);
    }

    this.uploadsCache.set(channelRef, uploads);
    return uploads;
  }

  async collect(source: YoutubeSourceConfig): Promise<RawItem[]> {
    const playlistId = await this.resolveUploadsPlaylistId(source.channelRef);

    const payload = await httpGetJson(
      this.buildUrl('playlistItems', {
        part: 'snippet',
        playlistId,
        maxResults: String(MAX_RESULTS),
      }),
      { label: `YouTube playlistItems ${source.name}` }
    );

    const parsed = PlaylistItemsSchema.safeParse(payload);
    if (!parsed.success) {
      throw new Error(`YouTube playlistItems.list のレスポンス形式が想定と異なります (${source.name})`);
    }

    return (parsed.data.items ?? []).map((item, index) => {
      const videoId = item.snippet.resourceId.videoId;

      return {
        externalId: videoId,
        title: item.snippet.title,
        url: `https://www.youtube.com/watch?v=${videoId}`,
        // uploads playlist は新着順に返るため、その並びを順位として扱う
        rank: index + 1,
        description: (item.snippet.description ?? '').slice(0, DESCRIPTION_MAX_CHARS),
        publishedAt: item.snippet.publishedAt,
        author: item.snippet.channelTitle,
        categories: ['youtube', source.name],
      } satisfies RawItem;
    });
  }
}
