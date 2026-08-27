/**
 * JSON API を叩くランキング provider 群。
 *
 * いずれも「上位から順に並んだ配列」を返すことだけを保証し、
 * 採点・選抜は services/select-ranking.ts に任せる。
 * レスポンス形式は zod で検証し、想定外の形は例外にして1情報源だけ落とす。
 */
import { z } from 'zod';
import { httpGetJson } from '../../lib/http.js';
import type { RankedEntry } from './types.js';

const DAY_MS = 24 * 60 * 60 * 1000;

/** ISO 日付（YYYY-MM-DD）へ丸める。API の日付フィルタ用 */
function isoDate(at: Date): string {
  return at.toISOString().slice(0, 10);
}

// ── Hacker News（Algolia） ──────────────────────────────────────────────
const HN_MIN_POINTS = 30;

const HnSchema = z.object({
  hits: z
    .array(
      z.object({
        objectID: z.string(),
        title: z.string().nullable().optional(),
        url: z.string().nullable().optional(),
        points: z.number().nullable().optional(),
        num_comments: z.number().nullable().optional(),
        created_at: z.string().nullable().optional(),
      })
    )
    .optional(),
});

export async function fetchHackerNews(limit: number, now: Date): Promise<RankedEntry[]> {
  const since = Math.floor((now.getTime() - DAY_MS) / 1000);
  const url =
    'https://hn.algolia.com/api/v1/search?tags=story' +
    `&numericFilters=created_at_i>${since},points>${HN_MIN_POINTS}` +
    `&hitsPerPage=${limit}`;

  const parsed = HnSchema.safeParse(await httpGetJson(url, { label: 'Hacker News' }));
  if (!parsed.success) throw new Error('Hacker News のレスポンス形式が想定と異なります');

  return (parsed.data.hits ?? [])
    .filter((hit) => hit.title)
    .map((hit) => ({
      externalId: hit.objectID,
      title: hit.title as string,
      // 自己投稿（url なし）はコメントページを充てる
      url: hit.url ?? `https://news.ycombinator.com/item?id=${hit.objectID}`,
      metric: hit.points ?? 0,
      metricLabel: 'points',
      context: [`${hit.num_comments ?? 0} comments`],
      publishedAt: hit.created_at ?? undefined,
    }));
}

// ── Qiita ────────────────────────────────────────────────────────────────
const QiitaSchema = z.array(
  z.object({
    id: z.string(),
    title: z.string(),
    url: z.string(),
    likes_count: z.number().nullable().optional(),
    created_at: z.string().nullable().optional(),
    tags: z.array(z.object({ name: z.string() })).nullable().optional(),
  })
);

export async function fetchQiita(limit: number, now: Date): Promise<RankedEntry[]> {
  // API 側に「人気順」が無いため、直近3日を取ってから LGTM 順へ並べ直す
  const since = isoDate(new Date(now.getTime() - 3 * DAY_MS));
  const query = encodeURIComponent(`created:>=${since}`);
  const url = `https://qiita.com/api/v2/items?page=1&per_page=100&query=${query}`;

  const parsed = QiitaSchema.safeParse(await httpGetJson(url, { label: 'Qiita' }));
  if (!parsed.success) throw new Error('Qiita のレスポンス形式が想定と異なります');

  return [...parsed.data]
    .sort((a, b) => (b.likes_count ?? 0) - (a.likes_count ?? 0))
    .slice(0, limit)
    .map((item) => ({
      externalId: item.id,
      title: item.title,
      url: item.url,
      metric: item.likes_count ?? 0,
      metricLabel: 'LGTM',
      context: (item.tags ?? []).slice(0, 3).map((tag) => tag.name),
      publishedAt: item.created_at ?? undefined,
    }));
}

// ── Zenn（非公式エンドポイント） ─────────────────────────────────────────
const ZennSchema = z.object({
  articles: z
    .array(
      z.object({
        id: z.number(),
        title: z.string(),
        path: z.string(),
        liked_count: z.number().nullable().optional(),
        article_type: z.string().nullable().optional(),
        published_at: z.string().nullable().optional(),
      })
    )
    .optional(),
});

/** 非公式エンドポイント。仕様変更で落ちても他の情報源で縮退できる前提で使う */
export async function fetchZenn(limit: number): Promise<RankedEntry[]> {
  const url = `https://zenn.dev/api/articles?order=daily&count=${limit}`;

  const parsed = ZennSchema.safeParse(await httpGetJson(url, { label: 'Zenn' }));
  if (!parsed.success) throw new Error('Zenn のレスポンス形式が想定と異なります');

  return (parsed.data.articles ?? []).map((article) => ({
    externalId: String(article.id),
    title: article.title,
    url: `https://zenn.dev${article.path}`,
    metric: article.liked_count ?? 0,
    metricLabel: 'likes',
    context: article.article_type ? [article.article_type] : [],
    publishedAt: article.published_at ?? undefined,
  }));
}

// ── GitHub 急上昇（Search API） ──────────────────────────────────────────
const GithubSearchSchema = z.object({
  items: z
    .array(
      z.object({
        id: z.number(),
        full_name: z.string(),
        html_url: z.string(),
        description: z.string().nullable().optional(),
        stargazers_count: z.number().nullable().optional(),
        language: z.string().nullable().optional(),
        topics: z.array(z.string()).nullable().optional(),
        created_at: z.string().nullable().optional(),
      })
    )
    .optional(),
});

/**
 * 直近7日に作られたリポジトリを star 順に取る。
 * GitHub Trending の非公式スクレイプを避け、公式 Search API を使う。
 */
export async function fetchGithubTrending(
  limit: number,
  now: Date,
  token: string | undefined
): Promise<RankedEntry[]> {
  const since = isoDate(new Date(now.getTime() - 7 * DAY_MS));
  const query = encodeURIComponent(`created:>${since} stars:>20`);
  const url = `https://api.github.com/search/repositories?q=${query}&sort=stars&order=desc&per_page=${limit}`;

  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  };
  // 未認証でも叩けるが、token があればレート上限に余裕が出る
  if (token) headers.Authorization = `Bearer ${token}`;

  const parsed = GithubSearchSchema.safeParse(
    await httpGetJson(url, { headers, label: 'GitHub 急上昇' })
  );
  if (!parsed.success) throw new Error('GitHub Search のレスポンス形式が想定と異なります');

  return (parsed.data.items ?? []).map((repo) => {
    const description = repo.description?.trim() ?? '';

    return {
      externalId: String(repo.id),
      title: description.length > 0 ? `${repo.full_name} — ${description}` : repo.full_name,
      url: repo.html_url,
      metric: repo.stargazers_count ?? 0,
      metricLabel: 'stars',
      context: [repo.language, ...(repo.topics ?? []).slice(0, 3)].filter(
        (value): value is string => typeof value === 'string' && value.length > 0
      ),
      publishedAt: repo.created_at ?? undefined,
    };
  });
}

// ── YouTube 急上昇 ───────────────────────────────────────────────────────
/** videoCategoryId=28 は Science & Technology */
const YOUTUBE_TECH_CATEGORY = '28';
const YOUTUBE_MAX_RESULTS = 50;

const YoutubeTrendingSchema = z.object({
  items: z
    .array(
      z.object({
        id: z.string(),
        snippet: z
          .object({
            title: z.string(),
            channelTitle: z.string().nullable().optional(),
            publishedAt: z.string().nullable().optional(),
          })
          .optional(),
        statistics: z.object({ viewCount: z.string().nullable().optional() }).optional(),
      })
    )
    .optional(),
});

export async function fetchYoutubeTrending(limit: number, apiKey: string): Promise<RankedEntry[]> {
  const params = new URLSearchParams({
    part: 'snippet,statistics',
    chart: 'mostPopular',
    regionCode: 'JP',
    videoCategoryId: YOUTUBE_TECH_CATEGORY,
    maxResults: String(Math.min(limit, YOUTUBE_MAX_RESULTS)),
    key: apiKey,
  });

  const parsed = YoutubeTrendingSchema.safeParse(
    await httpGetJson(`https://www.googleapis.com/youtube/v3/videos?${params}`, {
      label: 'YouTube 急上昇',
    })
  );
  if (!parsed.success) throw new Error('YouTube 急上昇のレスポンス形式が想定と異なります');

  return (parsed.data.items ?? [])
    .filter((video) => video.snippet)
    .map((video) => ({
      externalId: video.id,
      title: video.snippet?.title ?? '',
      url: `https://www.youtube.com/watch?v=${video.id}`,
      metric: Number(video.statistics?.viewCount ?? 0),
      metricLabel: 'views',
      context: video.snippet?.channelTitle ? [video.snippet.channelTitle] : [],
      publishedAt: video.snippet?.publishedAt ?? undefined,
    }));
}

// ── Google Trends（SerpAPI） ─────────────────────────────────────────────
const GoogleTrendsSchema = z.object({
  trending_searches: z
    .array(
      z.object({
        query: z.string(),
        search_volume: z.number().nullable().optional(),
        categories: z.array(z.object({ name: z.string() })).nullable().optional(),
      })
    )
    .optional(),
});

/**
 * 急上昇検索ワード。記事ではなく検索語なので、URL には Trends の explore ページを充てる。
 * SerpAPI の無料枠は 250 検索/月。日次1回なら月30回で収まる。
 */
export async function fetchGoogleTrends(limit: number, apiKey: string): Promise<RankedEntry[]> {
  const params = new URLSearchParams({
    engine: 'google_trends_trending_now',
    geo: 'JP',
    hl: 'ja',
    api_key: apiKey,
  });

  const parsed = GoogleTrendsSchema.safeParse(
    await httpGetJson(`https://serpapi.com/search.json?${params}`, { label: 'Google Trends' })
  );
  if (!parsed.success) throw new Error('Google Trends のレスポンス形式が想定と異なります');

  return (parsed.data.trending_searches ?? []).slice(0, limit).map((entry) => ({
    externalId: `google-trends:${entry.query}`,
    title: entry.query,
    url: `https://trends.google.com/trends/explore?q=${encodeURIComponent(entry.query)}&geo=JP`,
    metric: entry.search_volume ?? 0,
    metricLabel: '検索',
    context: (entry.categories ?? []).map((category) => category.name),
  }));
}
