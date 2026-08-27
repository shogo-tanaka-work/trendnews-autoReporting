/**
 * カテゴリと情報源の定義。ここがスケジュールと通知先の単一の情報源になる。
 *
 * schedule は systemd timer の OnCalendar 式（Asia/Tokyo）。
 * `npm run gen:systemd` がここから unit の drop-in を生成する。
 * SQLite の書き込みが重ならないよう、カテゴリごとに時刻をずらしている。
 *
 * 通知量は「頻度（schedule）」と「1回の件数（maxPerNotification）」の
 * 両方で決まる。情報源を足すときに触るのは sources だけでよい。
 */
import type { CategoryConfig, SourceConfig } from '../domain/source.js';

export const CATEGORIES: CategoryConfig[] = [
  // ── 日次・週次ダイジェスト（ランキング選抜で上位だけを通知する） ──────
  //
  // 情報源を増やしても通知量が増えないよう、maxPerNotification で
  // カテゴリ全体の件数を押さえる。選外の記事は API から参照できる。
  {
    key: 'ai_news',
    label: 'AIニュース速報',
    channelEnvKey: 'SLACK_CHANNEL_AI_NEWS',
    schedule: '*-*-* 08:00:00',
    selector: 'ranking',
    maxPerNotification: 10,
    maxPerSource: 5,
    sources: [
      // AI企業公式
      { id: 'openai-blog', type: 'rss', name: 'OpenAI Blog', url: 'https://openai.com/news/rss.xml', emoji: ':robot_face:' },
      { id: 'google-deepmind', type: 'rss', name: 'Google DeepMind', url: 'https://deepmind.google/blog/rss.xml', emoji: ':brain:' },
      // 国内AIメディア
      { id: 'itmedia-ai', type: 'rss', name: 'ITmedia AI+', url: 'https://rss.itmedia.co.jp/rss/2.0/aiplus.xml', emoji: ':bulb:' },
      { id: 'aismiley', type: 'rss', name: 'AIsmiley', url: 'https://aismiley.co.jp/ai_news/feed/', emoji: ':smile:' },
      // クラウド AI/ML
      { id: 'aws-ml-blog', type: 'rss', name: 'AWS Machine Learning Blog', url: 'https://aws.amazon.com/blogs/machine-learning/feed/', emoji: ':aws:' },
      { id: 'google-cloud-blog', type: 'rss', name: 'Google Cloud Blog (AI/ML)', url: 'https://blog.google/products/google-cloud/rss/', emoji: ':cloud:' },
    ],
  },
  {
    key: 'engineer_news',
    label: 'エンジニアニュース速報',
    channelEnvKey: 'SLACK_CHANNEL_ENGINEER_NEWS',
    schedule: '*-*-* 08:10:00',
    selector: 'ranking',
    maxPerNotification: 10,
    maxPerSource: 5,
    sources: [
      // 国内IT総合
      { id: 'itmedia', type: 'rss', name: 'ITmedia', url: 'https://rss.itmedia.co.jp/rss/2.0/itmedia_all.xml', emoji: ':computer:' },
      { id: 'publickey', type: 'rss', name: 'Publickey', url: 'https://www.publickey1.jp/atom.xml', emoji: ':old_key:' },
      { id: 'qiita-llm', type: 'rss', name: 'Qiita (LLM)', url: 'https://qiita.com/tags/llm/feed', emoji: ':green_book:' },
      { id: 'note-llm', type: 'rss', name: 'Note (LLM)', url: 'https://note.com/hashtag/LLM/rss', emoji: ':memo:' },
      // AWS
      { id: 'aws-news-blog', type: 'rss', name: 'AWS News Blog', url: 'https://aws.amazon.com/blogs/aws/feed/', emoji: ':aws:' },
      { id: 'aws-jp-blog', type: 'rss', name: 'AWS Japan Blog', url: 'https://aws.amazon.com/jp/blogs/psa/feed/', emoji: ':jp:' },
      // Google Workspace
      { id: 'gws-updates', type: 'rss', name: 'Google Workspace Updates', url: 'http://feeds.feedburner.com/GoogleWorkspaceUpdates', emoji: ':google:' },
      { id: 'gws-release-notes', type: 'rss', name: 'Google Workspace Release Notes', url: 'https://developers.google.com/feeds/workspace-release-notes.xml', emoji: ':gear:' },
    ],
  },
  {
    key: 'whiskey_news',
    label: 'ウイスキーニュース',
    channelEnvKey: 'SLACK_CHANNEL_WHISKEY_NEWS',
    schedule: 'Sat *-*-* 10:00:00',
    selector: 'ranking',
    maxPerNotification: 10,
    maxPerSource: 5,
    sources: [
      { id: 'barrel', type: 'rss', name: 'BARREL', url: 'https://www.barrel365.com/feed/', emoji: ':tumbler_glass:' },
      { id: 'dear-whisky', type: 'rss', name: 'Dear WHISKY', url: 'https://dearwhisky.com/feed/', emoji: ':whisky:' },
      { id: 'whisky-magazine-jp', type: 'rss', name: 'Whisky Magazine Japan', url: 'https://whiskymag.jp/feed/', emoji: ':book:' },
    ],
  },
  {
    key: 'fitness_news',
    label: '筋トレニュース',
    channelEnvKey: 'SLACK_CHANNEL_FITNESS_NEWS',
    schedule: 'Sun *-*-* 10:00:00',
    selector: 'ranking',
    maxPerNotification: 10,
    maxPerSource: 5,
    sources: [
      { id: 'breaking-muscle', type: 'rss', name: 'Breaking Muscle', url: 'https://breakingmuscle.com/feed/', emoji: ':muscle:' },
      { id: 'muscle-and-fitness', type: 'rss', name: 'Muscle & Fitness', url: 'https://www.muscleandfitness.com/feed/', emoji: ':fire:' },
      { id: 'vitup', type: 'rss', name: 'VITUP!', url: 'https://vitup.jp/feed/', emoji: ':sports_medal:' },
    ],
  },
  {
    key: 'business_news',
    label: 'ビジネスニュース',
    channelEnvKey: 'SLACK_CHANNEL_BUSINESS_NEWS',
    schedule: 'Sat *-*-* 09:00:00',
    selector: 'ranking',
    maxPerNotification: 10,
    maxPerSource: 5,
    sources: [
      // 会社員へ戻ったため、フリーランス・個人事業主向けの情報源は 2026-08-21 に整理した
      // （Workship / フリーランス協会 / SoloPro / LIG / レバテック / Qiita 個人事業主 / Note フリーランス）。
      // 制度・仕事術まわりだけ残している。
      { id: 'moneyforward-biz', type: 'rss', name: 'マネーフォワード クラウドブログ', url: 'https://biz.moneyforward.com/blog/feed/', emoji: ':moneybag:' },
      { id: 'lifehacker-jp', type: 'rss', name: 'ライフハッカー', url: 'https://www.lifehacker.jp/feed/index.xml', emoji: ':zap:' },
    ],
  },
  {
    key: 'economy_news',
    label: '経済ニュース',
    channelEnvKey: 'SLACK_CHANNEL_ECONOMY_NEWS',
    schedule: '*-*-* 07:30:00',
    selector: 'ranking',
    maxPerNotification: 8,
    maxPerSource: 5,
    sources: [
      // 国内経済・総合
      { id: 'yahoo-business', type: 'rss', name: 'Yahoo!ニュース (経済)', url: 'https://news.yahoo.co.jp/rss/topics/business.xml', emoji: ':yen:' },
      // Googleニュース経由（日経・Bloomberg代替）
      { id: 'gnews-nikkei', type: 'rss', name: '日経新聞 (Google News)', url: 'https://news.google.com/rss/search?q=when:24h+source:%E6%97%A5%E6%9C%AC%E7%B5%8C%E6%B8%88%E6%96%B0%E8%81%9E&hl=ja&gl=JP&ceid=JP:ja', emoji: ':newspaper:' },
      { id: 'gnews-bloomberg', type: 'rss', name: 'Bloomberg (Google News)', url: 'https://news.google.com/rss/search?q=when:24h+source:Bloomberg&hl=ja&gl=JP&ceid=JP:ja', emoji: ':chart_with_downwards_trend:' },
      // 市場分析・投資
      { id: 'investing-jp', type: 'rss', name: 'Investing.com', url: 'https://jp.investing.com/rss/news_285.rss', emoji: ':chart_with_upwards_trend:' },
      { id: 'zuu-online', type: 'rss', name: 'ZUU online', url: 'https://zuuonline.com/feed', emoji: ':bank:' },
      // 暗号資産・Web3
      { id: 'coindesk-jp', type: 'rss', name: 'CoinDesk JAPAN', url: 'https://www.coindeskjapan.com/feed/', emoji: ':coin:' },
    ],
  },

  // ── トレンド発掘（世の中のランキング上位から発信ネタを拾う） ──────────
  //
  // 既存カテゴリが「決めた購読先の新着を見逃さない」のに対し、ここは
  // 「まだ知らない話題を上位N件だけ拾う」。目的が違うので情報源も選抜も別に持つ。
  // 重み付けは情報源の信頼度とノイズの少なさを表す（1.0 が基準）。
  {
    key: 'trend_digest',
    label: 'トレンドダイジェスト',
    channelEnvKey: 'SLACK_CHANNEL_TREND_DIGEST',
    schedule: '*-*-* 07:15:00',
    selector: 'ranking',
    maxPerNotification: 15,
    maxPerSource: 5,
    sources: [
      { id: 'trend-hatena', type: 'ranking', provider: 'hatena', name: 'はてブ', weight: 1.0, emoji: ':bookmark:' },
      { id: 'trend-hackernews', type: 'ranking', provider: 'hackernews', name: 'Hacker News', weight: 0.9, emoji: ':orange_book:' },
      { id: 'trend-google-trends', type: 'ranking', provider: 'google_trends', name: 'Google Trends', weight: 0.9, emoji: ':mag:' },
      { id: 'trend-qiita', type: 'ranking', provider: 'qiita', name: 'Qiita', weight: 0.8, emoji: ':green_book:' },
      { id: 'trend-zenn', type: 'ranking', provider: 'zenn', name: 'Zenn', weight: 0.8, emoji: ':closed_book:' },
      { id: 'trend-github', type: 'ranking', provider: 'github_trending', name: 'GitHub 急上昇', weight: 0.7, emoji: ':octopus:' },
      { id: 'trend-youtube', type: 'ranking', provider: 'youtube_trending', name: 'YouTube 急上昇', weight: 0.6, emoji: ':tv:' },
    ],
  },

  // ── Tech Intelligence（一次情報。キーワード配点で絞り込む） ────────────
  //
  // 実装判断に直結し翌朝まで待てないため、この2カテゴリだけ1日2回の速報とする。
  {
    key: 'tech_cloud',
    label: 'Cloud / Infra アップデート',
    channelEnvKey: 'SLACK_CHANNEL_TECH_CLOUD',
    schedule: '*-*-* 08,20:40:00',
    selector: 'scoring',
    minScore: 6,
    maxPerNotification: 8,
    maxPerSource: 8,
    sources: [
      { id: 'aws-whats-new', type: 'rss', name: "AWS What's New", url: 'https://aws.amazon.com/about-aws/whats-new/recent/feed/', emoji: ':aws:' },
      { id: 'cloudflare-changelog', type: 'rss', name: 'Cloudflare Changelog', url: 'https://developers.cloudflare.com/changelog/rss.xml', emoji: ':cloud:' },
      { id: 'github-changelog', type: 'rss', name: 'GitHub Changelog', url: 'https://github.blog/changelog/feed/', emoji: ':octopus:' },
      { id: 'gcp-release-notes', type: 'rss', name: 'Google Cloud Release Notes', url: 'https://cloud.google.com/feeds/gcp-release-notes.xml', emoji: ':cloud:' },
    ],
  },
  {
    key: 'tech_web',
    label: 'Web / JavaScript リリース',
    channelEnvKey: 'SLACK_CHANNEL_TECH_WEB',
    schedule: '*-*-* 09:10:00',
    selector: 'scoring',
    minScore: 3,
    maxPerNotification: 8,
    maxPerSource: 3,
    sources: [
      { id: 'gh-react', type: 'github', name: 'React', repo: 'facebook/react', emoji: ':atom_symbol:' },
      { id: 'gh-nextjs', type: 'github', name: 'Next.js', repo: 'vercel/next.js', emoji: ':black_square_button:' },
      { id: 'gh-vite', type: 'github', name: 'Vite', repo: 'vitejs/vite', emoji: ':zap:' },
      { id: 'gh-tanstack-router', type: 'github', name: 'TanStack Router', repo: 'TanStack/router', emoji: ':compass:' },
      { id: 'gh-hono', type: 'github', name: 'Hono', repo: 'honojs/hono', emoji: ':fire:' },
      { id: 'gh-typescript', type: 'github', name: 'TypeScript', repo: 'microsoft/TypeScript', emoji: ':large_blue_diamond:' },
      { id: 'gh-node', type: 'github', name: 'Node.js', repo: 'nodejs/node', emoji: ':evergreen_tree:' },
      { id: 'gh-bun', type: 'github', name: 'Bun', repo: 'oven-sh/bun', emoji: ':bread:' },
      { id: 'gh-deno', type: 'github', name: 'Deno', repo: 'denoland/deno', emoji: ':sauropod:' },
    ],
  },
  {
    key: 'tech_ai',
    label: 'AI / AI Agent アップデート',
    channelEnvKey: 'SLACK_CHANNEL_TECH_AI',
    schedule: '*-*-* 08,20:50:00',
    selector: 'scoring',
    minScore: 5,
    maxPerNotification: 8,
    maxPerSource: 3,
    sources: [
      { id: 'gh-langgraph', type: 'github', name: 'LangGraph', repo: 'langchain-ai/langgraph', emoji: ':spider_web:' },
      { id: 'gh-langchain', type: 'github', name: 'LangChain', repo: 'langchain-ai/langchain', emoji: ':link:' },
      { id: 'gh-mcp-spec', type: 'github', name: 'MCP Specification', repo: 'modelcontextprotocol/modelcontextprotocol', emoji: ':electric_plug:' },
      { id: 'gh-mcp-ts-sdk', type: 'github', name: 'MCP TypeScript SDK', repo: 'modelcontextprotocol/typescript-sdk', emoji: ':electric_plug:' },
      { id: 'gh-google-adk', type: 'github', name: 'Google ADK (Python)', repo: 'google/adk-python', emoji: ':google:' },
      { id: 'gh-openai-agents', type: 'github', name: 'OpenAI Agents SDK', repo: 'openai/openai-agents-python', emoji: ':robot_face:' },
      { id: 'gh-anthropic-sdk-ts', type: 'github', name: 'Anthropic SDK (TypeScript)', repo: 'anthropics/anthropic-sdk-typescript', emoji: ':crystal_ball:' },
      { id: 'gh-semantic-kernel', type: 'github', name: 'Semantic Kernel', repo: 'microsoft/semantic-kernel', emoji: ':window:' },
      { id: 'gh-autogen', type: 'github', name: 'AutoGen', repo: 'microsoft/autogen', emoji: ':busts_in_silhouette:' },
    ],
  },
  {
    key: 'tech_youtube',
    label: '技術系 YouTube 新着',
    channelEnvKey: 'SLACK_CHANNEL_TECH_YOUTUBE',
    schedule: '*-*-* 10:00:00',
    selector: 'ranking',
    maxPerNotification: 5,
    maxPerSource: 3,
    sources: [
      // channelRef は `UC...` のチャンネル ID か `@handle`。handle は API 側で ID へ解決する。
      // 追加したいチャンネルはここへ足す（全体検索はノイズと quota の観点から行わない）。
      { id: 'yt-chrono-it', type: 'youtube', name: 'クロノIT', channelRef: '@クロノIT', emoji: ':tv:' },
      { id: 'yt-cloudflare', type: 'youtube', name: 'Cloudflare', channelRef: '@CloudflareTV', emoji: ':cloud:' },
      { id: 'yt-aws', type: 'youtube', name: 'Amazon Web Services', channelRef: '@amazonwebservices', emoji: ':aws:' },
      { id: 'yt-anthropic', type: 'youtube', name: 'Anthropic', channelRef: '@anthropic-ai', emoji: ':crystal_ball:' },
      { id: 'yt-openai', type: 'youtube', name: 'OpenAI', channelRef: '@OpenAI', emoji: ':robot_face:' },
    ],
  },
];

export const CATEGORY_KEYS: string[] = CATEGORIES.map((c) => c.key);

export function findCategory(categoryKey: string): CategoryConfig | undefined {
  return CATEGORIES.find((c) => categoryKey === c.key);
}

export function allSources(): { category: CategoryConfig; source: SourceConfig }[] {
  return CATEGORIES.flatMap((category) => category.sources.map((source) => ({ category, source })));
}
