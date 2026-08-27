/**
 * 収集した情報の共通形式。情報源（RSS / GitHub / YouTube / API）の差はここで吸収する。
 * Node.js / SQLite / Hono のいずれにも依存しないこと。
 */

export type SourceType = 'rss' | 'github' | 'youtube' | 'ranking' | 'api';

export type Importance = 'A' | 'B' | 'C';

/** Collector が返す、正規化前の生データ */
export type RawItem = {
  externalId: string;
  title: string;
  url: string;
  /** 情報源内での掲載順（1 始まり）。順位の概念を持たない情報源では省略する */
  rank?: number | undefined;
  description?: string | undefined;
  publishedAt?: string | undefined;
  author?: string | undefined;
  categories?: string[] | undefined;
};

/** DB へ保存する直前の形 */
export type NewArticle = {
  sourceId: string;
  externalId: string;
  title: string;
  url: string;
  rank: number | null;
  description: string | null;
  publishedAt: string | null;
  fetchedAt: string;
  categories: string[];
};

/** DB から読み出した形 */
export type Article = NewArticle & {
  id: number;
  notifiedAt: string | null;
  createdAt: string;
};

export type ArticleScore = {
  articleId: number;
  ruleScore: number;
  importance: Importance;
  llmReason: string | null;
  shouldReadNow: boolean | null;
  scoredAt: string;
};

export type ScoredArticle = Article & { score: ArticleScore | null };

export type JobStatus = 'running' | 'success' | 'partial' | 'failed';

export type JobRun = {
  id: number;
  jobName: string;
  startedAt: string;
  finishedAt: string | null;
  status: JobStatus;
  processedCount: number;
  newCount: number;
  errorMessage: string | null;
};
