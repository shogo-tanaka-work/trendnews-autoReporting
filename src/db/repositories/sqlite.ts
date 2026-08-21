/**
 * Repository の SQLite 実装。
 */
import type { Article, Importance, NewArticle, ScoredArticle, SourceType } from '../../domain/article.js';
import type { Db } from '../client.js';
import type {
  ArticleFilter,
  ArticleRepository,
  InsertResult,
  JobFinish,
  JobRunRepository,
  Repositories,
  SourceRepository,
  SourceRow,
} from './types.js';

type ArticleDbRow = {
  id: number;
  source_id: string;
  external_id: string;
  title: string;
  url: string;
  description: string | null;
  published_at: string | null;
  fetched_at: string;
  categories_json: string;
  notified_at: string | null;
  created_at: string;
  rule_score: number | null;
  importance: string | null;
  llm_reason: string | null;
  should_read_now: number | null;
  scored_at: string | null;
};

function parseCategories(json: string): string[] {
  try {
    const parsed: unknown = JSON.parse(json);
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string') : [];
  } catch {
    return [];
  }
}

function toArticle(row: ArticleDbRow): Article {
  return {
    id: row.id,
    sourceId: row.source_id,
    externalId: row.external_id,
    title: row.title,
    url: row.url,
    description: row.description,
    publishedAt: row.published_at,
    fetchedAt: row.fetched_at,
    categories: parseCategories(row.categories_json),
    notifiedAt: row.notified_at,
    createdAt: row.created_at,
  };
}

function toScoredArticle(row: ArticleDbRow): ScoredArticle {
  const article = toArticle(row);
  if (row.importance === null || row.rule_score === null || row.scored_at === null) {
    return { ...article, score: null };
  }

  return {
    ...article,
    score: {
      articleId: row.id,
      ruleScore: row.rule_score,
      importance: row.importance as Importance,
      llmReason: row.llm_reason,
      shouldReadNow: row.should_read_now === null ? null : row.should_read_now === 1,
      scoredAt: row.scored_at,
    },
  };
}

const ARTICLE_SELECT = `
  SELECT a.*, s.rule_score, s.importance, s.llm_reason, s.should_read_now, s.scored_at
  FROM articles a
  LEFT JOIN article_scores s ON s.article_id = a.id
`;

class SqliteArticleRepository implements ArticleRepository {
  // prepare を呼び出しごとに行うと Statement が大量に GC 対象になるため、接続ごとに1回だけ用意する
  private readonly insertStmt;
  private readonly markNotifiedStmt;
  private readonly saveScoreStmt;
  private readonly findByIdStmt;

  constructor(private readonly db: Db) {
    this.insertStmt = db.prepare<unknown[], ArticleDbRow>(`
      INSERT INTO articles
        (source_id, external_id, title, url, description, published_at, fetched_at, categories_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT (source_id, external_id) DO NOTHING
      RETURNING *, NULL AS rule_score, NULL AS importance, NULL AS llm_reason,
                NULL AS should_read_now, NULL AS scored_at
    `);

    this.markNotifiedStmt = db.prepare('UPDATE articles SET notified_at = ? WHERE id = ?');

    this.saveScoreStmt = db.prepare(
      `INSERT INTO article_scores (article_id, rule_score, importance, scored_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT (article_id) DO UPDATE SET
         rule_score = excluded.rule_score,
         importance = excluded.importance,
         scored_at  = excluded.scored_at`
    );

    this.findByIdStmt = db.prepare<unknown[], ArticleDbRow>(`${ARTICLE_SELECT} WHERE a.id = ?`);
  }

  async insertNew(articles: NewArticle[]): Promise<InsertResult> {
    if (articles.length === 0) return { inserted: [], duplicates: 0 };

    const stmt = this.insertStmt;

    const runAll = this.db.transaction((rows: NewArticle[]) => {
      const inserted: Article[] = [];
      let duplicates = 0;

      for (const row of rows) {
        const result = stmt.get(
          row.sourceId,
          row.externalId,
          row.title,
          row.url,
          row.description,
          row.publishedAt,
          row.fetchedAt,
          JSON.stringify(row.categories),
          row.fetchedAt
        );

        if (result) inserted.push(toArticle(result));
        else duplicates += 1;
      }

      return { inserted, duplicates };
    });

    return runAll(articles);
  }

  async markNotified(articleIds: number[], notifiedAt: string): Promise<void> {
    if (articleIds.length === 0) return;

    const stmt = this.markNotifiedStmt;
    const runAll = this.db.transaction((ids: number[]) => {
      for (const id of ids) stmt.run(notifiedAt, id);
    });

    runAll(articleIds);
  }

  async listPending(category: string, limit: number): Promise<ScoredArticle[]> {
    const rows = this.db
      .prepare<unknown[], ArticleDbRow>(
        `${ARTICLE_SELECT}
         WHERE a.notified_at IS NULL
           AND a.source_id IN (SELECT id FROM sources WHERE category = ?)
         ORDER BY COALESCE(a.published_at, a.fetched_at) DESC
         LIMIT ?`
      )
      .all(category, limit);

    return rows.map(toScoredArticle);
  }

  async saveScore(
    articleId: number,
    ruleScore: number,
    importance: string,
    scoredAt: string
  ): Promise<void> {
    this.saveScoreStmt.run(articleId, ruleScore, importance, scoredAt);
  }

  async findById(articleId: number): Promise<ScoredArticle | null> {
    const row = this.findByIdStmt.get(articleId);

    return row ? toScoredArticle(row) : null;
  }

  async list(filter: ArticleFilter): Promise<ScoredArticle[]> {
    const conditions: string[] = [];
    const params: (string | number)[] = [];

    if (filter.category) {
      conditions.push('a.source_id IN (SELECT id FROM sources WHERE category = ?)');
      params.push(filter.category);
    }
    if (filter.sourceId) {
      conditions.push('a.source_id = ?');
      params.push(filter.sourceId);
    }
    if (filter.importance) {
      conditions.push('s.importance = ?');
      params.push(filter.importance);
    }
    if (filter.from) {
      conditions.push("COALESCE(a.published_at, a.fetched_at) >= ?");
      params.push(filter.from);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const limit = Math.min(Math.max(filter.limit ?? 50, 1), 500);

    const rows = this.db
      .prepare<unknown[], ArticleDbRow>(
        `${ARTICLE_SELECT} ${where}
         ORDER BY COALESCE(a.published_at, a.fetched_at) DESC
         LIMIT ?`
      )
      .all(...params, limit);

    return rows.map(toScoredArticle);
  }
}

class SqliteSourceRepository implements SourceRepository {
  constructor(private readonly db: Db) {}

  async upsertMany(sources: SourceRow[], now: string): Promise<void> {
    const stmt = this.db.prepare(
      `INSERT INTO sources (id, name, type, category, url, enabled, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (id) DO UPDATE SET
         name       = excluded.name,
         type       = excluded.type,
         category   = excluded.category,
         url        = excluded.url,
         enabled    = excluded.enabled,
         updated_at = excluded.updated_at`
    );

    const runAll = this.db.transaction((rows: SourceRow[]) => {
      for (const row of rows) {
        stmt.run(row.id, row.name, row.type, row.category, row.url, row.enabled ? 1 : 0, now, now);
      }
    });

    runAll(sources);
  }

  async list(): Promise<SourceRow[]> {
    type Row = {
      id: string;
      name: string;
      type: string;
      category: string;
      url: string | null;
      enabled: number;
    };

    const rows = this.db
      .prepare<unknown[], Row>('SELECT id, name, type, category, url, enabled FROM sources ORDER BY category, name')
      .all();

    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      type: row.type as SourceType,
      category: row.category,
      url: row.url,
      enabled: row.enabled === 1,
    }));
  }
}

class SqliteJobRunRepository implements JobRunRepository {
  constructor(private readonly db: Db) {}

  async start(jobName: string, startedAt: string): Promise<number> {
    const result = this.db
      .prepare("INSERT INTO job_runs (job_name, started_at, status) VALUES (?, ?, 'running')")
      .run(jobName, startedAt);

    return Number(result.lastInsertRowid);
  }

  async finish(jobRunId: number, result: JobFinish): Promise<void> {
    this.db
      .prepare(
        `UPDATE job_runs
         SET finished_at = ?, status = ?, processed_count = ?, new_count = ?, error_message = ?
         WHERE id = ?`
      )
      .run(
        result.finishedAt,
        result.status,
        result.processedCount,
        result.newCount,
        result.errorMessage,
        jobRunId
      );
  }
}

export function createRepositories(db: Db): Repositories {
  return {
    articles: new SqliteArticleRepository(db),
    sources: new SqliteSourceRepository(db),
    jobRuns: new SqliteJobRunRepository(db),
  };
}
