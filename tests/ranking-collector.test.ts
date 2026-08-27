import { afterEach, describe, expect, it, vi } from 'vitest';
import { RankingCollector } from '../src/collectors/ranking/index.js';
import { toRawItems } from '../src/collectors/ranking/types.js';
import type { RankingSourceConfig } from '../src/domain/source.js';

const NOW = new Date('2026-08-27T00:00:00.000Z');

function source(overrides: Partial<RankingSourceConfig> & Pick<RankingSourceConfig, 'provider'>): RankingSourceConfig {
  return {
    id: `trend-${overrides.provider}`,
    type: 'ranking',
    name: overrides.provider,
    weight: 1,
    ...overrides,
  };
}

/** fetch を差し替えて、指定 URL に対する JSON を返す */
function stubFetch(payload: unknown): void {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(
      new Response(JSON.stringify(payload), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    )
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('toRawItems', () => {
  it('並び順をそのまま順位にする', () => {
    const items = toRawItems(
      [
        { externalId: 'a', title: 'A', url: 'https://example.com/a' },
        { externalId: 'b', title: 'B', url: 'https://example.com/b' },
      ],
      10
    );

    expect(items.map((item) => item.rank)).toEqual([1, 2]);
  });

  it('limit を超えた分は切り捨てる', () => {
    const entries = Array.from({ length: 5 }, (_, i) => ({
      externalId: `e${i}`,
      title: `T${i}`,
      url: `https://example.com/${i}`,
    }));

    expect(toRawItems(entries, 2)).toHaveLength(2);
  });

  it('metric と context を description へまとめる', () => {
    const [item] = toRawItems(
      [
        {
          externalId: 'a',
          title: 'A',
          url: 'https://example.com/a',
          metric: 1234,
          metricLabel: 'users',
          context: ['テクノロジー'],
        },
      ],
      10
    );

    expect(item?.description).toBe('1,234 users ｜ テクノロジー');
    expect(item?.categories).toEqual(['テクノロジー']);
  });

  it('metric も context も無ければ description を付けない', () => {
    const [item] = toRawItems([{ externalId: 'a', title: 'A', url: 'https://example.com/a' }], 10);

    expect(item?.description).toBeUndefined();
  });
});

describe('RankingCollector', () => {
  const credentials = { githubToken: undefined, youtubeApiKey: undefined, serpApiKey: undefined };

  it('鍵が無い provider は例外にせず空で返す', async () => {
    const collector = new RankingCollector(credentials, () => NOW);

    await expect(collector.collect(source({ provider: 'youtube_trending' }))).resolves.toEqual([]);
    await expect(collector.collect(source({ provider: 'google_trends' }))).resolves.toEqual([]);
  });

  it('鍵の要らない provider は鍵が無くても収集する', async () => {
    stubFetch({
      articles: [
        { id: 1, title: 'Zenn の記事', path: '/foo/articles/bar', liked_count: 10, article_type: 'tech' },
      ],
    });

    const collector = new RankingCollector(credentials, () => NOW);
    const items = await collector.collect(source({ provider: 'zenn' }));

    expect(items).toHaveLength(1);
    expect(items[0]?.url).toBe('https://zenn.dev/foo/articles/bar');
    expect(items[0]?.rank).toBe(1);
    expect(items[0]?.externalId).toBe('1');
  });

  it('Qiita は LGTM の多い順へ並べ直す', async () => {
    stubFetch([
      { id: 'q1', title: '少ない', url: 'https://qiita.com/1', likes_count: 3, tags: [] },
      { id: 'q2', title: '多い', url: 'https://qiita.com/2', likes_count: 30, tags: [] },
    ]);

    const collector = new RankingCollector(credentials, () => NOW);
    const items = await collector.collect(source({ provider: 'qiita' }));

    expect(items.map((item) => item.title)).toEqual(['多い', '少ない']);
  });

  it('Hacker News は url が無い投稿にコメントページを充てる', async () => {
    stubFetch({ hits: [{ objectID: '123', title: 'Ask HN', points: 100, num_comments: 5 }] });

    const collector = new RankingCollector(credentials, () => NOW);
    const items = await collector.collect(source({ provider: 'hackernews' }));

    expect(items[0]?.url).toBe('https://news.ycombinator.com/item?id=123');
  });

  it('想定外のレスポンス形式は例外にする（1情報源だけ落とすため）', async () => {
    stubFetch({ unexpected: true });

    const collector = new RankingCollector(credentials, () => NOW);

    await expect(collector.collect(source({ provider: 'qiita' }))).rejects.toThrow(/想定と異なります/);
  });

  it('limit を情報源設定から受け取る', async () => {
    stubFetch([
      { id: 'q1', title: 'A', url: 'https://qiita.com/1', likes_count: 3, tags: [] },
      { id: 'q2', title: 'B', url: 'https://qiita.com/2', likes_count: 2, tags: [] },
    ]);

    const collector = new RankingCollector(credentials, () => NOW);
    const items = await collector.collect(source({ provider: 'qiita', limit: 1 }));

    expect(items).toHaveLength(1);
  });
});
