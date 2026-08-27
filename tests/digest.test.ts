import { describe, expect, it } from 'vitest';
import { tagPillars } from '../src/config/pillars.js';
import { digestPath, tokyoDate } from '../src/lib/archive.js';
import type { NotifiableArticle } from '../src/notifiers/blocks/articles.js';
import { renderDigest } from '../src/services/digest.js';

describe('tagPillars', () => {
  it('4本柱に当たった軸をすべて返す', () => {
    expect(tagPillars('Claude Code で業務を自動化する')).toEqual(['AIエンジニアリング', '業務']);
  });

  it('該当しなければ空配列を返す', () => {
    expect(tagPillars('ウイスキーの熟成年数について')).toEqual([]);
  });

  it('大文字小文字を無視する', () => {
    expect(tagPillars('building an llm agent')).toEqual(['AIエンジニアリング']);
  });

  it('組織とキャリアを区別する', () => {
    expect(tagPillars('エンジニア採用と評価制度の話')).toEqual(['組織']);
    expect(tagPillars('未経験からの転職ロードマップ')).toEqual(['キャリア']);
  });
});

describe('tokyoDate', () => {
  it('UTC 深夜でも JST の日付になる', () => {
    // 2026-08-27T15:30Z は JST では翌日 00:30
    expect(tokyoDate(new Date('2026-08-27T15:30:00.000Z'))).toBe('2026-08-28');
  });
});

describe('digestPath', () => {
  it('年月でディレクトリを切る', () => {
    expect(digestPath('/tmp/archive', '2026-08-27')).toBe('/tmp/archive/2026/08/2026-08-27.md');
  });
});

function article(overrides: Partial<NotifiableArticle> = {}): NotifiableArticle {
  return {
    id: 1,
    title: 'タイトル',
    url: 'https://example.com/1',
    publishedAt: '2026-08-27T00:00:00.000Z',
    importance: null,
    sourceNames: ['はてブ'],
    tags: ['AIエンジニアリング'],
    score: 0.87,
    detail: '337 users ｜ テクノロジー',
    ...overrides,
  };
}

describe('renderDigest', () => {
  const stats = { fetched: 150, newCount: 40 };

  it('チェックボックス付きの昇格候補として並べる', () => {
    const markdown = renderDigest({
      date: '2026-08-27',
      label: 'トレンドダイジェスト',
      articles: [article()],
      stats,
    });

    expect(markdown).toContain('# トレンドダイジェスト 2026-08-27');
    expect(markdown).toContain('収集 150 件 → 新規 40 件 → 通知 1 件');
    expect(markdown).toContain('- [ ] **1. タイトル**');
    expect(markdown).toContain('score `0.87` ｜ AIエンジニアリング');
    expect(markdown).toContain('https://example.com/1');
    expect(markdown).toContain('はてブ（337 users ｜ テクノロジー）');
  });

  it('複数の出典を併記する', () => {
    const markdown = renderDigest({
      date: '2026-08-27',
      label: 'トレンドダイジェスト',
      articles: [article({ sourceNames: ['はてブ', 'Hacker News'] })],
      stats,
    });

    expect(markdown).toContain('はてブ ＋ Hacker News');
  });

  it('タグが無ければ「タグなし」と書く', () => {
    const markdown = renderDigest({
      date: '2026-08-27',
      label: 'トレンドダイジェスト',
      articles: [article({ tags: [] })],
      stats,
    });

    expect(markdown).toContain('タグなし');
  });

  it('通知対象が無い日でも本文を返す', () => {
    const markdown = renderDigest({
      date: '2026-08-27',
      label: 'トレンドダイジェスト',
      articles: [],
      stats: { fetched: 0, newCount: 0 },
    });

    expect(markdown).toContain('（通知対象なし）');
  });
});
