import { describe, expect, it } from 'vitest';
import type { Article } from '../src/domain/article.js';
import type { CategoryConfig, SourceConfig } from '../src/domain/source.js';
import type { CollectedEntry } from '../src/services/notify.js';
import { bundleKey, selectRanking } from '../src/services/select-ranking.js';

function source(id: string, weight?: number): SourceConfig {
  return {
    id,
    type: 'rss',
    name: `Source ${id}`,
    url: `https://example.com/${id}/feed`,
    emoji: ':a:',
    ...(weight === undefined ? {} : { weight }),
  };
}

function article(id: number, url: string, rank: number | null, publishedAt: string): Article {
  return {
    id,
    sourceId: 'unused',
    externalId: `e${id}`,
    title: `記事${id}`,
    url,
    rank,
    description: null,
    publishedAt,
    fetchedAt: '2026-08-27T00:00:00.000Z',
    categories: [],
    notifiedAt: null,
    createdAt: '2026-08-27T00:00:00.000Z',
  };
}

function entry(
  id: number,
  sourceId: string,
  rank: number | null,
  url = `https://example.com/a/${id}`,
  publishedAt = '2026-08-27T00:00:00.000Z',
  weight?: number
): CollectedEntry {
  const src = source(sourceId, weight);
  return {
    article: { ...article(id, url, rank, publishedAt), sourceId },
    source: src,
    ruleScore: 0,
    importance: null,
  };
}

function category(overrides: Partial<CategoryConfig> = {}): CategoryConfig {
  return {
    key: 'trend',
    label: 'トレンド',
    channelEnvKey: 'SLACK_CHANNEL_TREND',
    schedule: '*-*-* 07:15:00',
    selector: 'ranking',
    sources: [source('a'), source('b')],
    ...overrides,
  };
}

describe('bundleKey', () => {
  it('www と末尾スラッシュの差を吸収する', () => {
    expect(bundleKey('https://www.example.com/x/')).toBe(bundleKey('https://example.com/x'));
  });

  it('http と https を同一視する', () => {
    expect(bundleKey('http://example.com/x')).toBe(bundleKey('https://example.com/x'));
  });

  it('URL として解釈できない値でも例外にしない', () => {
    expect(bundleKey('  NOT A URL ')).toBe('not a url');
  });
});

describe('selectRanking', () => {
  it('情報源内の順位が上のものを優先する', () => {
    const { groups } = selectRanking(category(), [
      entry(1, 'a', 3),
      entry(2, 'a', 1),
      entry(3, 'a', 2),
    ]);

    expect(groups[0]?.articles.map((a) => a.id)).toEqual([2, 3, 1]);
  });

  it('情報源の重みが低いほど順位を下げる', () => {
    const { groups } = selectRanking(category({ sources: [source('a', 1), source('b', 0.2)] }), [
      entry(1, 'b', 1, 'https://example.com/b1', '2026-08-27T00:00:00.000Z', 0.2),
      entry(2, 'a', 2, 'https://example.com/a2', '2026-08-27T00:00:00.000Z', 1),
      entry(3, 'a', 1, 'https://example.com/a1', '2026-08-27T00:00:00.000Z', 1),
    ]);

    // 重み 0.2 の 1 位より、重み 1 の 2 位が上に来る
    expect(groups[0]?.articles.map((a) => a.id)).toEqual([3, 2, 1]);
  });

  it('複数の情報源に出た記事を束ねて加点し、出典を併記する', () => {
    const shared = 'https://example.com/shared';

    const { groups, excludedIds } = selectRanking(category(), [
      entry(1, 'a', 2, shared),
      entry(2, 'b', 2, `${shared}/`),
      entry(3, 'a', 1, 'https://example.com/only-a'),
    ]);

    const top = groups[0]?.articles[0];
    expect(top?.sourceNames).toEqual(['Source a', 'Source b']);
    // 束ねた中で最も評価の高い出現（1件しかない Source b の1位）が代表になる
    expect(top?.id).toBe(2);
    // 代表以外の重複は通知せず既読化する
    expect(excludedIds).toContain(1);
    expect(groups[0]?.articles.map((a) => a.id)).toEqual([2, 3]);
  });

  it('maxPerNotification を超えた分は除外して既読化する', () => {
    const { groups, excludedIds } = selectRanking(category({ maxPerNotification: 2 }), [
      entry(1, 'a', 1),
      entry(2, 'a', 2),
      entry(3, 'a', 3),
    ]);

    expect(groups[0]?.articles.map((a) => a.id)).toEqual([1, 2]);
    expect(excludedIds).toEqual([3]);
  });

  it('maxPerSource で1つの情報源が枠を占有するのを防ぐ', () => {
    const { groups } = selectRanking(category({ maxPerSource: 1 }), [
      entry(1, 'a', 1),
      entry(2, 'a', 2),
      entry(3, 'b', 1),
    ]);

    const ids = groups[0]?.articles.map((a) => a.id) ?? [];
    expect(ids).toHaveLength(2);
    expect(ids).toContain(1);
    expect(ids).toContain(3);
  });

  it('rank を持たない記事は同じ情報源の中で新しい順に並べる', () => {
    const { groups } = selectRanking(category(), [
      entry(1, 'a', null, 'https://example.com/a1', '2026-08-25T00:00:00.000Z'),
      entry(2, 'a', null, 'https://example.com/a2', '2026-08-27T00:00:00.000Z'),
    ]);

    expect(groups[0]?.articles.map((a) => a.id)).toEqual([2, 1]);
  });

  it('情報源の見出しを出さない（順位が主役のため）', () => {
    const { groups } = selectRanking(category(), [entry(1, 'a', 1)]);

    expect(groups[0]?.sourceName).toBeUndefined();
  });

  it('候補が無ければ空を返す', () => {
    expect(selectRanking(category(), [])).toEqual({ groups: [], excludedIds: [] });
  });
});

describe('selectRanking（4本柱の枠割り当て）', () => {
  /** タイトルで柱に当たる／当たらないを作り分ける */
  function titled(id: number, sourceId: string, rank: number, title: string): CollectedEntry {
    const base = entry(id, sourceId, rank, `https://example.com/p/${id}`);
    return { ...base, article: { ...base.article, title } };
  }

  const withPillars = category({ maxPerNotification: 4, pillars: { untaggedSlots: 1 } });

  it('4本柱に当たったものを優先し、無タグは枠の上限まで', () => {
    const { groups } = selectRanking(withPillars, [
      titled(1, 'a', 1, 'ウイスキーの熟成年数'),
      titled(2, 'a', 2, '雑談スレッド'),
      titled(3, 'a', 3, 'Claude で自動化する'),
      titled(4, 'a', 4, 'LLM エージェント入門'),
      titled(5, 'a', 5, 'エンジニア採用の評価制度'),
    ]);

    const ids = groups[0]?.articles.map((a) => a.id) ?? [];
    // 無タグ（1, 2）は上位2件だが、枠は1つしか割かれない
    expect(ids).toHaveLength(4);
    expect(ids.filter((id) => id === 1 || id === 2)).toHaveLength(1);
    expect(ids).toContain(3);
    expect(ids).toContain(4);
    expect(ids).toContain(5);
  });

  it('タグを NotifiableArticle へ載せる', () => {
    const { groups } = selectRanking(withPillars, [titled(1, 'a', 1, 'Claude で業務を自動化する')]);

    expect(groups[0]?.articles[0]?.tags).toEqual(['AIエンジニアリング', '業務']);
  });

  it('pillars 未設定のカテゴリではタグ付けしない', () => {
    const { groups } = selectRanking(category(), [titled(1, 'a', 1, 'Claude の話')]);

    expect(groups[0]?.articles[0]?.tags).toEqual([]);
  });

  it('タグ付きだけで枠が埋まるなら無タグは載せない', () => {
    const { groups, excludedIds } = selectRanking(
      category({ maxPerNotification: 2, pillars: { untaggedSlots: 3 } }),
      [
        titled(1, 'a', 1, 'Claude の話'),
        titled(2, 'a', 2, 'LLM の話'),
        titled(3, 'a', 3, '雑談'),
      ]
    );

    expect(groups[0]?.articles.map((a) => a.id)).toEqual([1, 2]);
    expect(excludedIds).toContain(3);
  });
});
