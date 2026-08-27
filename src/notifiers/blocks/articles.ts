/**
 * 記事通知の Block Kit ペイロード生成。純関数のみ（Slack API を呼ばない）。
 *
 * Slack の 1 メッセージあたりブロック上限は 50。旧実装は超過分を切り捨てていたが、
 * 取りこぼしを避けるため複数メッセージへ分割する。
 * どの記事がどのメッセージに載ったかを articleIds で返し、送信成功分だけ既読化する。
 */
import type { KnownBlock } from '@slack/web-api';
import type { Importance } from '../../domain/article.js';
import { formatJst } from '../../lib/datetime.js';
import { IMPORTANCE_EMOJI } from '../../services/score.js';

/** 1メッセージあたりのブロック上限（50）に対する安全域 */
const MAX_BLOCKS_PER_MESSAGE = 46;

export type NotifiableArticle = {
  id: number;
  title: string;
  url: string;
  publishedAt: string | null;
  importance: Importance | null;
  /**
   * 記事ごとに出典を示したいときに使う（ランキング型）。
   * 情報源ごとに見出しを立てる per_source では不要なので省略する。
   */
  sourceNames?: string[];
  emoji?: string;
  /** 発信4本柱のタグ。付いていれば context 行へ出す */
  tags?: string[];
  /** ランキング選抜のスコア（0〜1）。ダイジェストの並び順の根拠として残す */
  score?: number;
  /** 注目度と分類（"1,234 users ｜ テクノロジー"）。ダイジェストで出典の補足に使う */
  detail?: string | null;
};

export type ArticleGroup = {
  /** 省略すると情報源の見出しを出さない。順位が主役のランキング型で使う */
  sourceName?: string;
  emoji: string;
  articles: NotifiableArticle[];
};

export type SlackMessage = {
  text: string;
  blocks: KnownBlock[];
  articleIds: number[];
};

function linkedTitle(article: NotifiableArticle): string {
  const badge = article.importance ? `${IMPORTANCE_EMOJI[article.importance]} ` : '';
  return `${badge}*<${article.url}|${article.title}>*`;
}

/** 日時と、あれば出典を1行にまとめる */
function contextText(article: NotifiableArticle): string {
  const parts = [`:calendar: ${formatJst(article.publishedAt)}`];

  if (article.sourceNames && article.sourceNames.length > 0) {
    const emoji = article.emoji ? `${article.emoji} ` : '';
    parts.push(`${emoji}${article.sourceNames.join(' + ')}`);
  }

  if (article.tags && article.tags.length > 0) {
    parts.push(`\`${article.tags.join('/')}\``);
  }

  return parts.join('　|　');
}

function articleBlocks(article: NotifiableArticle): KnownBlock[] {
  return [
    {
      type: 'section',
      text: { type: 'mrkdwn', text: linkedTitle(article) },
      accessory: {
        type: 'button',
        text: { type: 'plain_text', text: '記事を開く', emoji: false },
        url: article.url,
        action_id: `open_article_${article.id}`,
      },
    },
    {
      type: 'context',
      elements: [{ type: 'mrkdwn', text: contextText(article) }],
    },
  ];
}

function groupHeader(group: ArticleGroup): KnownBlock | null {
  if (group.sourceName === undefined) return null;

  return {
    type: 'section',
    text: { type: 'mrkdwn', text: `${group.emoji} *${group.sourceName}*  _(${group.articles.length}件)_` },
  };
}

function groupBlocks(group: ArticleGroup): KnownBlock[] {
  const header = groupHeader(group);
  const body = group.articles.flatMap(articleBlocks);

  return header ? [header, ...body] : body;
}

function headerBlocks(label: string, totalCount: number, now: Date): KnownBlock[] {
  return [
    {
      type: 'header',
      text: { type: 'plain_text', text: `📰 ${label}`, emoji: true },
    },
    {
      type: 'context',
      elements: [
        {
          type: 'mrkdwn',
          text: `:clock1: 取得日時: ${formatJst(now.toISOString())}　|　新着 *${totalCount}件*`,
        },
      ],
    },
    { type: 'divider' },
  ];
}

/**
 * グループ群を 50 ブロック以内のメッセージへ分割する。
 * 1グループが単独で上限を超える場合はグループ内でも分割する。
 */
export function buildArticleMessages(label: string, groups: ArticleGroup[], now: Date): SlackMessage[] {
  const populated = groups.filter((group) => group.articles.length > 0);
  const totalCount = populated.reduce((sum, group) => sum + group.articles.length, 0);
  if (totalCount === 0) return [];

  const messages: SlackMessage[] = [];

  let blocks: KnownBlock[] = headerBlocks(label, totalCount, now);
  let articleIds: number[] = [];

  const flush = (): void => {
    if (articleIds.length === 0) return;
    const trailing = blocks[blocks.length - 1];
    messages.push({
      text: `📰 ${label}: ${articleIds.length}件の新着`,
      blocks: trailing?.type === 'divider' ? blocks.slice(0, -1) : blocks,
      articleIds,
    });
    blocks = [];
    articleIds = [];
  };

  for (const group of populated) {
    const candidate = groupBlocks(group);

    // グループ単位で入りきらない場合は記事単位で詰める
    if (candidate.length > MAX_BLOCKS_PER_MESSAGE) {
      // 見出しがあるグループは、分割後の各メッセージにも同じ見出しを付ける
      const header = groupHeader(group);
      const newChunk = (): KnownBlock[] => (header ? [header] : []);
      let chunk = newChunk();

      for (const article of group.articles) {
        const pair = articleBlocks(article);
        if (blocks.length + chunk.length + pair.length > MAX_BLOCKS_PER_MESSAGE) {
          blocks.push(...chunk);
          flush();
          chunk = newChunk();
        }
        chunk.push(...pair);
        articleIds.push(article.id);
      }

      blocks.push(...chunk, { type: 'divider' });
      continue;
    }

    if (blocks.length + candidate.length > MAX_BLOCKS_PER_MESSAGE) flush();

    blocks.push(...candidate, { type: 'divider' });
    articleIds.push(...group.articles.map((article) => article.id));
  }

  flush();

  return messages;
}
