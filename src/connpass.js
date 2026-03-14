/**
 * Connpass API v2 からセミナー・イベント情報を取得する
 * @see https://connpass.com/about/api/v2/
 */

const API_BASE = 'https://connpass.com/api/v2/events/';
const REQUEST_TIMEOUT = 15000;

const CONNPASS_API_KEY = process.env.CONNPASS_API_KEY;

/**
 * @typedef {object} ConnpassEvent
 * @property {number} id
 * @property {string} title
 * @property {string} catch
 * @property {string} url
 * @property {string} started_at
 * @property {string} ended_at
 * @property {string} place
 * @property {string} address
 * @property {number} limit
 * @property {number} accepted
 * @property {number} waiting
 * @property {string} owner_display_name
 * @property {{ title: string; url: string } | null} group
 */

/**
 * Connpass API v2 を呼び出す
 * @param {Record<string, string | number>} params
 * @returns {Promise<ConnpassEvent[]>}
 */
async function callApi(params) {
  if (!CONNPASS_API_KEY) {
    throw new Error('環境変数 CONNPASS_API_KEY が設定されていません');
  }

  const url = new URL(API_BASE);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, String(value));
  }

  const res = await fetch(url.toString(), {
    headers: {
      'X-API-Key': CONNPASS_API_KEY,
      'User-Agent': 'TrendNews-AutoReporting/1.0',
    },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT),
  });

  if (!res.ok) {
    throw new Error(`Connpass API error: ${res.status} ${res.statusText}`);
  }

  const data = await res.json();
  return data.events ?? [];
}

/**
 * レート制限対策の待機（1秒1リクエスト制限）
 * @param {number} ms
 * @returns {Promise<void>}
 */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * 今日〜7日後までの直近イベントを取得（開催日順）
 * @param {string[]} keywords - 検索キーワード（OR検索）
 * @param {number} [count=20]
 * @returns {Promise<ConnpassEvent[]>}
 */
export async function fetchUpcomingEvents(keywords, count = 20) {
  try {
    const today = new Date();
    const ymds = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() + i);
      const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
      ymds.push(ymd);
    }

    const params = {
      ymd: ymds.join(','),
      count,
      order: 2, // 開催日順
    };
    if (keywords.length > 0) {
      params.keyword_or = keywords.join(',');
    }

    return await callApi(params);
  } catch (err) {
    console.error(`[Connpass] 直近イベントの取得に失敗: ${err.message}`);
    return [];
  }
}

/**
 * 人気イベントを取得（参加者数でソート）
 * @param {string[]} keywords - 検索キーワード（OR検索）
 * @param {number} [count=30]
 * @returns {Promise<ConnpassEvent[]>}
 */
export async function fetchPopularEvents(keywords, count = 30) {
  try {
    // 直近イベント取得とのレート制限対策
    await sleep(1100);

    const today = new Date();
    const ymds = [];
    for (let i = 0; i < 30; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() + i);
      const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
      ymds.push(ymd);
    }

    const params = {
      ymd: ymds.join(','),
      count,
      order: 2,
    };
    if (keywords.length > 0) {
      params.keyword_or = keywords.join(',');
    }

    const events = await callApi(params);
    // 参加者数（accepted）の降順でソートしてランキング化
    return events.sort((a, b) => b.accepted - a.accepted);
  } catch (err) {
    console.error(`[Connpass] 人気イベントの取得に失敗: ${err.message}`);
    return [];
  }
}
