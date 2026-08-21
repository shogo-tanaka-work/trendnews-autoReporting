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
 * 通知対象の選別。純関数。
 *
 * - useScoring のカテゴリは minScore 未満を除外し、スコア降順で並べる
 * - それ以外は現行どおり全件を発行日時の降順で並べる
 * - maxPerSource を超える分は除外する
 */
export function selectForNotification(category: CategoryConfig, entries: CollectedEntry[]): Selection {
  const groups: ArticleGroup[] = [];
  const excludedIds: number[] = [];
  const maxPerSource = category.maxPerSource ?? Number.MAX_SAFE_INTEGER;
  const minScore = category.minScore ?? Number.NEGATIVE_INFINITY;

  for (const source of category.sources) {
    const ofSource = entries.filter((entry) => entry.source.id === source.id);
    if (ofSource.length === 0) continue;

    const kept = category.useScoring
      ? ofSource.filter((entry) => entry.ruleScore >= minScore)
      : [...ofSource];

    for (const entry of ofSource) {
      if (!kept.includes(entry)) excludedIds.push(entry.article.id);
    }

    kept.sort((a, b) =>
      category.useScoring ? b.ruleScore - a.ruleScore : publishedDesc(a.article, b.article)
    );

    const shown = kept.slice(0, maxPerSource);
    for (const entry of kept.slice(maxPerSource)) excludedIds.push(entry.article.id);

    if (shown.length === 0) continue;

    groups.push({
      sourceName: source.name,
      emoji: source.emoji ?? ':newspaper:',
      articles: shown.map((entry) => toNotifiable(entry, category.useScoring)),
    });
  }

  return { groups, excludedIds };
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
