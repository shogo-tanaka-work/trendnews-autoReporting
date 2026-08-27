/**
 * DDL。SQLite と Cloudflare D1 の双方で通る SQL に限定する。
 *
 * - 重複取得の防止は UNIQUE(source_id, external_id)。
 *   同じ URL を複数カテゴリで購読することは意図的に許すため、url には UNIQUE を張らない。
 * - notified_at が NULL の記事だけを Slack へ送る。時間窓ではなく DB で重複排除する。
 * - 既存 DB への列追加は ADD_COLUMNS で行う。CREATE TABLE IF NOT EXISTS は
 *   既存テーブルへ列を足さないため、両方を同じ内容に保つこと。
 */

export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS sources (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  type        TEXT NOT NULL,
  category    TEXT NOT NULL,
  url         TEXT,
  enabled     INTEGER NOT NULL DEFAULT 1,
  config_json TEXT,
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS articles (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  source_id       TEXT NOT NULL,
  external_id     TEXT NOT NULL,
  title           TEXT NOT NULL,
  url             TEXT NOT NULL,
  description     TEXT,
  published_at    TEXT,
  fetched_at      TEXT NOT NULL,
  categories_json TEXT NOT NULL DEFAULT '[]',
  notified_at     TEXT,
  created_at      TEXT NOT NULL,
  -- 情報源内での掲載順（1 始まり）。ランキング型の選抜で使う。
  -- 順位の概念を持たない情報源では NULL。rank は SQLite のキーワードなので別名にする。
  source_rank     INTEGER,
  UNIQUE (source_id, external_id)
);

CREATE INDEX IF NOT EXISTS idx_articles_pending  ON articles (notified_at, source_id);
CREATE INDEX IF NOT EXISTS idx_articles_url      ON articles (url);
CREATE INDEX IF NOT EXISTS idx_articles_published ON articles (published_at DESC);

CREATE TABLE IF NOT EXISTS article_scores (
  article_id      INTEGER PRIMARY KEY,
  rule_score      INTEGER NOT NULL,
  importance      TEXT NOT NULL,
  llm_reason      TEXT,
  should_read_now INTEGER,
  scored_at       TEXT NOT NULL,
  FOREIGN KEY (article_id) REFERENCES articles (id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_article_scores_importance ON article_scores (importance);

CREATE TABLE IF NOT EXISTS job_runs (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  job_name        TEXT NOT NULL,
  started_at      TEXT NOT NULL,
  finished_at     TEXT,
  status          TEXT NOT NULL,
  processed_count INTEGER NOT NULL DEFAULT 0,
  new_count       INTEGER NOT NULL DEFAULT 0,
  error_message   TEXT
);

CREATE INDEX IF NOT EXISTS idx_job_runs_name ON job_runs (job_name, started_at DESC);
`;

/**
 * 既存 DB へ後から足した列。SCHEMA_SQL の CREATE TABLE と必ず同じ定義にする。
 *
 * SQLite の ALTER TABLE ADD COLUMN は「既にある」ことを検知できないため、
 * 適用側で PRAGMA table_info を見てから実行する。NOT NULL 制約付きの列は
 * 既存行を埋められないので、ここへ足す列は必ず NULL 許容にすること。
 */
export const ADD_COLUMNS: { table: string; column: string; definition: string }[] = [
  { table: 'articles', column: 'source_rank', definition: 'INTEGER' },
];
