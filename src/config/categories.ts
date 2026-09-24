/**
 * カテゴリと情報源の定義。ここがスケジュールと通知先の単一の情報源になる。
 *
 * schedule は systemd timer の OnCalendar 式（Asia/Tokyo）。
 * `npm run gen:systemd` がここから unit の drop-in を生成する。
 * SQLite の書き込みが重ならないよう、カテゴリごとに時刻をずらしている。
 *
 * 通知量は「頻度（schedule / notifyDays）」と「1回の件数（maxPerNotification）」の
 * 両方で決まる。情報源を足すときに触るのは sources だけでよい。
 *
 * 見切れない量の通知は読まれないため、平日は朝の経済ニュース1本に絞っている。
 * AI・クラウドの公式アップデートは shogo-works の日次 AI ニュース運用が担うので、ここでは扱わない。
 */
import type { CategoryConfig, SourceConfig } from '../domain/source.js';

export const CATEGORIES: CategoryConfig[] = [
  // ランキング選抜で上位だけを通知する。情報源を増やしても通知量が増えないよう、
  // maxPerNotification でカテゴリ全体の件数を押さえる。選外の記事は API から参照できる。
  {
    key: 'economy_news',
    label: '経済ニュース',
    channelEnvKey: 'SLACK_CHANNEL_ECONOMY_NEWS',
    schedule: '*-*-* 08:00:00',
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
  {
    key: 'engineer_news',
    label: 'エンジニアニュース速報',
    channelEnvKey: 'SLACK_CHANNEL_ENGINEER_NEWS',
    // 平日は読む時間が取れないため、収集は毎日・通知は土曜に溜まった分から上位だけを送る。
    // RSS は直近数十件しか持たないので、収集まで週1にすると平日の記事を取りこぼす。
    // RSS には人気の指標がないため、上位＝各日のフィード先頭に近い記事になる
    schedule: '*-*-* 08:10:00',
    notifyDays: ['Sat'],
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
    // 朝に読むものではないので夕方以降に送る。収集は engineer_news と同じ理由で毎日行う
    schedule: '*-*-* 19:00:00',
    notifyDays: ['Sat'],
    selector: 'ranking',
    maxPerNotification: 10,
    maxPerSource: 5,
    sources: [
      { id: 'barrel', type: 'rss', name: 'BARREL', url: 'https://www.barrel365.com/feed/', emoji: ':tumbler_glass:' },
      { id: 'dear-whisky', type: 'rss', name: 'Dear WHISKY', url: 'https://dearwhisky.com/feed/', emoji: ':whisky:' },
      { id: 'whisky-magazine-jp', type: 'rss', name: 'Whisky Magazine Japan', url: 'https://whiskymag.jp/feed/', emoji: ':book:' },
    ],
  },

  // ── ネタ週報（発信ネタ探し） ─────────────────────────────────────────
  //
  // 「決めた購読先の新着」ではなく「世の中の上位」から、発信の4本柱に当たるものを拾う。
  // 読む時間が取れるのは週末なので、収集は毎日・通知は日曜朝にまとめる。
  // 通知した分は archive/ の台帳に残し、昇格候補を選ぶ入口にする。
  {
    key: 'neta_weekly',
    label: 'ネタ週報',
    channelEnvKey: 'SLACK_CHANNEL_NETA_WEEKLY',
    schedule: '*-*-* 09:00:00',
    notifyDays: ['Sun'],
    selector: 'ranking',
    maxPerNotification: 15,
    maxPerSource: 5,
    // 4本柱に当たらない「世間の話題」も少しは拾うが、主役にはしない
    pillars: { untaggedSlots: 3 },
    archiveDigest: true,
    sources: [
      { id: 'trend-hatena', type: 'ranking', provider: 'hatena', name: 'はてブ', weight: 1.0, emoji: ':bookmark:' },
      { id: 'trend-hackernews', type: 'ranking', provider: 'hackernews', name: 'Hacker News', weight: 0.9, emoji: ':orange_book:' },
      { id: 'trend-google-trends', type: 'ranking', provider: 'google_trends', name: 'Google Trends', weight: 0.9, emoji: ':mag:' },
      { id: 'trend-qiita', type: 'ranking', provider: 'qiita', name: 'Qiita', weight: 0.8, emoji: ':green_book:' },
      { id: 'trend-zenn', type: 'ranking', provider: 'zenn', name: 'Zenn', weight: 0.8, emoji: ':closed_book:' },
      // 触ってみたい OSS・ツールの候補（SHO-237）
      { id: 'trend-github', type: 'ranking', provider: 'github_trending', name: 'GitHub 急上昇', weight: 0.7, emoji: ':octopus:' },
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
