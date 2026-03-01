const FEED_EMOJI = {
  'OpenAI News': ':robot_face:',
  'Qiita (LLM)': ':green_book:',
  'Note (LLM)': ':memo:',
};

const MAX_ARTICLES_PER_FEED = 5;

/**
 * 日時を日本時間の読みやすい形式に変換
 * @param {string} isoDate
 * @returns {string}
 */
function formatDate(isoDate) {
  if (!isoDate) return '日時不明';
  return new Date(isoDate).toLocaleString('ja-JP', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * タイトルを Slack の mrkdwn リンク形式に変換
 * @param {string} title
 * @param {string} link
 * @returns {string}
 */
function linkedTitle(title, link) {
  if (!link) return `*${title}*`;
  return `*<${link}|${title}>*`;
}

/**
 * フィードごとの Block Kit ブロック群を生成する
 *
 * @param {string} feedName
 * @param {{ title: string; link: string; isoDate: string }[]} articles
 * @returns {object[]}
 */
function buildFeedBlocks(feedName, articles) {
  const emoji = FEED_EMOJI[feedName] ?? ':newspaper:';
  const limited = articles.slice(0, MAX_ARTICLES_PER_FEED);

  const blocks = [
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `${emoji} *${feedName}*  _(${limited.length}件)_`,
      },
    },
  ];

  for (const article of limited) {
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: linkedTitle(article.title, article.link),
      },
      accessory: {
        type: 'button',
        text: { type: 'plain_text', text: '記事を開く', emoji: false },
        url: article.link || undefined,
        action_id: `open_${encodeURIComponent(article.link).slice(0, 50)}`,
      },
    });

    blocks.push({
      type: 'context',
      elements: [
        {
          type: 'mrkdwn',
          text: `:calendar: ${formatDate(article.isoDate)}`,
        },
      ],
    });
  }

  return blocks;
}

/**
 * 全フィードの集約結果から Slack Block Kit メッセージペイロードを生成する
 *
 * @param {Map<string, { title: string; link: string; isoDate: string }[]>} grouped
 * @param {number} filterHours
 * @returns {{ text: string; blocks: object[] } | null}
 */
export function buildSlackPayload(grouped, filterHours = 24) {
  const totalCount = [...grouped.values()].reduce((s, a) => s + a.length, 0);

  if (totalCount === 0) return null;

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
        text: `📰 トレンドニュース (過去${filterHours}時間)`,
        emoji: true,
      },
    },
    {
      type: 'context',
      elements: [
        {
          type: 'mrkdwn',
          text: `:clock1: 取得日時: ${now}　|　合計 *${totalCount}件* の新着記事`,
        },
      ],
    },
    { type: 'divider' },
  ];

  const feedNames = [...grouped.keys()];
  for (let i = 0; i < feedNames.length; i++) {
    const name = feedNames[i];
    const feedBlocks = buildFeedBlocks(name, grouped.get(name));
    blocks.push(...feedBlocks);

    if (i < feedNames.length - 1) {
      blocks.push({ type: 'divider' });
    }
  }

  // Slack の上限は 50 ブロック
  const safeBlocks = blocks.slice(0, 50);

  return {
    text: `📰 トレンドニュース: 過去${filterHours}時間で ${totalCount}件の新着記事があります。`,
    blocks: safeBlocks,
  };
}
