/**
 * Connpass セミナー情報の Block Kit ペイロード生成。純関数のみ。
 * 現行実装（src/connpassFormatter.js）の見た目を維持している。
 */
import type { KnownBlock } from '@slack/web-api';
import type { ConnpassEvent } from '../../collectors/connpass.js';
import { formatJst, formatJstEvent } from '../../lib/datetime.js';

const MAX_EVENTS = 10;
const MAX_BLOCKS = 50;

function participantText(event: ConnpassEvent): string {
  const accepted = event.accepted ?? 0;
  const limit = event.limit ?? 0;
  const waiting = event.waiting ?? 0;

  const parts = [limit > 0 ? `${accepted}/${limit}人` : `${accepted}人参加`];
  if (waiting > 0) parts.push(`補欠${waiting}人`);

  return parts.join(' | ');
}

function eventBlocks(event: ConnpassEvent, rank?: number): KnownBlock[] {
  const prefix = rank === undefined ? '' : `*#${rank}* `;

  const meta = [`:calendar: ${formatJstEvent(event.started_at)}`];
  if (event.place) meta.push(`:round_pushpin: ${event.place}`);
  meta.push(`:busts_in_silhouette: ${participantText(event)}`);
  if (event.group?.title) meta.push(`:house: ${event.group.title}`);

  return [
    {
      type: 'section',
      text: { type: 'mrkdwn', text: `${prefix}*<${event.url}|${event.title}>*` },
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
  upcoming: ConnpassEvent[],
  popular: ConnpassEvent[],
  now: Date
): { text: string; blocks: KnownBlock[] } | null {
  if (upcoming.length === 0 && popular.length === 0) return null;

  const blocks: KnownBlock[] = [
    { type: 'header', text: { type: 'plain_text', text: '🎓 Connpass セミナー情報', emoji: true } },
    {
      type: 'context',
      elements: [{ type: 'mrkdwn', text: `:clock1: 取得日時: ${formatJst(now.toISOString())}` }],
    },
    { type: 'divider' },
  ];

  if (upcoming.length > 0) {
    const limited = upcoming.slice(0, MAX_EVENTS);
    blocks.push({
      type: 'section',
      text: { type: 'mrkdwn', text: `:new: *直近の新着セミナー*  _(${limited.length}件)_` },
    });
    for (const event of limited) blocks.push(...eventBlocks(event));
    blocks.push({ type: 'divider' });
  }

  if (popular.length > 0) {
    // 直近イベントと重複するものは除外する
    const upcomingIds = new Set(upcoming.map((event) => event.id));
    const limited = popular.filter((event) => !upcomingIds.has(event.id)).slice(0, MAX_EVENTS);

    if (limited.length > 0) {
      blocks.push({
        type: 'section',
        text: { type: 'mrkdwn', text: `:trophy: *参加者数ランキング*  _(Top ${limited.length})_` },
      });
      limited.forEach((event, index) => blocks.push(...eventBlocks(event, index + 1)));
    }
  }

  return {
    text: `🎓 Connpass セミナー情報: ${upcoming.length}件の新着、${popular.length}件の人気イベント`,
    blocks: blocks.slice(0, MAX_BLOCKS),
  };
}
