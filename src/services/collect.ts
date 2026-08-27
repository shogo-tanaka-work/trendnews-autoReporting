/**
 * 収集のオーケストレーション。
 *
 * Hono も systemd も知らないこと。CLI（jobs/collect.ts）と
 * Hono の POST /admin/collect が同じ関数を呼ぶ。
 */
import { CATEGORIES, findCategory } from '../config/categories.js';
import { ConnpassCollector } from '../collectors/connpass.js';
import { GithubReleaseCollector } from '../collectors/github.js';
import { RankingCollector } from '../collectors/ranking/index.js';
import { RssCollector } from '../collectors/rss.js';
import { YoutubeCollector } from '../collectors/youtube.js';
import type { RawItem } from '../domain/article.js';
import type { CategoryConfig, SourceConfig } from '../domain/source.js';
import { sourceUrlOf } from '../domain/source.js';
import type { Repositories, SourceRow } from '../db/repositories/types.js';
import { saveDigest, tokyoDate } from '../lib/archive.js';
import { logger, toErrorMessage } from '../lib/logger.js';
import type { SlackNotifier } from '../notifiers/slack.js';
import type { NotifiableArticle } from '../notifiers/blocks/articles.js';
import { buildConnpassMessage } from '../notifiers/blocks/connpass.js';
import { dedupeByExternalId, toNewArticle } from './normalize.js';
import { renderDigest } from './digest.js';
import { notifyArticles, type CollectedEntry } from './notify.js';
import { scoreArticle } from './score.js';

export type CollectDeps = {
  repos: Repositories;
  slack: SlackNotifier;
  githubToken: string | undefined;
  youtubeApiKey: string | undefined;
  connpassApiKey: string | undefined;
  serpApiKey: string | undefined;
  /** カテゴリ設定の channelEnvKey から Slack チャンネル ID を解決する */
  channelFor: (envKey: string) => string | undefined;
  /** 昇格台帳の出力先。省略するとリポジトリ直下の archive/ を使う */
  archiveDir?: string;
  now: () => Date;
};

export type SourceOutcome = {
  sourceId: string;
  fetched: number;
  inserted: number;
  duplicates: number;
  error: string | null;
};

export type CategorySummary = {
  category: string;
  fetched: number;
  newCount: number;
  duplicates: number;
  notifiedCount: number;
  errors: string[];
  durationMs: number;
};

function toSourceRow(category: CategoryConfig, source: SourceConfig): SourceRow {
  return {
    id: source.id,
    name: source.name,
    type: source.type,
    category: category.key,
    url: sourceUrlOf(source),
    enabled: true,
  };
}

/** 情報源の種類ごとに Collector を選ぶ。未設定の API キーはここで検出する。 */
function makeFetcher(deps: CollectDeps): (source: SourceConfig) => Promise<RawItem[]> {
  const rss = new RssCollector();
  const github = new GithubReleaseCollector(deps.githubToken);
  const youtube = deps.youtubeApiKey ? new YoutubeCollector(deps.youtubeApiKey) : null;
  const ranking = new RankingCollector(
    {
      githubToken: deps.githubToken,
      youtubeApiKey: deps.youtubeApiKey,
      serpApiKey: deps.serpApiKey,
    },
    deps.now
  );

  return async (source) => {
    switch (source.type) {
      case 'rss':
        return rss.collect(source);
      case 'github':
        return github.collect(source);
      case 'youtube':
        if (!youtube) throw new Error('YOUTUBE_API_KEY が未設定のため YouTube を収集できません');
        return youtube.collect(source);
      case 'ranking':
        return ranking.collect(source);
    }
  };
}

async function collectSource(
  deps: CollectDeps,
  fetchItems: (source: SourceConfig) => Promise<RawItem[]>,
  source: SourceConfig,
  fetchedAt: string
): Promise<{ outcome: SourceOutcome }> {
  try {
    const items = await fetchItems(source);

    const candidates = dedupeByExternalId(
      items
        .map((item) => toNewArticle(source.id, item, fetchedAt))
        .filter((article): article is NonNullable<typeof article> => article !== null)
    );

    const { inserted, duplicates } = await deps.repos.articles.insertNew(candidates);

    for (const article of inserted) {
      const result = scoreArticle(article);
      await deps.repos.articles.saveScore(article.id, result.score, result.importance, fetchedAt);
    }

    return {
      outcome: {
        sourceId: source.id,
        fetched: items.length,
        inserted: inserted.length,
        duplicates,
        error: null,
      },
    };
  } catch (err) {
    // 1ソースの失敗で他ソースを止めない（要件 17章）
    const message = toErrorMessage(err);
    logger.error('情報源の収集に失敗しました', { source: source.id, error: message });

    return {
      outcome: { sourceId: source.id, fetched: 0, inserted: 0, duplicates: 0, error: message },
    };
  }
}

/** 1回の通知で扱う未通知記事の上限。初回や長期停止からの復帰で溢れないようにする。 */
const PENDING_LIMIT = 2000;

/**
 * 未通知の記事を通知対象へ組み立てる。
 *
 * 「今回挿入した分」ではなく「未通知の全件」を対象にすることで、
 * Slack 送信に失敗した記事が次回実行で再送される。
 * 設定から外された情報源の記事は対象にできないため、ここで処理済みにする。
 */
async function buildPendingEntries(
  deps: CollectDeps,
  category: CategoryConfig
): Promise<{ entries: CollectedEntry[]; orphanIds: number[] }> {
  const pending = await deps.repos.articles.listPending(category.key, PENDING_LIMIT);

  const entries: CollectedEntry[] = [];
  const orphanIds: number[] = [];

  for (const article of pending) {
    const source = category.sources.find((candidate) => article.sourceId === candidate.id);
    if (!source) {
      orphanIds.push(article.id);
      continue;
    }

    entries.push({
      article,
      source,
      ruleScore: article.score?.ruleScore ?? 0,
      importance: article.score?.importance ?? null,
    });
  }

  return { entries, orphanIds };
}

const DEFAULT_ARCHIVE_DIR = 'archive';

/**
 * 昇格台帳を書き出す。
 * 失敗しても収集と通知は成立しているので、縮退させて収集自体は成功のままにする。
 */
async function writeDigest(
  deps: CollectDeps,
  category: CategoryConfig,
  articles: NotifiableArticle[],
  stats: { fetched: number; newCount: number }
): Promise<void> {
  const date = tokyoDate(deps.now());

  try {
    const markdown = renderDigest({ date, label: category.label, articles, stats });
    const path = await saveDigest(deps.archiveDir ?? DEFAULT_ARCHIVE_DIR, date, markdown);

    logger.info('昇格台帳を書き出しました', { job: `collect:${category.key}`, path });
  } catch (err) {
    logger.error('昇格台帳の書き出しに失敗しました', {
      job: `collect:${category.key}`,
      error: toErrorMessage(err),
    });
  }
}

export async function collectCategory(deps: CollectDeps, category: CategoryConfig): Promise<CategorySummary> {
  const startedAt = deps.now();
  const fetchedAt = startedAt.toISOString();
  const jobName = `collect:${category.key}`;

  logger.info('収集を開始します', { job: jobName, sources: category.sources.length });

  const jobRunId = await deps.repos.jobRuns.start(jobName, fetchedAt);
  await deps.repos.sources.upsertMany(
    category.sources.map((source) => toSourceRow(category, source)),
    fetchedAt
  );

  const fetchItems = makeFetcher(deps);

  const settled = await Promise.allSettled(
    category.sources.map((source) => collectSource(deps, fetchItems, source, fetchedAt))
  );

  const outcomes: SourceOutcome[] = [];

  for (const [index, result] of settled.entries()) {
    if (result.status === 'fulfilled') {
      outcomes.push(result.value.outcome);
      continue;
    }

    const sourceId = category.sources[index]?.id ?? 'unknown';
    outcomes.push({
      sourceId,
      fetched: 0,
      inserted: 0,
      duplicates: 0,
      error: toErrorMessage(result.reason),
    });
  }

  const errors = outcomes.filter((o) => o.error !== null).map((o) => `${o.sourceId}: ${o.error}`);
  const fetched = outcomes.reduce((sum, o) => sum + o.fetched, 0);
  const newCount = outcomes.reduce((sum, o) => sum + o.inserted, 0);
  const duplicates = outcomes.reduce((sum, o) => sum + o.duplicates, 0);

  let notifiedCount = 0;
  const channelId = deps.channelFor(category.channelEnvKey);
  const { entries, orphanIds } = await buildPendingEntries(deps, category);

  if (orphanIds.length > 0) {
    // 設定から外された情報源の記事は通知先が決まらないので処理済みにする
    logger.info('設定にない情報源の未通知記事を処理済みにします', {
      job: jobName,
      count: orphanIds.length,
    });
    await deps.repos.articles.markNotified(orphanIds, deps.now().toISOString());
  }

  if (entries.length === 0) {
    logger.info('新着がないため通知をスキップします', { job: jobName });
  } else if (!channelId) {
    logger.warn('Slack チャンネル未設定のため通知をスキップします', {
      job: jobName,
      envKey: category.channelEnvKey,
      pending: entries.length,
    });
  } else {
    const result = await notifyArticles(
      {
        slack: deps.slack,
        markNotified: (ids, at) => deps.repos.articles.markNotified(ids, at),
        now: deps.now,
      },
      category,
      channelId,
      entries
    );
    notifiedCount = result.notifiedCount;

    // 台帳は通知できた分だけ残す。送信前に書くと、失敗して再送された回で
    // 同じ日の台帳を二度書くことになる
    if (category.archiveDigest && result.notified.length > 0) {
      await writeDigest(deps, category, result.notified, { fetched, newCount });
    }
  }

  const finishedAt = deps.now();
  const durationMs = finishedAt.getTime() - startedAt.getTime();

  const status = errors.length === 0 ? 'success' : errors.length === category.sources.length ? 'failed' : 'partial';

  await deps.repos.jobRuns.finish(jobRunId, {
    status,
    processedCount: fetched,
    newCount,
    errorMessage: errors.length > 0 ? errors.join(' / ').slice(0, 2000) : null,
    finishedAt: finishedAt.toISOString(),
  });

  logger.info('収集を終了します', {
    job: jobName,
    status,
    fetched,
    newCount,
    duplicates,
    notifiedCount,
    errorCount: errors.length,
    durationMs,
  });

  return { category: category.key, fetched, newCount, duplicates, notifiedCount, errors, durationMs };
}

/** カテゴリを直列に処理する（SQLite の書き込み競合と外部 API への負荷を避けるため） */
export async function collectAll(deps: CollectDeps): Promise<CategorySummary[]> {
  const summaries: CategorySummary[] = [];
  for (const category of CATEGORIES) {
    summaries.push(await collectCategory(deps, category));
  }
  return summaries;
}

export async function collectByKey(deps: CollectDeps, categoryKey: string): Promise<CategorySummary> {
  const category = findCategory(categoryKey);
  if (!category) throw new Error(`未知のカテゴリです: ${categoryKey}`);
  return collectCategory(deps, category);
}

export type ConnpassSummary = {
  upcoming: number;
  popular: number;
  notified: boolean;
};

/**
 * Connpass はイベント情報であり articles とはライフサイクルが異なるため、
 * DB へは入れずその回の内容をそのまま通知する（現行仕様の維持）。
 */
export async function collectConnpass(
  deps: CollectDeps,
  keywords: string[],
  channelId: string | undefined
): Promise<ConnpassSummary> {
  if (!deps.connpassApiKey) throw new Error('CONNPASS_API_KEY が未設定です');

  const startedAt = deps.now();
  const jobRunId = await deps.repos.jobRuns.start('collect:connpass', startedAt.toISOString());

  try {
    const collector = new ConnpassCollector(deps.connpassApiKey);
    const upcoming = await collector.fetchUpcomingEvents(keywords, startedAt);
    const popular = await collector.fetchPopularEvents(keywords, startedAt);

    const message = buildConnpassMessage(upcoming, popular, deps.now());
    let notified = false;

    if (message && channelId) {
      await deps.slack.post({ channel: channelId, text: message.text, blocks: message.blocks });
      notified = true;
    } else if (!channelId) {
      logger.warn('SLACK_CHANNEL_CONNPASS が未設定のため通知をスキップします');
    }

    await deps.repos.jobRuns.finish(jobRunId, {
      status: 'success',
      processedCount: upcoming.length + popular.length,
      newCount: upcoming.length,
      errorMessage: null,
      finishedAt: deps.now().toISOString(),
    });

    logger.info('Connpass の収集を終了します', {
      upcoming: upcoming.length,
      popular: popular.length,
      notified,
    });

    return { upcoming: upcoming.length, popular: popular.length, notified };
  } catch (err) {
    const message = toErrorMessage(err);
    await deps.repos.jobRuns.finish(jobRunId, {
      status: 'failed',
      processedCount: 0,
      newCount: 0,
      errorMessage: message.slice(0, 2000),
      finishedAt: deps.now().toISOString(),
    });
    throw new Error('Connpass の収集に失敗しました', { cause: err });
  }
}
