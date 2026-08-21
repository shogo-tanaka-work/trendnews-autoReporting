import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openDatabase, type Db } from '../src/db/client.js';
import { createRepositories } from '../src/db/repositories/sqlite.js';
import type { Repositories } from '../src/db/repositories/types.js';
import type { NewArticle } from '../src/domain/article.js';

function newArticle(externalId: string, overrides: Partial<NewArticle> = {}): NewArticle {
  return {
    sourceId: 'src-a',
    externalId,
    title: `記事 ${externalId}`,
    url: `https://example.com/${externalId}`,
    description: null,
    publishedAt: '2026-08-20T10:00:00.000Z',
    fetchedAt: '2026-08-21T00:00:00.000Z',
    categories: ['Workers'],
    ...overrides,
  };
}

describe('SqliteArticleRepository', () => {
  let db: Db;
  let repos: Repositories;

  beforeEach(async () => {
    db = openDatabase(':memory:');
    repos = createRepositories(db);
    await repos.sources.upsertMany(
      [{ id: 'src-a', name: 'Source A', type: 'rss', category: 'tech_cloud', url: null, enabled: true }],
      '2026-08-21T00:00:00.000Z'
    );
  });

  afterEach(() => db.close());

  it('2回目の収集では新規が増えない', async () => {
    const batch = [newArticle('a'), newArticle('b')];

    const first = await repos.articles.insertNew(batch);
    expect(first.inserted).toHaveLength(2);
    expect(first.duplicates).toBe(0);

    const second = await repos.articles.insertNew(batch);
    expect(second.inserted).toHaveLength(0);
    expect(second.duplicates).toBe(2);
  });

  it('同じ URL でも情報源が違えば別記事として保存する', async () => {
    await repos.sources.upsertMany(
      [{ id: 'src-b', name: 'Source B', type: 'rss', category: 'tech_web', url: null, enabled: true }],
      '2026-08-21T00:00:00.000Z'
    );

    const result = await repos.articles.insertNew([
      newArticle('a'),
      newArticle('a', { sourceId: 'src-b' }),
    ]);

    expect(result.inserted).toHaveLength(2);
  });

  it('markNotified 済みの記事は notified_at を持つ', async () => {
    const { inserted } = await repos.articles.insertNew([newArticle('a')]);
    const id = inserted[0]?.id ?? 0;

    await repos.articles.markNotified([id], '2026-08-21T01:00:00.000Z');

    const found = await repos.articles.findById(id);
    expect(found?.notifiedAt).toBe('2026-08-21T01:00:00.000Z');
  });

  it('listPending は未通知の記事だけを返す（送信失敗分が次回再送される）', async () => {
    const { inserted } = await repos.articles.insertNew([newArticle('a'), newArticle('b')]);

    expect(await repos.articles.listPending('tech_cloud', 100)).toHaveLength(2);

    await repos.articles.markNotified([inserted[0]?.id ?? 0], '2026-08-21T01:00:00.000Z');

    const stillPending = await repos.articles.listPending('tech_cloud', 100);
    expect(stillPending.map((a) => a.externalId)).toEqual(['b']);

    // 他カテゴリの pending は混ざらない
    expect(await repos.articles.listPending('tech_web', 100)).toHaveLength(0);
  });

  it('importance とカテゴリで絞り込める', async () => {
    const { inserted } = await repos.articles.insertNew([newArticle('a'), newArticle('b')]);
    await repos.articles.saveScore(inserted[0]?.id ?? 0, 10, 'A', '2026-08-21T00:00:00.000Z');
    await repos.articles.saveScore(inserted[1]?.id ?? 0, 1, 'C', '2026-08-21T00:00:00.000Z');

    const importantOnes = await repos.articles.list({ importance: 'A' });
    expect(importantOnes).toHaveLength(1);

    const byCategory = await repos.articles.list({ category: 'tech_cloud' });
    expect(byCategory).toHaveLength(2);

    const otherCategory = await repos.articles.list({ category: 'tech_web' });
    expect(otherCategory).toHaveLength(0);
  });

  it('job_runs に開始と終了を記録する', async () => {
    const jobRunId = await repos.jobRuns.start('collect:tech_cloud', '2026-08-21T00:00:00.000Z');
    await repos.jobRuns.finish(jobRunId, {
      status: 'partial',
      processedCount: 10,
      newCount: 3,
      errorMessage: 'src-b: timeout',
      finishedAt: '2026-08-21T00:01:00.000Z',
    });

    const row = db
      .prepare<unknown[], { status: string; new_count: number; error_message: string | null }>(
        'SELECT status, new_count, error_message FROM job_runs WHERE id = ?'
      )
      .get(jobRunId);

    expect(row).toMatchObject({ status: 'partial', new_count: 3, error_message: 'src-b: timeout' });
  });
});
