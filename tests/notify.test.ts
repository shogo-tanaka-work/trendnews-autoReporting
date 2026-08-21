import { describe, expect, it, vi } from 'vitest';
import type { Article } from '../src/domain/article.js';
import type { CategoryConfig } from '../src/domain/source.js';
import { notifyArticles, selectForNotification, type CollectedEntry } from '../src/services/notify.js';

function article(id: number, title: string, publishedAt: string): Article {
  return {
    id,
    sourceId: 'src-a',
    externalId: `e${id}`,
    title,
    url: `https://example.com/${id}`,
    description: null,
    publishedAt,
    fetchedAt: '2026-08-21T00:00:00.000Z',
    categories: [],
    notifiedAt: null,
    createdAt: '2026-08-21T00:00:00.000Z',
  };
}

function entry(id: number, ruleScore: number, publishedAt = '2026-08-20T00:00:00.000Z'): CollectedEntry {
  return {
    article: article(id, `記事${id}`, publishedAt),
    source: { id: 'src-a', type: 'rss', name: 'Source A', url: 'https://example.com/feed', emoji: ':a:' },
    ruleScore,
    importance: ruleScore >= 9 ? 'A' : ruleScore >= 4 ? 'B' : 'C',
  };
}

const scoringCategory: CategoryConfig = {
  key: 'tech_cloud',
  label: 'Cloud',
  channelEnvKey: 'SLACK_CHANNEL_TECH_CLOUD',
  schedule: '*-*-* 09:00:00',
  useScoring: true,
  minScore: 4,
  maxPerSource: 2,
  sources: [{ id: 'src-a', type: 'rss', name: 'Source A', url: 'https://example.com/feed', emoji: ':a:' }],
};

describe('selectForNotification', () => {
  it('スコア未満を除外し、スコア降順で上位だけ残す', () => {
    const { groups, excludedIds } = selectForNotification(scoringCategory, [
      entry(1, 3),
      entry(2, 10),
      entry(3, 5),
      entry(4, 7),
    ]);

    expect(groups[0]?.articles.map((a) => a.id)).toEqual([2, 4]);
    expect(excludedIds.sort()).toEqual([1, 3]);
  });

  it('スコアリングしないカテゴリは発行日時の降順で全件残す', () => {
    const category: CategoryConfig = { ...scoringCategory, useScoring: false, maxPerSource: 5 };

    const { groups, excludedIds } = selectForNotification(category, [
      entry(1, 0, '2026-08-19T00:00:00.000Z'),
      entry(2, 0, '2026-08-21T00:00:00.000Z'),
      entry(3, 0, '2026-08-20T00:00:00.000Z'),
    ]);

    expect(groups[0]?.articles.map((a) => a.id)).toEqual([2, 3, 1]);
    expect(excludedIds).toEqual([]);
  });

  it('スコアリングしないカテゴリでは importance バッジを付けない', () => {
    const category: CategoryConfig = { ...scoringCategory, useScoring: false };
    const { groups } = selectForNotification(category, [entry(1, 10)]);

    expect(groups[0]?.articles[0]?.importance).toBeNull();
  });
});

describe('notifyArticles', () => {
  const now = new Date('2026-08-21T00:00:00.000Z');

  it('送信に成功した記事と対象外の記事だけを既読化する', async () => {
    const markNotified = vi.fn<(ids: number[], at: string) => Promise<void>>().mockResolvedValue();
    const post = vi.fn().mockResolvedValue(undefined);

    const result = await notifyArticles(
      { slack: { post }, markNotified, now: () => now },
      scoringCategory,
      'C123',
      [entry(1, 3), entry(2, 10)]
    );

    expect(result.notifiedCount).toBe(1);
    expect(post).toHaveBeenCalledTimes(1);
    expect(markNotified.mock.calls.map((call) => call[0])).toEqual([[1], [2]]);
  });

  it('送信に失敗した記事は既読化しない', async () => {
    const markNotified = vi.fn<(ids: number[], at: string) => Promise<void>>().mockResolvedValue();
    const post = vi.fn().mockRejectedValue(new Error('slack down'));

    const result = await notifyArticles(
      { slack: { post }, markNotified, now: () => now },
      scoringCategory,
      'C123',
      [entry(2, 10)]
    );

    expect(result.notifiedCount).toBe(0);
    expect(result.failedMessages).toBe(1);
    // 対象外記事の空配列マークのみが呼ばれる
    expect(markNotified.mock.calls.map((call) => call[0])).toEqual([[]]);
  });
});
