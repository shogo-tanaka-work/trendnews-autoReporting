/**
 * 外部通信の共通ラッパ。timeout / retry / User-Agent / サイズ上限をここへ集約する。
 * 個々の Collector が fetch を直接呼ばないこと。
 */
import { logger, toErrorMessage } from './logger.js';

export const USER_AGENT = 'TrendNews-AutoReporting/2.0 (+https://github.com/shogo-tanaka-work)';

const DEFAULT_TIMEOUT_MS = 15_000;
const DEFAULT_MAX_RETRIES = 2;
const MAX_RESPONSE_BYTES = 5 * 1024 * 1024;

export type HttpOptions = {
  headers?: Record<string, string>;
  timeoutMs?: number;
  maxRetries?: number;
  /** 呼び出し元を特定するためのログ用ラベル */
  label?: string;
};

export class HttpError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly url: string
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

function isRetryable(status: number): boolean {
  return status === 429 || status === 408 || status >= 500;
}

function backoffMs(attempt: number): number {
  return 500 * 2 ** attempt;
}

async function delay(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * リトライ付きの fetch。ネットワークエラーと 429 / 5xx のみ再試行する。
 * 4xx（429 以外）は設定ミスとして即座に失敗させる。
 */
export async function httpGet(url: string, options: HttpOptions = {}): Promise<Response> {
  const {
    headers = {},
    timeoutMs = DEFAULT_TIMEOUT_MS,
    maxRetries = DEFAULT_MAX_RETRIES,
    label = url,
  } = options;

  let lastError: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (attempt > 0) await delay(backoffMs(attempt - 1));

    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': USER_AGENT, ...headers },
        signal: AbortSignal.timeout(timeoutMs),
        redirect: 'follow',
      });

      if (res.ok || res.status === 304) return res;

      const error = new HttpError(`HTTP ${res.status} ${res.statusText}`, res.status, url);
      if (!isRetryable(res.status)) throw error;

      lastError = error;
      logger.warn('HTTP リトライします', { label, status: res.status, attempt: attempt + 1 });
    } catch (err) {
      if (err instanceof HttpError && !isRetryable(err.status)) throw err;
      lastError = err;
      logger.warn('HTTP リトライします', { label, error: toErrorMessage(err), attempt: attempt + 1 });
    }
  }

  throw new Error(`${label} の取得に失敗しました`, { cause: lastError });
}

/** JSON を取得する。パース結果は unknown のまま返し、呼び出し側で schema 検証する。 */
export async function httpGetJson(url: string, options: HttpOptions = {}): Promise<unknown> {
  const res = await httpGet(url, {
    ...options,
    headers: { Accept: 'application/json', ...options.headers },
  });

  const length = Number(res.headers.get('content-length') ?? '0');
  if (length > MAX_RESPONSE_BYTES) {
    throw new Error(`${options.label ?? url} のレスポンスが大きすぎます (${length} bytes)`);
  }

  return (await res.json()) as unknown;
}
