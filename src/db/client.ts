/**
 * SQLite 接続。better-sqlite3 への依存はこのディレクトリの外へ出さない。
 * 将来 D1 へ移す際は Repository の実装だけ差し替える。
 */
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import Database from 'better-sqlite3';
import { ADD_COLUMNS, SCHEMA_SQL } from './schema.js';

export type Db = Database.Database;

/**
 * 後から足した列を既存 DB へ適用する。何度実行しても同じ結果になる。
 *
 * 列名は ADD_COLUMNS（コード内の定数）由来で外部入力ではないため、
 * SQL へ直接埋め込んでよい。ALTER TABLE は識別子を bind できない。
 */
function applyAddedColumns(db: Db): void {
  for (const { table, column, definition } of ADD_COLUMNS) {
    const columns = db.prepare<[], { name: string }>(`PRAGMA table_info(${table})`).all();
    if (columns.some((c) => c.name === column)) continue;

    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

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
  applyAddedColumns(db);

  return db;
}
