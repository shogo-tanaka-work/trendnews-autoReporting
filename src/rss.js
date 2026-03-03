import Parser from 'rss-parser';

const parser = new Parser({
  timeout: 10000,
  headers: {
    'User-Agent': 'TrendNews-AutoReporting/1.0',
    'Accept': 'application/rss+xml, application/xml, text/xml',
  },
});

/**
 * @typedef {{ name: string; url: string }} FeedSource
 * @typedef {{ label: string; channelEnvKey: string; cronEnvKey: string; feeds: FeedSource[] }} FeedCategory
 */

/** @type {Record<string, FeedCategory>} */
export const FEED_CATEGORIES = {
  ai_news: {
    label: 'AIニュース速報',
    channelEnvKey: 'SLACK_CHANNEL_AI_NEWS',
    cronEnvKey: 'CRON_AI_NEWS',
    feeds: [
      // AI企業公式
      { name: 'OpenAI Blog', url: 'https://openai.com/news/rss.xml' },
      { name: 'Google DeepMind', url: 'https://deepmind.google/blog/rss.xml' },
      { name: 'Anthropic News', url: 'https://www.anthropic.com/news/feed_anthropic.xml' },
      // 国内AIメディア
      { name: 'ITmedia AI+', url: 'https://rss.itmedia.co.jp/rss/2.0/aiplus.xml' },
      { name: 'AIsmiley', url: 'https://aismiley.co.jp/ai_news/feed/' },
      // クラウド AI/ML
      { name: 'AWS Machine Learning Blog', url: 'https://aws.amazon.com/blogs/machine-learning/feed/' },
      { name: 'Google Cloud Blog (AI/ML)', url: 'https://blog.google/products/google-cloud/rss/' },
    ],
  },
  engineer_news: {
    label: 'エンジニアニュース速報',
    channelEnvKey: 'SLACK_CHANNEL_ENGINEER_NEWS',
    cronEnvKey: 'CRON_ENGINEER_NEWS',
    feeds: [
      // 国内IT総合
      { name: 'ITmedia', url: 'https://rss.itmedia.co.jp/rss/2.0/itmedia_all.xml' },
      { name: 'Publickey', url: 'https://www.publickey1.jp/atom.xml' },
      { name: 'Qiita (LLM)', url: 'https://qiita.com/tags/llm/feed' },
      { name: 'Note (LLM)', url: 'https://note.com/hashtag/LLM/rss' },
      // AWS
      { name: 'AWS News Blog', url: 'https://aws.amazon.com/blogs/aws/feed/' },
      { name: 'AWS Japan Blog', url: 'https://aws.amazon.com/jp/blogs/psa/feed/' },
      // Google Workspace
      { name: 'Google Workspace Updates', url: 'http://feeds.feedburner.com/GoogleWorkspaceUpdates' },
      { name: 'Google Workspace Release Notes', url: 'https://developers.google.com/feeds/workspace-release-notes.xml' },
    ],
  },
  whiskey_news: {
    label: 'ウイスキーニュース',
    channelEnvKey: 'SLACK_CHANNEL_WHISKEY_NEWS',
    cronEnvKey: 'CRON_WHISKEY_NEWS',
    feeds: [
      { name: 'BARREL', url: 'https://www.barrel365.com/feed/' },
      { name: 'Dear WHISKY', url: 'https://dearwhisky.com/feed/' },
      { name: 'Whisky Magazine Japan', url: 'https://whiskymag.jp/feed/' },
    ],
  },
  fitness_news: {
    label: '筋トレニュース',
    channelEnvKey: 'SLACK_CHANNEL_FITNESS_NEWS',
    cronEnvKey: 'CRON_FITNESS_NEWS',
    feeds: [
      { name: 'BarBend', url: 'https://barbend.com/feed/' },
      { name: 'Breaking Muscle', url: 'https://breakingmuscle.com/feed/' },
      { name: 'Muscle & Fitness', url: 'https://www.muscleandfitness.com/feed/' },
      { name: 'VITUP!', url: 'https://vitup.jp/feed/' },
    ],
  },
  business_news: {
    label: 'ビジネスニュース',
    channelEnvKey: 'SLACK_CHANNEL_BUSINESS_NEWS',
    cronEnvKey: 'CRON_BUSINESS_NEWS',
    feeds: [
      // 法律・税金・ライフハック
      { name: 'Workship MAGAZINE', url: 'https://goworkship.com/magazine/feed' },
      { name: 'フリーランス協会', url: 'https://blog.freelance-jp.org/feed/' },
      { name: 'マネーフォワード クラウドブログ', url: 'https://biz.moneyforward.com/blog/feed/' },
      { name: 'SoloPro', url: 'https://solopro.biz/feed/' },
      // ITフリーランスのキャリア・仕事術
      { name: 'LIGブログ (フリーランス)', url: 'https://liginc.co.jp/category/life/freelance/feed' },
      { name: 'レバテックフリーランス', url: 'https://freelance.levtech.jp/guide/feed/' },
      { name: 'Qiita (個人事業主)', url: 'https://qiita.com/tags/%E5%80%8B%E4%BA%BA%E4%BA%8B%E6%A5%AD%E4%B8%BB/feed.atom' },
      // マインドセット・仕事術
      { name: 'ライフハッカー', url: 'https://www.lifehacker.jp/feed/index.xml' },
      { name: 'Note (フリーランス)', url: 'https://note.com/hashtag/%E3%83%95%E3%83%AA%E3%83%BC%E3%83%A9%E3%83%B3%E3%82%B9/rss' },
    ],
  },
  economy_news: {
    label: '経済ニュース',
    channelEnvKey: 'SLACK_CHANNEL_ECONOMY_NEWS',
    cronEnvKey: 'CRON_ECONOMY_NEWS',
    feeds: [
      // 国内経済・総合
      { name: 'Yahoo!ニュース (経済)', url: 'https://news.yahoo.co.jp/rss/topics/business.xml' },
      { name: 'ロイター (経済)', url: 'https://jp.reuters.com/rss/businessNews' },
      // Googleニュース経由（日経・Bloomberg代替）
      { name: '日経新聞 (Google News)', url: 'https://news.google.com/rss/search?q=when:24h+source:%E6%97%A5%E6%9C%AC%E7%B5%8C%E6%B8%88%E6%96%B0%E8%81%9E&hl=ja&gl=JP&ceid=JP:ja' },
      { name: 'Bloomberg (Google News)', url: 'https://news.google.com/rss/search?q=when:24h+source:Bloomberg&hl=ja&gl=JP&ceid=JP:ja' },
      // 市場分析・投資
      { name: 'Investing.com', url: 'https://jp.investing.com/rss/news_285.rss' },
      { name: 'ZUU online', url: 'https://zuuonline.com/feed' },
      // 暗号資産・Web3
      { name: 'CoinDesk JAPAN', url: 'https://www.coindeskjapan.com/feed/' },
    ],
  },
};

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
 * 指定フィード群を並列取得して直近 filterHours 時間以内の記事に絞り込む
 *
 * @param {FeedSource[]} feeds
 * @param {number} [filterHours=24]
 * @returns {Promise<Map<string, { title: string; link: string; isoDate: string }[]>>}
 */
async function fetchRecentFromFeeds(feeds, filterHours = 24) {
  const since = new Date();
  since.setHours(since.getHours() - filterHours);

  const results = await Promise.all(
    feeds.map(({ name, url }) => fetchFeed(url, name))
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

  for (const [, articles] of grouped) {
    articles.sort((a, b) => new Date(b.isoDate) - new Date(a.isoDate));
  }

  return grouped;
}

/**
 * 単一カテゴリのフィードを取得して直近記事に絞り込む
 *
 * @param {string} categoryKey
 * @param {number} [filterHours=24]
 * @returns {Promise<Map<string, { title: string; link: string; isoDate: string }[]>>}
 */
export async function fetchByCategory(categoryKey, filterHours = 24) {
  const cat = FEED_CATEGORIES[categoryKey];
  if (!cat) throw new Error(`Unknown category: ${categoryKey}`);
  return fetchRecentFromFeeds(cat.feeds, filterHours);
}
