/**
 * ランキング型の選抜。純関数のみ。
 *
 * 「新着を全部流す」per_source とは目的が違い、カテゴリ全体から上位だけを選ぶ。
 * 情報源を増やしても通知量が増えないため、購読先を足しやすくなる。
 *
 * 採点の考え方:
 *   1. 情報源内の順位を 0〜1 へ正規化する（1位が 1.0、最下位が 1/N）
 *   2. 情報源の重み（信頼度・ノイズの少なさ）を掛ける
 *   3. 同じ URL が複数の情報源に現れたら加点して束ねる
 *      （複数箇所で取り上げられている＝注目されている、という信号）
 */
import { tagPillars } from '../config/pillars.js';
import type { CategoryConfig, SourceConfig } from '../domain/source.js';
import type { CollectedEntry, Selection } from './notify.js';
import type { ArticleGroup, NotifiableArticle } from '../notifiers/blocks/articles.js';

/** 情報源が1つ増えるごとの加点。順位1位ぶんの価値を超えないよう 1.0 未満にする */
const CROSS_SOURCE_BONUS = 0.25;

type Bundle = {
  /** 束ねた中で最も評価の高い出現 */
  primary: CollectedEntry;
  entries: CollectedEntry[];
  sources: SourceConfig[];
  score: number;
  tags: string[];
};

/**
 * 重複判定用のキー。表示には使わない。
 *
 * normalize.ts が保存時にトラッキングパラメータを落としているため、
 * ここでは host の表記ゆれと末尾スラッシュだけを吸収すればよい。
 */
export function bundleKey(rawUrl: string): string {
  try {
    const url = new URL(rawUrl);
    url.protocol = 'https:';
    url.hostname = url.hostname.replace(/^www\./, '').toLowerCase();
    url.pathname = url.pathname.replace(/\/+$/, '');
    url.hash = '';
    return url.toString();
  } catch {
    return rawUrl.trim().toLowerCase();
  }
}

function publishedTime(entry: CollectedEntry): number {
  const article = entry.article;
  return new Date(article.publishedAt ?? article.fetchedAt).getTime();
}

/**
 * 情報源内での実効順位を決める。
 *
 * rank を持たない記事（順位の概念がない情報源、列追加前の既存行）は、
 * 同じ情報源の中で新しいものから順に並べて代用する。
 */
function effectiveRanks(entries: CollectedEntry[]): Map<CollectedEntry, number> {
  const result = new Map<CollectedEntry, number>();

  const bySource = new Map<string, CollectedEntry[]>();
  for (const entry of entries) {
    const list = bySource.get(entry.source.id) ?? [];
    list.push(entry);
    bySource.set(entry.source.id, list);
  }

  for (const list of bySource.values()) {
    const ranked = list.filter((entry) => entry.article.rank !== null);
    const unranked = list
      .filter((entry) => entry.article.rank === null)
      .sort((a, b) => publishedTime(b) - publishedTime(a));

    for (const entry of ranked) result.set(entry, entry.article.rank as number);
    // 順位を持つものの後ろへ並べる。両者が混ざるのは移行期だけ。
    const offset = ranked.length;
    for (const [index, entry] of unranked.entries()) result.set(entry, offset + index + 1);
  }

  return result;
}

/** 順位を 0〜1 へ。1件しかない情報源は最上位（1.0）として扱う */
function normalizedRankScore(rank: number, sourceSize: number): number {
  if (sourceSize <= 1) return 1;
  return Math.max(0, 1 - (rank - 1) / sourceSize);
}

function toNotifiable(bundle: Bundle): NotifiableArticle {
  const article = bundle.primary.article;

  return {
    id: article.id,
    title: article.title,
    url: article.url,
    publishedAt: article.publishedAt,
    importance: null,
    sourceNames: bundle.sources.map((source) => source.name),
    emoji: bundle.sources[0]?.emoji ?? ':newspaper:',
    tags: bundle.tags,
    score: bundle.score,
    detail: article.description,
  };
}

/** タグ判定に使う文字列。本文は持っていないのでタイトルと短い説明だけを見る */
function pillarText(bundle: Bundle): string {
  const article = bundle.primary.article;
  return [article.title, article.description ?? '', article.categories.join(' ')].join('\n');
}

/**
 * 4本柱に当たったものを優先し、残枠だけを無タグ（世間の話題）へ割く。
 * スコア順のまま切ると、点数は高いが発信に繋がらない一般ニュースが上位を占めるため。
 */
function allocateByPillar(bundles: Bundle[], limit: number, untaggedSlots: number): Bundle[] {
  const tagged = bundles.filter((bundle) => bundle.tags.length > 0);
  const untagged = bundles.filter((bundle) => bundle.tags.length === 0);

  const untaggedQuota = Math.min(untaggedSlots, Math.max(0, limit - tagged.length), untagged.length);

  return [...tagged.slice(0, limit - untaggedQuota), ...untagged.slice(0, untaggedQuota)];
}

/**
 * カテゴリ全体から上位 maxPerNotification 件を選ぶ。
 *
 * 選外の記事は excludedIds として返し、呼び出し側が既読化する。
 * 溜め続けると翌日以降の選抜を古い記事が圧迫するため、その回で判断を確定させる。
 */
export function selectRanking(category: CategoryConfig, entries: CollectedEntry[]): Selection {
  if (entries.length === 0) return { groups: [], excludedIds: [] };

  const maxPerSource = category.maxPerSource ?? Number.MAX_SAFE_INTEGER;
  const limit = category.maxPerNotification ?? Number.MAX_SAFE_INTEGER;

  const ranks = effectiveRanks(entries);
  const sourceSizes = new Map<string, number>();
  for (const entry of entries) {
    sourceSizes.set(entry.source.id, (sourceSizes.get(entry.source.id) ?? 0) + 1);
  }

  const excludedIds: number[] = [];

  // 情報源ごとの上限を先に効かせる。1つの多産な情報源が上位を占めるのを防ぐ。
  const perSourceCount = new Map<string, number>();
  const survivors: { entry: CollectedEntry; score: number }[] = [];

  const byRank = [...entries].sort((a, b) => (ranks.get(a) ?? 0) - (ranks.get(b) ?? 0));

  for (const entry of byRank) {
    const sourceId = entry.source.id;
    const used = perSourceCount.get(sourceId) ?? 0;

    if (used >= maxPerSource) {
      excludedIds.push(entry.article.id);
      continue;
    }
    perSourceCount.set(sourceId, used + 1);

    const rank = ranks.get(entry) ?? 1;
    const size = sourceSizes.get(sourceId) ?? 1;
    const weight = entry.source.weight ?? 1;

    survivors.push({ entry, score: normalizedRankScore(rank, size) * weight });
  }

  // 同じ URL を束ねる。複数の情報源に出たものを加点する。
  const bundles = new Map<string, Bundle>();

  for (const { entry, score } of survivors) {
    const key = bundleKey(entry.article.url);
    const existing = bundles.get(key);

    if (!existing) {
      bundles.set(key, { primary: entry, entries: [entry], sources: [entry.source], score, tags: [] });
      continue;
    }

    existing.entries.push(entry);
    if (!existing.sources.some((source) => source.id === entry.source.id)) {
      existing.sources.push(entry.source);
    }
    // 束ねた中の最高点を基準にする。低い方に引きずられないようにする。
    if (score > existing.score) {
      existing.score = score;
      existing.primary = entry;
    }
  }

  const scored = [...bundles.values()]
    .map((bundle) => ({
      ...bundle,
      score: bundle.score + CROSS_SOURCE_BONUS * (bundle.sources.length - 1),
      tags: category.pillars ? tagPillars(pillarText(bundle)) : [],
    }))
    .sort((a, b) => b.score - a.score || publishedTime(b.primary) - publishedTime(a.primary));

  const selected = category.pillars
    ? allocateByPillar(scored, limit, category.pillars.untaggedSlots)
    : scored.slice(0, limit);

  const chosen = new Set(selected);
  const dropped = scored.filter((bundle) => !chosen.has(bundle));

  for (const bundle of dropped) {
    for (const entry of bundle.entries) excludedIds.push(entry.article.id);
  }
  // 選ばれた束のうち、実際に通知するのは代表の1件だけ。残りは重複なので既読化する。
  for (const bundle of selected) {
    for (const entry of bundle.entries) {
      if (entry !== bundle.primary) excludedIds.push(entry.article.id);
    }
  }

  if (selected.length === 0) return { groups: [], excludedIds };

  // ランキングは情報源ではなく順位が主役なので、見出しを付けず1つの束として出す。
  const groups: ArticleGroup[] = [
    { emoji: ':chart_with_upwards_trend:', articles: selected.map(toNotifiable) },
  ];

  return { groups, excludedIds };
}
