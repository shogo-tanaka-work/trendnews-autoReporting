/**
 * 指定したキーワードの検索トレンドを SerpApi の Google Trends エンジンで取得する。
 *
 * 急上昇ワード（ranking/api-providers.ts の fetchGoogleTrends）が「世の中の上位」を
 * 取るのに対し、こちらは「決めた語の推移と関連語」を取る定点観測用。
 *
 * @see https://serpapi.com/google-trends-api
 */
import { z } from 'zod';
import { httpGetJson, type HttpOptions } from '../lib/http.js';

const API_BASE = 'https://serpapi.com/search.json';

/**
 * Google Trends エンジンはキャッシュが無いと 15 秒を超えることがある。
 * 中断しても SerpApi 側で検索が完了すれば枠を消費するため、待ち時間を長めに取り再試行は1回に抑える。
 */
const SERPAPI_HTTP: HttpOptions = { timeoutMs: 60_000, maxRetries: 1 };

const TimeseriesSchema = z.object({
  /** HTTP 200 のまま結果なし等を返すことがある */
  error: z.string().optional(),
  interest_over_time: z
    .object({
      timeline_data: z.array(
        z.object({
          timestamp: z.union([z.string(), z.number()]),
          partial_data: z.boolean().optional(),
          values: z.array(z.object({ extracted_value: z.number() })),
        })
      ),
    })
    .optional(),
});

const RelatedQueriesSchema = z.object({
  error: z.string().optional(),
  related_queries: z
    .object({
      rising: z
        .array(
          z.object({
            query: z.string(),
            /** "+250%" や "Breakout"（急増） */
            value: z.string(),
          })
        )
        .optional(),
    })
    .optional(),
});

/** 1日分の値。value はその語の期間内最大を 100 とした相対値 */
export type TimelinePoint = {
  timestamp: number;
  value: number;
};

export type RisingQuery = {
  query: string;
  value: string;
};

function searchUrl(apiKey: string, keyword: string, dataType: string, date: string): string {
  if (keyword.includes(',')) {
    // SerpApi は q をカンマで複数語に分けるため、1語として扱えない
    throw new Error(`キーワードにカンマは使えません: ${keyword}`);
  }

  const params = new URLSearchParams({
    engine: 'google_trends',
    geo: 'JP',
    hl: 'ja',
    q: keyword,
    data_type: dataType,
    date,
    api_key: apiKey,
  });
  return `${API_BASE}?${params}`;
}

/**
 * 推移のレスポンスから日次の値を取り出す。純関数。
 *
 * 1語ずつ問い合わせるので values の先頭がその語。複数語を1回で取ると、検索量の大きい語に
 * 引きずられて小さい語が 0〜1 に張り付き、前週比が雑音になるため 1 語ずつにしている。
 * 途中集計（partial_data）の日は除く。
 */
export function parseTimeseries(payload: unknown): TimelinePoint[] {
  const parsed = TimeseriesSchema.safeParse(payload);
  if (!parsed.success) throw new Error('Google Trends 推移のレスポンス形式が想定と異なります');
  if (parsed.data.error) throw new Error(`Google Trends 推移が結果を返しませんでした: ${parsed.data.error}`);

  const points = (parsed.data.interest_over_time?.timeline_data ?? []).flatMap((point) => {
    const value = point.values[0]?.extracted_value;
    if (point.partial_data || value === undefined) return [];
    return [{ timestamp: Number(point.timestamp), value }];
  });

  if (points.length === 0) throw new Error('Google Trends 推移が空でした');
  return points;
}

/**
 * 関連クエリのレスポンスから急上昇分を取り出す。純関数。
 * 検索が少ない語は rising が無い（error も返る）ので、その場合は空配列にする。
 */
export function parseRisingQueries(payload: unknown): RisingQuery[] {
  const parsed = RelatedQueriesSchema.safeParse(payload);
  if (!parsed.success) throw new Error('Google Trends 関連クエリのレスポンス形式が想定と異なります');

  return (parsed.data.related_queries?.rising ?? []).map(({ query, value }) => ({ query, value }));
}

export class GoogleTrendsKeywordCollector {
  constructor(private readonly apiKey: string) {}

  /** 直近30日の日次推移。前週比はこの中で完結して計算できるため、過去の値を DB に持たなくてよい */
  async fetchTimeseries(keyword: string): Promise<TimelinePoint[]> {
    const payload = await httpGetJson(searchUrl(this.apiKey, keyword, 'TIMESERIES', 'today 1-m'), {
      ...SERPAPI_HTTP,
      label: 'Google Trends 推移',
    });
    return parseTimeseries(payload);
  }

  /** 直近7日で急上昇した関連クエリ */
  async fetchRisingQueries(keyword: string): Promise<RisingQuery[]> {
    const payload = await httpGetJson(searchUrl(this.apiKey, keyword, 'RELATED_QUERIES', 'now 7-d'), {
      ...SERPAPI_HTTP,
      label: 'Google Trends 関連クエリ',
    });
    return parseRisingQueries(payload);
  }
}
