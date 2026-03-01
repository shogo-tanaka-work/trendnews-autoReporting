import Parser from 'rss-parser';

const parser = new Parser({
  timeout: 10000,
  headers: {
    'User-Agent': 'TrendNews-AutoReporting/1.0',
    'Accept': 'application/rss+xml, application/xml, text/xml',
  },
});

/** @type {{ name: string; url: string }[]} */
export const RSS_FEEDS = [
  { name: 'OpenAI News', url: 'https://openai.com/news/rss.xml' },
  { name: 'Qiita (LLM)', url: 'https://qiita.com/tags/llm/feed' },
  { name: 'Note (LLM)', url: 'https://note.com/hashtag/LLM/rss' },
];

/**
 * @param {string} url
 * @param {string} name
 * @returns {Promise<{ feedName: string; title: string; link: string; isoDate: string }[]>}
 */
async function fetchFeed(url, name) {
  try {
    const feed = await parser.parseURL(url);
    return feed.items.map((item) => ({
      feedName: name,
      title: item.title ?? '(タイトルなし)',
      link: item.link ?? '',
      isoDate: item.isoDate ?? item.pubDate ?? '',
    }));
  } catch (err) {
    console.error(`[RSS] ${name} の取得に失敗しました: ${err.message}`);
    return [];
  }
}

/**
 * 全フィードを並列取得して直近 filterHours 時間以内の記事に絞り込む
 *
 * @param {number} [filterHours=24]
 * @returns {Promise<Map<string, { title: string; link: string; isoDate: string }[]>>}
 */
export async function fetchRecentArticles(filterHours = 24) {
  const since = new Date();
  since.setHours(since.getHours() - filterHours);

  const results = await Promise.all(
    RSS_FEEDS.map(({ name, url }) => fetchFeed(url, name))
  );

  /** @type {Map<string, { title: string; link: string; isoDate: string }[]>} */
  const grouped = new Map();

  for (const items of results) {
    for (const item of items) {
      const date = new Date(item.isoDate);
      if (!item.isoDate || isNaN(date.getTime()) || date < since) continue;

      if (!grouped.has(item.feedName)) {
        grouped.set(item.feedName, []);
      }
      grouped.get(item.feedName).push({
        title: item.title,
        link: item.link,
        isoDate: item.isoDate,
      });
    }
  }

  // 各ソース内で新しい順にソート
  for (const [, articles] of grouped) {
    articles.sort((a, b) => new Date(b.isoDate) - new Date(a.isoDate));
  }

  return grouped;
}
