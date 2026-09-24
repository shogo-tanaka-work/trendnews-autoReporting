/**
 * Connpass セミナー情報の Block Kit ペイロード生成。純関数のみ。
 */
import type { KnownBlock } from '@slack/web-api';
import type { ConnpassEvent } from '../../collectors/connpass.js';
import { formatJst, formatJstEvent } from '../../lib/datetime.js';

/**
 * 1イベント2ブロック。見出し4＋週末15件（30）＋近場の見出し2＋近場6件（12）で 48 ブロックになり、
 * Slack の上限 50 ブロックに収まる。
 */
const MAX_EVENTS = 15;
const MAX_NEARBY = 6;
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

export type ConnpassMessageInput = {
  /** 直近の週末（都内・オンライン） */
  weekend: ConnpassEvent[];
  /** 週末の条件に合う全件数 */
  weekendTotal: number;
  /** 中野近辺のオフライン（2週間） */
  nearby: ConnpassEvent[];
};

export function buildConnpassMessage(
  input: ConnpassMessageInput,
  now: Date
): { text: string; blocks: KnownBlock[] } | null {
  const limited = input.weekend.slice(0, MAX_EVENTS);
  const shownIds = new Set(limited.map((event) => event.id));
  // 週末の一覧に表示したものは近場の節で重ねて出さない（省略した分は近場の節に残す）
  const nearby = input.nearby.filter((event) => !shownIds.has(event.id)).slice(0, MAX_NEARBY);

  if (limited.length === 0 && nearby.length === 0) return null;

  const total = Math.max(input.weekendTotal, input.weekend.length);
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
        text:
          limited.length === 0
            ? ':calendar: *金〜日の開催*  _(該当なし)_'
            : `:calendar: *金〜日の開催*  _(${limited.length}件${omitted > 0 ? `、ほか${omitted}件は省略` : ''})_`,
      },
    },
  ];

  for (const event of limited) blocks.push(...eventBlocks(event));

  if (nearby.length > 0) {
    blocks.push(
      { type: 'divider' },
      { type: 'section', text: { type: 'mrkdwn', text: `:round_pushpin: *中野近辺のオフライン（2週間）*  _(${nearby.length}件)_` } }
    );
    for (const event of nearby) blocks.push(...eventBlocks(event));
  }

  return {
    text: `🎓 今週末のセミナー（都内・オンライン）: ${total}件 / 中野近辺: ${nearby.length}件`,
    blocks: blocks.slice(0, MAX_BLOCKS),
  };
}
