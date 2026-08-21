import { describe, expect, it } from 'vitest';
import { buildArticleMessages, type ArticleGroup } from '../src/notifiers/blocks/articles.js';

const now = new Date('2026-08-21T00:00:00.000Z');

function group(name: string, count: number, startId: number): ArticleGroup {
  return {
    sourceName: name,
    emoji: ':a:',
    articles: Array.from({ length: count }, (_, index) => ({
      id: startId + index,
      title: `記事 ${startId + index}`,
      url: `https://example.com/${startId + index}`,
      publishedAt: '2026-08-20T10:00:00.000Z',
      importance: null,
    })),
  };
}

describe('buildArticleMessages', () => {
  it('新着ゼロならメッセージを作らない', () => {
    expect(buildArticleMessages('Cloud', [group('A', 0, 1)], now)).toEqual([]);
  });

  it('ヘッダーと記事ブロックを組み立てる', () => {
    const [message] = buildArticleMessages('Cloud', [group('A', 2, 1)], now);

    expect(message?.articleIds).toEqual([1, 2]);
    expect(message?.blocks[0]).toMatchObject({ type: 'header' });
    expect(message?.text).toContain('2件の新着');
  });

  it('Slack のブロック上限を超えたら複数メッセージへ分割する', () => {
    const messages = buildArticleMessages('Cloud', [group('A', 40, 1), group('B', 40, 100)], now);

    expect(messages.length).toBeGreaterThan(1);
    for (const message of messages) {
      expect(message.blocks.length).toBeLessThanOrEqual(50);
    }
  });

  it('分割しても記事を取りこぼさず、重複もさせない', () => {
    const messages = buildArticleMessages('Cloud', [group('A', 40, 1), group('B', 40, 100)], now);
    const ids = messages.flatMap((message) => message.articleIds);

    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toHaveLength(80);
  });
});
