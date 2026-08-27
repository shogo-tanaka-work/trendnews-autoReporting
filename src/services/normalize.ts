/**
 * Collector が返す RawItem を共通形式 NewArticle へ変換する。純関数のみ。
 */
import type { NewArticle, RawItem } from '../domain/article.js';

const DESCRIPTION_MAX_CHARS = 400;
const TITLE_MAX_CHARS = 300;

/** 計測用パラメータを落として重複判定を安定させる */
const TRACKING_PARAM_PREFIXES = ['utm_', 'mc_', 'fbclid', 'gclid', 'ref_src'];

export function normalizeUrl(input: string): string | null {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    return null;
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;

  for (const key of [...url.searchParams.keys()]) {
    if (TRACKING_PARAM_PREFIXES.some((prefix) => key.toLowerCase().startsWith(prefix))) {
      url.searchParams.delete(key);
    }
  }
  url.hash = '';

  return url.toString();
}

/** RSS の description は HTML 片であることが多いのでタグを落とす */
export function stripHtml(input: string): string {
  return input
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

export function truncate(input: string, max: number): string {
  return input.length <= max ? input : `${input.slice(0, max - 1)}…`;
}

/** 日付として解釈できないものは null にして、published_at の欠損を許容する */
export function toIsoDate(input: string | undefined | null): string | null {
  if (!input) return null;
  const date = new Date(input);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

/**
 * URL とタイトルが取れない項目は保存する価値がないので null を返し、呼び出し側で捨てる。
 */
export function toNewArticle(sourceId: string, item: RawItem, fetchedAt: string): NewArticle | null {
  const url = normalizeUrl(item.url);
  if (!url) return null;

  const title = truncate(stripHtml(item.title ?? ''), TITLE_MAX_CHARS);
  if (title.length === 0) return null;

  const rawDescription = item.description ? stripHtml(item.description) : '';
  const description = rawDescription.length > 0 ? truncate(rawDescription, DESCRIPTION_MAX_CHARS) : null;

  const externalId = item.externalId.trim().length > 0 ? item.externalId.trim() : url;

  return {
    sourceId,
    externalId,
    title,
    url,
    rank: typeof item.rank === 'number' && Number.isFinite(item.rank) ? item.rank : null,
    description,
    publishedAt: toIsoDate(item.publishedAt),
    fetchedAt,
    categories: (item.categories ?? []).map((c) => c.trim()).filter((c) => c.length > 0),
  };
}

/** 同一バッチ内で externalId が重複するものを落とす（フィード側の重複対策） */
export function dedupeByExternalId(articles: NewArticle[]): NewArticle[] {
  const seen = new Set<string>();
  const result: NewArticle[] = [];

  for (const article of articles) {
    const identity = `${article.sourceId}\u0000${article.externalId}`;
    if (seen.has(identity)) continue;
    seen.add(identity);
    result.push(article);
  }

  return result;
}
