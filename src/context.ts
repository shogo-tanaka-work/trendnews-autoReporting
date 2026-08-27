/**
 * 合成ルート。env → DB → Repository → Service の依存を組み立てる唯一の場所。
 * CLI（jobs/）と API（api/）の両方がここを使う。
 */
import { openDatabase, type Db } from './db/client.js';
import { createRepositories } from './db/repositories/sqlite.js';
import type { Repositories } from './db/repositories/types.js';
import { loadEnv, slackChannelFor, type Env } from './lib/env.js';
import { setLogLevel } from './lib/logger.js';
import { SlackWebApiNotifier } from './notifiers/slack.js';
import type { CollectDeps } from './services/collect.js';

export type AppContext = {
  env: Env;
  db: Db;
  repos: Repositories;
  collectDeps: CollectDeps;
  close: () => void;
};

export function createContext(): AppContext {
  const env = loadEnv();
  setLogLevel(env.LOG_LEVEL);

  const db = openDatabase(env.DATABASE_PATH);
  const repos = createRepositories(db);

  const collectDeps: CollectDeps = {
    repos,
    slack: new SlackWebApiNotifier(env.SLACK_BOT_TOKEN),
    githubToken: env.GITHUB_TOKEN,
    youtubeApiKey: env.YOUTUBE_API_KEY,
    connpassApiKey: env.CONNPASS_API_KEY,
    serpApiKey: env.SERPAPI_API_KEY,
    channelFor: slackChannelFor,
    now: () => new Date(),
  };

  return { env, db, repos, collectDeps, close: () => db.close() };
}

/** CONNPASS_KEYWORDS のカンマ区切りをキーワード配列へ変換する */
export function parseKeywords(raw: string): string[] {
  return raw
    .split(',')
    .map((keyword) => keyword.trim())
    .filter((keyword) => keyword.length > 0);
}
