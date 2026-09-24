import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { openDatabase, type Db } from '../src/db/client.js';
import { createRepositories } from '../src/db/repositories/sqlite.js';
import type { Repositories } from '../src/db/repositories/types.js';
import type { SlackPost } from '../src/notifiers/slack.js';
import type { CollectDeps } from '../src/services/collect.js';
import { collectKeywordTrends } from '../src/services/keywords.js';

// 語ごとの挙動を差し替える。既定は「推移あり・関連クエリなし」
const behavior = vi.hoisted(() => ({
  failTimeseries: new Set<string>(),
  failRising: new Set<string>(),
  rising: new Map<string, { query: string; value: string }[]>(),
}));

vi.mock('../src/collectors/google-trends-keywords.js', () => ({
  GoogleTrendsKeywordCollector: class {
    fetchTimeseries(keyword: string): Promise<{ timestamp: number; value: number }[]> {
      if (behavior.failTimeseries.has(keyword) || behavior.failTimeseries.has('*')) {
        return Promise.reject(new Error('HTTP 500'));
      }
      return Promise.resolve(
        Array.from({ length: 14 }, (_, index) => ({ timestamp: index, value: index < 7 ? 10 : 20 }))
      );
    }

    fetchRisingQueries(keyword: string): Promise<{ query: string; value: string }[]> {
      if (behavior.failRising.has(keyword)) return Promise.reject(new Error('HTTP 429'));
      return Promise.resolve(behavior.rising.get(keyword) ?? []);
    }
  },
}));

describe('collectKeywordTrends', () => {
  let db: Db;
  let repos: Repositories;
  let posts: SlackPost[];
  let archiveDir: string;

  function deps(slackFails = false): CollectDeps {
    return {
      repos,
      slack: {
        post: async (message) => {
          if (slackFails) throw new Error('Slack 送信失敗');
          posts.push(message);
        },
      },
      githubToken: undefined,
      youtubeApiKey: undefined,
      connpassApiKey: undefined,
      serpApiKey: 'test-key',
      channelFor: () => 'C_TEST',
      archiveDir,
      now: () => new Date('2026-09-27T23:50:00.000Z'),
    };
  }

  function lastJobRun(): { status: string; error_message: string | null } {
    return db
      .prepare('SELECT status, error_message FROM job_runs ORDER BY id DESC LIMIT 1')
      .get() as { status: string; error_message: string | null };
  }

  beforeEach(async () => {
    db = openDatabase(':memory:');
    repos = createRepositories(db);
    posts = [];
    archiveDir = await mkdtemp(join(tmpdir(), 'keywords-'));
    behavior.failTimeseries.clear();
    behavior.failRising.clear();
    behavior.rising.clear();
  });

  afterEach(() => db.close());

  it('一部の語が失敗しても通知し、job_runs を partial にする', async () => {
    behavior.failTimeseries.add('Codex');
    behavior.failRising.add('Cursor');

    const summary = await collectKeywordTrends(deps(), 'C_TEST');

    expect(summary).toMatchObject({ failed: 1, risingFailed: 1, notified: true });
    expect(posts).toHaveLength(1);
    expect(lastJobRun()).toEqual({
      status: 'partial',
      error_message: '1 語で推移の取得に失敗 / 1 語で関連クエリの取得に失敗',
    });
  });

  it('すべての語が失敗したら通知せず failed にする', async () => {
    behavior.failTimeseries.add('*');

    await expect(collectKeywordTrends(deps(), 'C_TEST')).rejects.toThrow('キーワードトレンドの取得に失敗しました');
    expect(posts).toHaveLength(0);
    expect(lastJobRun().status).toBe('failed');
  });

  it('Slack 送信に失敗しても台帳は残す', async () => {
    await expect(collectKeywordTrends(deps(true), 'C_TEST')).rejects.toThrow();

    const ledger = await readFile(join(archiveDir, '2026', '09', '2026-09-28-keywords.md'), 'utf-8');
    expect(ledger).toContain('**Claude Code** +100%');
    expect(lastJobRun().status).toBe('failed');
  });

  it('複数の語に出た無関係な関連クエリは台帳にも通知にも載せない', async () => {
    behavior.rising.set('Claude Code', [{ query: 'jev', value: '+2400%' }]);
    behavior.rising.set('Codex', [
      { query: 'jev', value: '+1950%' },
      { query: 'codex app server', value: '+70%' },
    ]);

    await collectKeywordTrends(deps(), 'C_TEST');

    const ledger = await readFile(join(archiveDir, '2026', '09', '2026-09-28-keywords.md'), 'utf-8');
    expect(ledger).not.toContain('jev');
    expect(ledger).toContain('codex app server（+70%）');
    expect(JSON.stringify(posts[0]?.blocks)).not.toContain('jev');
  });

  it('関連クエリは除外のあとで1語3件に切って台帳に残す', async () => {
    behavior.rising.set(
      'Codex',
      ['a', 'b', 'c', 'd'].map((query) => ({ query: `codex ${query}`, value: '+10%' }))
    );

    await collectKeywordTrends(deps(), 'C_TEST');

    const ledger = await readFile(join(archiveDir, '2026', '09', '2026-09-28-keywords.md'), 'utf-8');
    expect(ledger).toContain('codex c（+10%）');
    expect(ledger).not.toContain('codex d');
  });
});
