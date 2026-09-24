/**
 * 追いかけるキーワードの検索トレンドを取得し、昇格台帳と Slack へ出す。
 *
 * 記事ではなく「語の動き」なので articles テーブルには入れない。前週比は
 * 直近30日の推移から毎回計算できるため、過去の値も持たない（Connpass と同じ扱い）。
 */
import { GoogleTrendsKeywordCollector } from '../collectors/google-trends-keywords.js';
import { KEYWORD_GROUPS, MAX_RISING_QUERIES, NOTABLE_CHANGE_PCT } from '../config/keywords.js';
import type { JobStatus } from '../domain/article.js';
import { saveDigest, tokyoDate } from '../lib/archive.js';
import { logger, toErrorMessage } from '../lib/logger.js';
import { buildKeywordMessage } from '../notifiers/blocks/keywords.js';
import type { CollectDeps } from './collect.js';
import { renderKeywordDigest, weekOverWeek, type KeywordTrend } from './keyword-trend.js';

const DEFAULT_ARCHIVE_DIR = 'archive';

export type KeywordSummary = {
  keywords: number;
  failed: number;
  risingFailed: number;
  notified: boolean;
};

type Watched = { keyword: string; group: string };

/** 1語分を取得する。推移の失敗は語ごとの失敗、関連クエリの失敗は縮退（推移は出す） */
async function buildTrend(collector: GoogleTrendsKeywordCollector, watched: Watched): Promise<KeywordTrend> {
  const base = { keyword: watched.keyword, group: watched.group };

  let series;
  try {
    series = await collector.fetchTimeseries(watched.keyword);
  } catch (err) {
    const error = toErrorMessage(err);
    logger.error('キーワード推移の取得に失敗しました', { keyword: watched.keyword, error });
    return { ...base, recentAverage: 0, changePct: null, risingQueries: [], risingError: false, error };
  }

  const { recentAverage, changePct } = weekOverWeek(series);

  try {
    const rising = await collector.fetchRisingQueries(watched.keyword);
    return { ...base, recentAverage, changePct, risingQueries: rising.slice(0, MAX_RISING_QUERIES), risingError: false, error: null };
  } catch (err) {
    logger.warn('関連クエリの取得に失敗しました', { keyword: watched.keyword, error: toErrorMessage(err) });
    return { ...base, recentAverage, changePct, risingQueries: [], risingError: true, error: null };
  }
}

async function writeLedger(deps: CollectDeps, trends: KeywordTrend[]): Promise<void> {
  const date = tokyoDate(deps.now());
  try {
    const path = await saveDigest(deps.archiveDir ?? DEFAULT_ARCHIVE_DIR, date, renderKeywordDigest(date, trends), '-keywords');
    logger.info('キーワードの台帳を書き出しました', { path });
  } catch (err) {
    // 台帳は昇格作業の入口にすぎないので、書けなくても通知は続ける
    logger.error('キーワードの台帳の書き出しに失敗しました', { error: toErrorMessage(err) });
  }
}

export async function collectKeywordTrends(
  deps: CollectDeps,
  channelId: string | undefined
): Promise<KeywordSummary> {
  if (!deps.serpApiKey) throw new Error('SERPAPI_API_KEY が未設定です');

  const startedAt = deps.now();
  const jobRunId = await deps.repos.jobRuns.start('collect:keywords', startedAt.toISOString());

  let status: JobStatus = 'failed';
  let errorMessage: string | null = null;
  let processedCount = 0;

  try {
    const collector = new GoogleTrendsKeywordCollector(deps.serpApiKey);
    const watched = KEYWORD_GROUPS.flatMap((group) => group.keywords.map((keyword) => ({ keyword, group: group.label })));

    // SerpApi の時間あたり上限を気にして直列にする（1回の実行で語数×2 検索）
    const trends: KeywordTrend[] = [];
    for (const w of watched) trends.push(await buildTrend(collector, w));
    processedCount = trends.length;

    const failed = trends.filter((trend) => trend.error !== null).length;
    const risingFailed = trends.filter((trend) => trend.risingError).length;
    if (failed === trends.length) throw new Error('すべてのキーワードで推移の取得に失敗しました');

    // 再送の仕組みがないので、通知の成否に関わらず台帳は先に残す
    await writeLedger(deps, trends);

    const message = buildKeywordMessage(trends, NOTABLE_CHANGE_PCT, deps.now());
    let notified = false;

    if (message && channelId) {
      await deps.slack.post({ channel: channelId, text: message.text, blocks: message.blocks });
      notified = true;
    } else if (!channelId) {
      logger.warn('SLACK_CHANNEL_NETA_WEEKLY が未設定のため通知をスキップします');
    }

    const problems = [
      failed > 0 ? `${failed} 語で推移の取得に失敗` : null,
      risingFailed > 0 ? `${risingFailed} 語で関連クエリの取得に失敗` : null,
    ].filter((problem): problem is string => problem !== null);

    status = problems.length === 0 ? 'success' : 'partial';
    errorMessage = problems.length === 0 ? null : problems.join(' / ');

    logger.info('キーワードの取得を終了します', { keywords: trends.length, failed, risingFailed, notified });

    return { keywords: trends.length, failed, risingFailed, notified };
  } catch (err) {
    errorMessage = toErrorMessage(err).slice(0, 2000);
    throw new Error('キーワードトレンドの取得に失敗しました', { cause: err });
  } finally {
    await deps.repos.jobRuns.finish(jobRunId, {
      status,
      processedCount,
      newCount: 0,
      errorMessage,
      finishedAt: deps.now().toISOString(),
    });
  }
}
