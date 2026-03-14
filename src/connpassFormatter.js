/**
 * Connpass セミナー情報の Slack Block Kit フォーマッター
 */

const MAX_EVENTS = 10;

/**
 * 日時を日本時間の読みやすい形式に変換
 * @param {string} isoDate
 * @returns {string}
 */
function formatDateTime(isoDate) {
  if (!isoDate) return '日時未定';
  const d = new Date(isoDate);
  const weekday = ['日', '月', '火', '水', '木', '金', '土'][d.getDay()];
  return d.toLocaleString('ja-JP', {
    timeZone: 'Asia/Tokyo',
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }) + `(${weekday})`;
}

/**
 * 参加状況のテキストを生成
 * @param {{ accepted: number; limit: number; waiting: number }} event
 * @returns {string}
 */
function participantText(event) {
  const parts = [];
  if (event.limit > 0) {
    parts.push(`${event.accepted}/${event.limit}人`);
  } else {
    parts.push(`${event.accepted}人参加`);
  }
  if (event.waiting > 0) {
    parts.push(`補欠${event.waiting}人`);
  }
  return parts.join(' | ');
}

/**
 * イベント1件分のブロックを生成
 * @param {import('./connpass.js').ConnpassEvent} event
 * @param {number} [rank] - ランキング順位（指定時は順位を表示）
 * @returns {object[]}
 */
function buildEventBlocks(event, rank) {
  const prefix = rank != null ? `*#${rank}* ` : '';
  const titleText = `${prefix}*<${event.url}|${event.title}>*`;

  const meta = [];
  meta.push(`:calendar: ${formatDateTime(event.started_at)}`);
  if (event.place) {
    meta.push(`:round_pushpin: ${event.place}`);
  }
  meta.push(`:busts_in_silhouette: ${participantText(event)}`);
  if (event.group?.title) {
    meta.push(`:house: ${event.group.title}`);
  }

  return [
    {
      type: 'section',
      text: { type: 'mrkdwn', text: titleText },
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

/**
 * 直近イベント + 人気ランキングの Slack ペイロードを生成
 *
 * @param {import('./connpass.js').ConnpassEvent[]} upcoming - 直近イベント
 * @param {import('./connpass.js').ConnpassEvent[]} popular - 人気イベント（参加者数順）
 * @returns {{ text: string; blocks: object[] } | null}
 */
export function buildConnpassPayload(upcoming, popular) {
  if (upcoming.length === 0 && popular.length === 0) return null;

  const now = new Date().toLocaleString('ja-JP', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });

  const blocks = [
    {
      type: 'header',
      text: {
        type: 'plain_text',
        text: '🎓 Connpass セミナー情報',
        emoji: true,
      },
    },
    {
      type: 'context',
      elements: [
        {
          type: 'mrkdwn',
          text: `:clock1: 取得日時: ${now}`,
        },
      ],
    },
    { type: 'divider' },
  ];

  // 直近の新着イベント
  if (upcoming.length > 0) {
    const limited = upcoming.slice(0, MAX_EVENTS);
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `:new: *直近の新着セミナー*  _(${limited.length}件)_`,
      },
    });

    for (const event of limited) {
      blocks.push(...buildEventBlocks(event));
    }

    blocks.push({ type: 'divider' });
  }

  // 人気ランキング
  if (popular.length > 0) {
    // 直近イベントと重複するものは除外
    const upcomingIds = new Set(upcoming.map((e) => e.id));
    const uniquePopular = popular.filter((e) => !upcomingIds.has(e.id));
    const limited = uniquePopular.slice(0, MAX_EVENTS);

    if (limited.length > 0) {
      blocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `:trophy: *参加者数ランキング*  _(Top ${limited.length})_`,
        },
      });

      for (let i = 0; i < limited.length; i++) {
        blocks.push(...buildEventBlocks(limited[i], i + 1));
      }
    }
  }

  const safeBlocks = blocks.slice(0, 50);

  return {
    text: `🎓 Connpass セミナー情報: ${upcoming.length}件の新着、${popular.length}件の人気イベント`,
    blocks: safeBlocks,
  };
}
