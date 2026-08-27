/**
 * RSS / Atom Collector。
 *
 * rss-parser の parseURL ではなく httpGet + parseString を使い、
 * timeout / retry / User-Agent を lib/http.ts へ一本化する。
 */
import Parser from 'rss-parser';
import type { RawItem } from '../domain/article.js';
import type { RssSourceConfig } from '../domain/source.js';
import { httpGet } from '../lib/http.js';
import type { Collector } from './types.js';

const parser = new Parser();

const ACCEPT = 'application/rss+xml, application/atom+xml, application/xml;q=0.9, text/xml;q=0.8, */*;q=0.5';

/**
 * フィードによって category / guid が文字列ではなくオブジェクト（属性付きの XML ノード）で
 * 返ることがある。String() へ素通しすると例外になるため、安全に文字列だけを取り出す。
 */
function toPlainString(value: unknown): string | null {
  if (typeof value === 'string') return value;
  if (value === null || typeof value !== 'object') return null;

  const record = value as Record<string, unknown>;
  for (const candidate of [record._, record['#text'], record.term, record.name]) {
    if (typeof candidate === 'string') return candidate;
  }

  return null;
}

function matchesCategoryFilter(itemCategories: string[], include: string[] | undefined): boolean {
  if (!include || include.length === 0) return true;
  const lowered = itemCategories.map((c) => c.toLowerCase());
  return include.some((wanted) => lowered.includes(wanted.toLowerCase()));
}

export class RssCollector implements Collector<RssSourceConfig> {
  async collect(source: RssSourceConfig): Promise<RawItem[]> {
    const res = await httpGet(source.url, {
      headers: { Accept: ACCEPT },
      label: `RSS ${source.name}`,
    });

    const feed = await parser.parseString(await res.text());

    const items: RawItem[] = [];

    for (const item of feed.items) {
      const url = item.link ?? '';
      if (url.length === 0) continue;

      const categories = (item.categories ?? [])
        .map((c: unknown) => toPlainString(c))
        .filter((c): c is string => c !== null);
      if (!matchesCategoryFilter(categories, source.includeCategories)) continue;

      items.push({
        externalId: toPlainString(item.guid) ?? url,
        title: item.title ?? '(タイトルなし)',
        url,
        // フィードの掲載順をそのまま順位として扱う（多くのフィードは新着・人気順で並ぶ）
        rank: items.length + 1,
        description: item.contentSnippet ?? item.content ?? item.summary,
        publishedAt: item.isoDate ?? item.pubDate,
        author: item.creator,
        categories,
      });
    }

    return items;
  }
}
