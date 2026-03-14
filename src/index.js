import 'dotenv/config';
import cron from 'node-cron';
import { WebClient } from '@slack/web-api';
import { FEED_CATEGORIES, fetchByCategory } from './rss.js';
import { buildSlackPayload } from './formatter.js';
import { fetchUpcomingEvents, fetchPopularEvents } from './connpass.js';
import { buildConnpassPayload } from './connpassFormatter.js';

const SLACK_BOT_TOKEN = process.env.SLACK_BOT_TOKEN;
const DEFAULT_CRON = '0 8,20 * * *';
const FILTER_HOURS = parseInt(process.env.FILTER_HOURS ?? '24', 10);

if (!SLACK_BOT_TOKEN) {
  console.error('[Error] 環境変数 SLACK_BOT_TOKEN が設定されていません。');
  process.exit(1);
}

/** @type {{ key: string; label: string; channelId: string; cronSchedule: string }[]} */
const categoryConfigs = [];

for (const [key, cat] of Object.entries(FEED_CATEGORIES)) {
  const channelId = process.env[cat.channelEnvKey];
  if (!channelId) {
    console.error(
      `[Error] 環境変数 ${cat.channelEnvKey} が設定されていません (カテゴリ: ${cat.label})。`
    );
    process.exit(1);
  }
  const cronSchedule = process.env[cat.cronEnvKey] || DEFAULT_CRON;
  categoryConfigs.push({ key, label: cat.label, channelId, cronSchedule });
}

const slack = new WebClient(SLACK_BOT_TOKEN);

/**
 * 指定カテゴリのフィードを取得して Slack に送信する
 * @param {string} categoryKey
 */
async function runCategory(categoryKey) {
  const config = categoryConfigs.find((c) => c.key === categoryKey);
  if (!config) return;

  console.log(`[${new Date().toISOString()}] ${config.label}: フィード取得を開始...`);

  const grouped = await fetchByCategory(categoryKey, FILTER_HOURS);
  const total = [...grouped.values()].reduce((s, a) => s + a.length, 0);
  console.log(`[RSS] ${config.label}: ${total}件の新着記事を取得しました。`);

  if (total === 0) {
    console.log(`[Slack] ${config.label}: 新着記事がないため通知をスキップします。`);
    return;
  }

  const payload = buildSlackPayload(grouped, config.label, FILTER_HOURS);
  if (!payload) return;

  try {
    await slack.chat.postMessage({
      channel: config.channelId,
      text: payload.text,
      blocks: payload.blocks,
    });
    console.log(
      `[Slack] ${config.label}: メッセージを送信しました (channel: ${config.channelId})。`
    );
  } catch (err) {
    console.error(`[Slack] ${config.label}: 送信エラー:`, err.message);
  }
}

async function runAll() {
  for (const config of categoryConfigs) {
    await runCategory(config.key);
  }
}

// ── Connpass セミナー通知 ──
const CONNPASS_CHANNEL = process.env.SLACK_CHANNEL_CONNPASS;
const CONNPASS_CRON = process.env.CRON_CONNPASS || '0 9 * * *';
const CONNPASS_KEYWORDS = (process.env.CONNPASS_KEYWORDS || '')
  .split(',')
  .map((k) => k.trim())
  .filter(Boolean);

async function runConnpass() {
  if (!CONNPASS_CHANNEL) {
    console.log('[Connpass] SLACK_CHANNEL_CONNPASS が未設定のためスキップします。');
    return;
  }
  if (!process.env.CONNPASS_API_KEY) {
    console.error('[Connpass] CONNPASS_API_KEY が未設定のためスキップします。');
    return;
  }

  console.log(`[${new Date().toISOString()}] Connpassセミナー情報: 取得を開始...`);

  // Connpass API v2 はレート制限（1秒1リクエスト）があるため直列で取得
  const upcoming = await fetchUpcomingEvents(CONNPASS_KEYWORDS);
  const popular = await fetchPopularEvents(CONNPASS_KEYWORDS);

  console.log(
    `[Connpass] 直近イベント: ${upcoming.length}件, 人気イベント: ${popular.length}件`
  );

  if (upcoming.length === 0 && popular.length === 0) {
    console.log('[Connpass] イベントが見つからないため通知をスキップします。');
    return;
  }

  const payload = buildConnpassPayload(upcoming, popular);
  if (!payload) return;

  try {
    await slack.chat.postMessage({
      channel: CONNPASS_CHANNEL,
      text: payload.text,
      blocks: payload.blocks,
    });
    console.log(
      `[Slack] Connpassセミナー情報: メッセージを送信しました (channel: ${CONNPASS_CHANNEL})。`
    );
  } catch (err) {
    console.error(`[Slack] Connpassセミナー情報: 送信エラー:`, err.message);
  }
}

// 起動時に全カテゴリを即時実行
runAll();
runConnpass();

// カテゴリごとに個別の cron スケジュールを登録
for (const config of categoryConfigs) {
  if (!cron.validate(config.cronSchedule)) {
    console.error(
      `[Error] ${config.label} の CRON 式が正しくありません: ${config.cronSchedule}`
    );
    process.exit(1);
  }

  cron.schedule(config.cronSchedule, () => runCategory(config.key), {
    timezone: 'Asia/Tokyo',
  });

  console.log(
    `[Cron] ${config.label}: スケジュール設定完了 — ${config.cronSchedule} (Asia/Tokyo)`
  );
}

// Connpass 用のスケジュール登録
if (CONNPASS_CHANNEL) {
  if (!cron.validate(CONNPASS_CRON)) {
    console.error(
      `[Error] Connpass の CRON 式が正しくありません: ${CONNPASS_CRON}`
    );
    process.exit(1);
  }

  cron.schedule(CONNPASS_CRON, () => runConnpass(), {
    timezone: 'Asia/Tokyo',
  });

  console.log(
    `[Cron] Connpassセミナー情報: スケジュール設定完了 — ${CONNPASS_CRON} (Asia/Tokyo)`
  );
}
