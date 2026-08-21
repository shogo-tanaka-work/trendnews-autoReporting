/**
 * Connpass API v2 からセミナー・イベント情報を取得する。
 *
 * 記事とはデータ形状が異なる（開催予定のイベント）ため articles テーブルへは入れず、
 * 収集したその回の内容をそのまま Slack へ通知する現行仕様を維持する。
 *
 * @see https://connpass.com/about/api/v2/
 */
import { z } from 'zod';
import { httpGetJson } from '../lib/http.js';

const API_BASE = 'https://connpass.com/api/v2/events/';
/** API v2 は 1 秒 1 リクエストのレート制限がある */
const RATE_LIMIT_INTERVAL_MS = 1100;

const ConnpassEventSchema = z.object({
  id: z.number(),
  title: z.string(),
  catch: z.string().nullable().optional(),
  url: z.string(),
  started_at: z.string().nullable().optional(),
  ended_at: z.string().nullable().optional(),
  place: z.string().nullable().optional(),
  address: z.string().nullable().optional(),
  limit: z.number().nullable().optional(),
  accepted: z.number().nullable().optional(),
  waiting: z.number().nullable().optional(),
  owner_display_name: z.string().nullable().optional(),
  group: z.object({ title: z.string(), url: z.string() }).nullable().optional(),
});

const ConnpassResponseSchema = z.object({
  events: z.array(ConnpassEventSchema).optional(),
});

export type ConnpassEvent = z.infer<typeof ConnpassEventSchema>;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** 今日から days 日分の ymd パラメータを組み立てる */
function ymdRange(days: number, today: Date): string[] {
  const result: string[] = [];

  for (let i = 0; i < days; i++) {
    const date = new Date(today);
    date.setDate(date.getDate() + i);
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    result.push(`${date.getFullYear()}${month}${day}`);
  }

  return result;
}

export class ConnpassCollector {
  constructor(private readonly apiKey: string) {}

  private async callApi(params: Record<string, string | number>): Promise<ConnpassEvent[]> {
    const url = new URL(API_BASE);
    for (const [name, value] of Object.entries(params)) url.searchParams.set(name, String(value));

    const payload = await httpGetJson(url.toString(), {
      headers: { 'X-API-Key': this.apiKey },
      label: 'Connpass API',
    });

    const parsed = ConnpassResponseSchema.safeParse(payload);
    if (!parsed.success) {
      throw new Error('Connpass API のレスポンス形式が想定と異なります');
    }

    return parsed.data.events ?? [];
  }

  /** 今日〜7日後までの直近イベント（開催日順） */
  async fetchUpcomingEvents(keywords: string[], today: Date, count = 20): Promise<ConnpassEvent[]> {
    const params: Record<string, string | number> = {
      ymd: ymdRange(7, today).join(','),
      count,
      order: 2, // 開催日順
    };
    if (keywords.length > 0) params.keyword_or = keywords.join(',');

    return this.callApi(params);
  }

  /** 今後30日分から参加者数の多い順に並べたもの */
  async fetchPopularEvents(keywords: string[], today: Date, count = 30): Promise<ConnpassEvent[]> {
    await sleep(RATE_LIMIT_INTERVAL_MS);

    const params: Record<string, string | number> = {
      ymd: ymdRange(30, today).join(','),
      count,
      order: 2,
    };
    if (keywords.length > 0) params.keyword_or = keywords.join(',');

    const events = await this.callApi(params);
    return [...events].sort((a, b) => (b.accepted ?? 0) - (a.accepted ?? 0));
  }
}
