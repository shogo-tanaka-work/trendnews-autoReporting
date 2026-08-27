/**
 * はてなブックマーク ホットエントリ。
 *
 * テクノロジーと世の中・経済の2フィードを合わせ、ブックマーク数の多い順に並べ直す。
 * フィード自体も人気順だが、2つを混ぜる以上は共通の指標で並べ直す必要がある。
 */
import Parser from 'rss-parser';
import { httpGet } from '../../lib/http.js';
import type { RankedEntry } from './types.js';

const FEEDS = [
  { url: 'https://b.hatena.ne.jp/hotentry/it.rss', label: 'テクノロジー' },
  { url: 'https://b.hatena.ne.jp/hotentry/economics.rss', label: '世の中・経済' },
];

type HatenaItem = { bookmarkCount?: string };

const parser = new Parser<Record<string, unknown>, HatenaItem>({
  customFields: { item: [['hatena:bookmarkcount', 'bookmarkCount']] },
});

async function fetchFeed(url: string, label: string): Promise<(RankedEntry & { bookmarks: number })[]> {
  const res = await httpGet(url, { label: `はてブ ${label}` });
  const feed = await parser.parseString(await res.text());

  const entries: (RankedEntry & { bookmarks: number })[] = [];

  for (const item of feed.items) {
    const link = item.link ?? '';
    const title = item.title ?? '';
    if (link.length === 0 || title.length === 0) continue;

    const bookmarks = Number(item.bookmarkCount ?? 0);

    entries.push({
      externalId: link,
      title,
      url: link,
      metric: Number.isFinite(bookmarks) ? bookmarks : 0,
      metricLabel: 'users',
      context: [label],
      publishedAt: item.isoDate ?? item.pubDate,
      bookmarks: Number.isFinite(bookmarks) ? bookmarks : 0,
    });
  }

  return entries;
}

export async function fetchHatena(): Promise<RankedEntry[]> {
  const feeds = await Promise.all(FEEDS.map((feed) => fetchFeed(feed.url, feed.label)));

  return feeds
    .flat()
    .sort((a, b) => b.bookmarks - a.bookmarks)
    .map(({ bookmarks: _bookmarks, ...entry }) => entry);
}
