/**
 * 収集した新着記事を Slack へ通知する。
 *
 * 送信に成功したメッセージに含まれる記事だけを既読化する。
 * 送信失敗時は notified_at を更新しないため、次回実行で再送される。
 */
import type { Article, Importance } from '../domain/article.js';
import type { CategoryConfig, SourceConfig } from '../domain/source.js';
import { logger, toErrorMessage } from '../lib/logger.js';
import { buildArticleMessages, type ArticleGroup, type NotifiableArticle } from '../notifiers/blocks/articles.js';
import type { SlackNotifier } from '../notifiers/slack.js';
import { selectRanking } from './select-ranking.js';

export type CollectedEntry = {
  article: Article;
  source: SourceConfig;
  ruleScore: number;
  importance: Importance | null;
};

export type Selection = {
  /** 通知するグループ（カテゴリの情報源の並び順を保つ） */
  groups: ArticleGroup[];
  /** スコア不足などで通知対象外になった記事 */
  excludedIds: number[];
};

function publishedDesc(a: Article, b: Article): number {
  return new Date(b.publishedAt ?? b.fetchedAt).getTime() - new Date(a.publishedAt ?? a.fetchedAt).getTime();
}

function toNotifiable(entry: CollectedEntry, showImportance: boolean): NotifiableArticle {
  return {
    id: entry.article.id,
    title: entry.article.title,
    url: entry.article.url,
    publishedAt: entry.article.publishedAt,
    importance: showImportance ? entry.importance : null,
  };
}

/**
 * 情報源ごとに束ねる選別。純関数。
 *
 * - selector: 'scoring' のカテゴリは minScore 未満を除外し、スコア降順で並べる
 * - それ以外は全件を発行日時の降順で並べる
 * - maxPerSource を超える分と、maxPerNotification に収まらない分は除外する
 */
export function selectPerSource(category: CategoryConfig, entries: CollectedEntry[]): Selection {
  const excludedIds: number[] = [];
  const maxPerSource = category.maxPerSource ?? Number.MAX_SAFE_INTEGER;
  const minScore = category.minScore ?? Number.NEGATIVE_INFINITY;
  const useScoring = category.selector === 'scoring';

  const rank = (a: CollectedEntry, b: CollectedEntry): number =>
    useScoring ? b.ruleScore - a.ruleScore : publishedDesc(a.article, b.article);

  /** 情報源の並び順を保ったまま、情報源ごとの採用分を集める */
  const perSource: { source: SourceConfig; shown: CollectedEntry[] }[] = [];

  for (const source of category.sources) {
    const ofSource = entries.filter((entry) => entry.source.id === source.id);
    if (ofSource.length === 0) continue;

    const kept = useScoring ? ofSource.filter((entry) => entry.ruleScore >= minScore) : [...ofSource];

    for (const entry of ofSource) {
      if (!kept.includes(entry)) excludedIds.push(entry.article.id);
    }

    kept.sort(rank);

    const shown = kept.slice(0, maxPerSource);
    for (const entry of kept.slice(maxPerSource)) excludedIds.push(entry.article.id);

    if (shown.length > 0) perSource.push({ source, shown });
  }

  // カテゴリ全体の上限を、情報源をまたいで評価の高い順に適用する。
  // 情報源ごとの上限だけでは、情報源を増やすたびに通知量が増えてしまう。
  const limit = category.maxPerNotification ?? Number.MAX_SAFE_INTEGER;
  const all = perSource.flatMap(({ shown }) => shown);
  const survivors = new Set([...all].sort(rank).slice(0, limit));

  for (const entry of all) {
    if (!survivors.has(entry)) excludedIds.push(entry.article.id);
  }

  const groups: ArticleGroup[] = [];

  for (const { source, shown } of perSource) {
    const articles = shown.filter((entry) => survivors.has(entry));
    if (articles.length === 0) continue;

    groups.push({
      sourceName: source.name,
      emoji: source.emoji ?? ':newspaper:',
      articles: articles.map((entry) => toNotifiable(entry, useScoring)),
    });
  }

  return { groups, excludedIds };
}

/**
 * カテゴリの selector に応じて選別方法を切り替える。
 * ranking だけ別モジュールなのは、URL の束ね直しという別の関心事だから。
 */
export function selectForNotification(category: CategoryConfig, entries: CollectedEntry[]): Selection {
  return category.selector === 'ranking'
    ? selectRanking(category, entries)
    : selectPerSource(category, entries);
}

export type NotifyDeps = {
  slack: SlackNotifier;
  markNotified: (articleIds: number[], notifiedAt: string) => Promise<void>;
  now: () => Date;
};

export type NotifyResult = {
  notifiedCount: number;
  failedMessages: number;
};

export async function notifyArticles(
  deps: NotifyDeps,
  category: CategoryConfig,
  channelId: string,
  entries: CollectedEntry[]
): Promise<NotifyResult> {
  const now = deps.now();
  const { groups, excludedIds } = selectForNotification(category, entries);

  // 通知対象外の記事は再判定しないため、同じタイムスタンプで処理済みにする
  await deps.markNotified(excludedIds, now.toISOString());

  const messages = buildArticleMessages(category.label, groups, now);

  let notifiedCount = 0;
  let failedMessages = 0;

  for (const message of messages) {
    try {
      await deps.slack.post({ channel: channelId, text: message.text, blocks: message.blocks });
      await deps.markNotified(message.articleIds, deps.now().toISOString());
      notifiedCount += message.articleIds.length;
    } catch (err) {
      // 通知は縮退可能な失敗として扱い、収集自体は成功扱いのまま次回再送する
      failedMessages += 1;
      logger.error('Slack への送信に失敗しました', {
        category: category.key,
        articles: message.articleIds.length,
        error: toErrorMessage(err),
      });
    }
  }

  return { notifiedCount, failedMessages };
}
