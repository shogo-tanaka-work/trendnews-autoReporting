/**
 * SQLite 接続。better-sqlite3 への依存はこのディレクトリの外へ出さない。
 * 将来 D1 へ移す際は Repository の実装だけ差し替える。
 */
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import Database from 'better-sqlite3';
import { SCHEMA_SQL } from './schema.js';

export type Db = Database.Database;

/**
 * DB を開き、スキーマを適用して返す。
 * ファイルが無ければ作成する（初回実行でそのまま動くようにするため）。
 */
export function openDatabase(databasePath: string): Db {
  // ':memory:' はテスト用。パス解決するとファイル扱いになるためそのまま渡す。
  const target = databasePath === ':memory:' ? databasePath : resolve(databasePath);
  if (target !== ':memory:') mkdirSync(dirname(target), { recursive: true });

  const db = new Database(target);

  // 収集ジョブと API が同時に触るため WAL + busy_timeout を設定する
  db.pragma('journal_mode = WAL');
  db.pragma('busy_timeout = 5000');
  db.pragma('foreign_keys = ON');

  db.exec(SCHEMA_SQL);

  return db;
}
