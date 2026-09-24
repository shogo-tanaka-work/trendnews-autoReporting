import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { openDatabase, type Db } from '../src/db/client.js';
import { createRepositories } from '../src/db/repositories/sqlite.js';
import type { Repositories } from '../src/db/repositories/types.js';
import type { CategoryConfig } from '../src/domain/source.js';
import type { SlackPost } from '../src/notifiers/slack.js';
import { collectCategory, type CollectDeps } from '../src/services/collect.js';

// 収集は失敗させ、事前に入れた未通知記事だけで通知判定を確かめる
vi.mock('../src/collectors/rss.js', () => ({
  RssCollector: class {
    collect(): Promise<never> {
      return Promise.reject(new Error('テストでは取得しない'));
    }
  },
}));

const weekly: CategoryConfig = {
  key: 'engineer_news',
  label: 'エンジニアニュース',
  channelEnvKey: 'SLACK_CHANNEL_ENGINEER_NEWS',
  schedule: '*-*-* 08:10:00',
  notifyDays: ['Sat'],
  selector: 'ranking',
  maxPerNotification: 10,
  sources: [{ id: 'src-a', type: 'rss', name: 'Source A', url: 'https://example.com/feed' }],
};

describe('collectCategory の通知日判定', () => {
  let db: Db;
  let repos: Repositories;
  let posts: SlackPost[];

  function deps(now: string): CollectDeps {
    return {
      repos,
      slack: { post: async (message) => void posts.push(message) },
      githubToken: undefined,
      youtubeApiKey: undefined,
      connpassApiKey: undefined,
      serpApiKey: undefined,
      channelFor: () => 'C_TEST',
      now: () => new Date(now),
    };
  }

  async function pendingCount(): Promise<number> {
    return (await repos.articles.listPending(weekly.key, 100)).length;
  }

  beforeEach(async () => {
    db = openDatabase(':memory:');
    repos = createRepositories(db);
    posts = [];

    await repos.sources.upsertMany(
      [{ id: 'src-a', name: 'Source A', type: 'rss', category: weekly.key, url: null, enabled: true }],
      '2026-09-21T00:00:00.000Z'
    );
    await repos.articles.insertNew(
      ['mon', 'wed', 'fri'].map((day, index) => ({
        sourceId: 'src-a',
        externalId: day,
        title: `記事 ${day}`,
        url: `https://example.com/${day}`,
        description: null,
        rank: 1,
        publishedAt: `2026-09-2${1 + index * 2}T00:00:00.000Z`,
        fetchedAt: `2026-09-2${1 + index * 2}T00:00:00.000Z`,
        categories: [],
      }))
    );
  });

  afterEach(() => db.close());

  it('通知日でなければ送信も既読化もせず持ち越す', async () => {
    // 2026-09-25(金) 08:10 JST
    const summary = await collectCategory(deps('2026-09-24T23:10:00.000Z'), weekly);

    expect(summary.notifiedCount).toBe(0);
    expect(posts).toHaveLength(0);
    expect(await pendingCount()).toBe(3);
  });

  it('通知日に持ち越した分をまとめて送る', async () => {
    await collectCategory(deps('2026-09-24T23:10:00.000Z'), weekly);
    // 2026-09-26(土) 08:10 JST
    const summary = await collectCategory(deps('2026-09-25T23:10:00.000Z'), weekly);

    expect(summary.notifiedCount).toBe(3);
    expect(posts).toHaveLength(1);
    expect(await pendingCount()).toBe(0);
  });
});
