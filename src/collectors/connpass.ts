/**
 * Connpass API v2 からセミナー・イベント情報を取得する。
 *
 * 記事とはデータ形状が異なる（開催予定のイベント）ため articles テーブルへは入れず、
 * 収集したその回の内容をそのまま Slack へ通知する。
 * 人気ランキングは Web で見られるため取得しない。
 *
 * @see https://connpass.com/about/api/v2/
 */
import { z } from 'zod';
import type { Weekday } from '../domain/source.js';
import { tokyoWeekday } from '../lib/datetime.js';
import { httpGetJson } from '../lib/http.js';

const API_BASE = 'https://connpass.com/api/v2/events/';

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
  results_available: z.number().optional(),
  events: z.array(ConnpassEventSchema).optional(),
});

export type ConnpassEvent = z.infer<typeof ConnpassEventSchema>;

/** 通知対象の開催地。Connpass API v2 の prefecture コード（online はオンライン開催） */
const PREFECTURES = ['tokyo', 'online'];

/** API の上限。開催日時順なので、超えた分は日曜側が落ちる（件数は totalAvailable で伝える） */
const FETCH_COUNT = 100;

const DAY_MS = 24 * 60 * 60 * 1000;

function tokyoYmd(date: Date): string {
  // en-CA は YYYY-MM-DD 形式で返る
  return date.toLocaleDateString('en-CA', { timeZone: 'Asia/Tokyo' }).replaceAll('-', '');
}

/**
 * 直近の週末（金〜日）の日付を yyyymmdd で返す。純関数。
 *
 * 平日に実行したら次の金〜日、週末に実行したらその週末の残りの日を返す。
 * 金土日に参加できるイベントを、前の木曜夜にまとめて確認する運用に合わせている。
 */
export function upcomingWeekendYmd(now: Date): string[] {
  const weekday = tokyoWeekday(now);
  const offsets: Record<Weekday, number[]> = {
    Mon: [4, 5, 6],
    Tue: [3, 4, 5],
    Wed: [2, 3, 4],
    Thu: [1, 2, 3],
    Fri: [0, 1, 2],
    Sat: [0, 1],
    Sun: [0],
  };

  return offsets[weekday].map((days) => tokyoYmd(new Date(now.getTime() + days * DAY_MS)));
}

export type ConnpassSearchResult = {
  events: ConnpassEvent[];
  /** 条件に合う全件数。取得上限で切れた分も含む */
  totalAvailable: number;
};

export class ConnpassCollector {
  constructor(private readonly apiKey: string) {}

  private async callApi(params: Record<string, string | number>): Promise<ConnpassSearchResult> {
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

    const events = parsed.data.events ?? [];
    return { events, totalAvailable: parsed.data.results_available ?? events.length };
  }

  /** 直近の週末（金〜日）に都内またはオンラインで開催されるイベント（開催日順） */
  async fetchWeekendEvents(keywords: string[], now: Date): Promise<ConnpassSearchResult> {
    const params: Record<string, string | number> = {
      ymd: upcomingWeekendYmd(now).join(','),
      prefecture: PREFECTURES.join(','),
      count: FETCH_COUNT,
      order: 2, // 開催日時順
    };
    if (keywords.length > 0) params.keyword_or = keywords.join(',');

    return this.callApi(params);
  }
}
