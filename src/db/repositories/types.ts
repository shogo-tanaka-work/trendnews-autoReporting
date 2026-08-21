/**
 * Repository の契約。Collector / Service 層はこの interface だけに依存する。
 * SQLite 実装は同期だが、D1 へ移せるよう全て Promise で返す。
 */
import type { Article, JobStatus, NewArticle, ScoredArticle, SourceType } from '../../domain/article.js';

export type SourceRow = {
  id: string;
  name: string;
  type: SourceType;
  category: string;
  url: string | null;
  enabled: boolean;
};

export type ArticleFilter = {
  category?: string | undefined;
  sourceId?: string | undefined;
  importance?: string | undefined;
  from?: string | undefined;
  limit?: number | undefined;
};

export type InsertResult = {
  inserted: Article[];
  duplicates: number;
};

export interface ArticleRepository {
  /** 既知の (source_id, external_id) は無視し、新規だけを返す */
  insertNew(articles: NewArticle[]): Promise<InsertResult>;
  markNotified(articleIds: number[], notifiedAt: string): Promise<void>;
  /** notified_at が NULL の記事（= 未通知）をカテゴリ単位で取得する */
  listPending(category: string, limit: number): Promise<ScoredArticle[]>;
  saveScore(articleId: number, ruleScore: number, importance: string, scoredAt: string): Promise<void>;
  findById(articleId: number): Promise<ScoredArticle | null>;
  list(filter: ArticleFilter): Promise<ScoredArticle[]>;
}

export interface SourceRepository {
  upsertMany(sources: SourceRow[], now: string): Promise<void>;
  list(): Promise<SourceRow[]>;
}

export type JobFinish = {
  status: JobStatus;
  processedCount: number;
  newCount: number;
  errorMessage: string | null;
  finishedAt: string;
};

export interface JobRunRepository {
  start(jobName: string, startedAt: string): Promise<number>;
  finish(jobRunId: number, result: JobFinish): Promise<void>;
}

export interface Repositories {
  articles: ArticleRepository;
  sources: SourceRepository;
  jobRuns: JobRunRepository;
}
