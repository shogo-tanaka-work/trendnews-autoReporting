import 'dotenv/config';
import cron from 'node-cron';
import { WebClient } from '@slack/web-api';
import { fetchRecentArticles } from './rss.js';
import { buildSlackPayload } from './formatter.js';

const SLACK_BOT_TOKEN = process.env.SLACK_BOT_TOKEN;
const SLACK_CHANNEL_ID = process.env.SLACK_CHANNEL_ID;
const CRON_SCHEDULE = process.env.CRON_SCHEDULE ?? '0 8,20 * * *';
const FILTER_HOURS = parseInt(process.env.FILTER_HOURS ?? '24', 10);

if (!SLACK_BOT_TOKEN) {
  console.error('[Error] 環境変数 SLACK_BOT_TOKEN が設定されていません。');
  process.exit(1);
}
if (!SLACK_CHANNEL_ID) {
  console.error('[Error] 環境変数 SLACK_CHANNEL_ID が設定されていません。');
  process.exit(1);
}

const slack = new WebClient(SLACK_BOT_TOKEN);

async function run() {
  console.log(`[${new Date().toISOString()}] RSSフィード取得を開始します...`);

  const grouped = await fetchRecentArticles(FILTER_HOURS);

  const total = [...grouped.values()].reduce((s, a) => s + a.length, 0);
  console.log(`[RSS] ${total}件の新着記事を取得しました。`);

  if (total === 0) {
    console.log('[Slack] 新着記事がないため通知をスキップします。');
    return;
  }

  const payload = buildSlackPayload(grouped, FILTER_HOURS);
  if (!payload) return;

  try {
    await slack.chat.postMessage({
      channel: SLACK_CHANNEL_ID,
      text: payload.text,
      blocks: payload.blocks,
    });
    console.log('[Slack] メッセージを送信しました。');
  } catch (err) {
    console.error('[Slack] 送信エラー:', err.message);
  }
}

// 起動時に即時実行
run();

// cron スケジュール設定
if (!cron.validate(CRON_SCHEDULE)) {
  console.error(`[Error] CRON_SCHEDULE の形式が正しくありません: ${CRON_SCHEDULE}`);
  process.exit(1);
}

cron.schedule(CRON_SCHEDULE, run, {
  timezone: 'Asia/Tokyo',
});

console.log(`[Cron] スケジュール設定完了: ${CRON_SCHEDULE} (Asia/Tokyo)`);
