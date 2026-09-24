/**
 * Connpass セミナー情報の Block Kit ペイロード生成。純関数のみ。
 */
import type { KnownBlock } from '@slack/web-api';
import type { ConnpassEvent } from '../../collectors/connpass.js';
import { formatJst, formatJstEvent } from '../../lib/datetime.js';

/** 1イベント2ブロック＋見出し4ブロックで、Slack の上限 50 ブロックに収まる件数 */
const MAX_EVENTS = 20;
const MAX_BLOCKS = 50;

function participantText(event: ConnpassEvent): string {
  const accepted = event.accepted ?? 0;
  const limit = event.limit ?? 0;
  const waiting = event.waiting ?? 0;

  const parts = [limit > 0 ? `${accepted}/${limit}人` : `${accepted}人参加`];
  if (waiting > 0) parts.push(`補欠${waiting}人`);

  return parts.join(' | ');
}

function eventBlocks(event: ConnpassEvent): KnownBlock[] {
  const meta = [`:calendar: ${formatJstEvent(event.started_at)}`];
  if (event.place) meta.push(`:round_pushpin: ${event.place}`);
  meta.push(`:busts_in_silhouette: ${participantText(event)}`);
  if (event.group?.title) meta.push(`:house: ${event.group.title}`);

  return [
    {
      type: 'section',
      text: { type: 'mrkdwn', text: `*<${event.url}|${event.title}>*` },
      accessory: {
        type: 'button',
        text: { type: 'plain_text', text: '詳細を見る', emoji: false },
        url: event.url,
        action_id: `connpass_${event.id}`,
      },
    },
    {
      type: 'context',
      elements: [{ type: 'mrkdwn', text: meta.join('　') }],
    },
  ];
}

export function buildConnpassMessage(
  events: ConnpassEvent[],
  totalAvailable: number,
  now: Date
): { text: string; blocks: KnownBlock[] } | null {
  if (events.length === 0) return null;

  const limited = events.slice(0, MAX_EVENTS);
  const total = Math.max(totalAvailable, events.length);
  const omitted = total - limited.length;

  const blocks: KnownBlock[] = [
    { type: 'header', text: { type: 'plain_text', text: '🎓 今週末のセミナー（都内・オンライン）', emoji: true } },
    {
      type: 'context',
      elements: [{ type: 'mrkdwn', text: `:clock1: 取得日時: ${formatJst(now.toISOString())}` }],
    },
    { type: 'divider' },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `:calendar: *金〜日の開催*  _(${limited.length}件${omitted > 0 ? `、ほか${omitted}件は省略` : ''})_`,
      },
    },
  ];

  for (const event of limited) blocks.push(...eventBlocks(event));

  return {
    text: `🎓 今週末のセミナー（都内・オンライン）: ${total}件`,
    blocks: blocks.slice(0, MAX_BLOCKS),
  };
}
