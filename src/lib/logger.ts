/**
 * 構造化 JSON ログ。journald からそのまま追える形にする。
 *
 * token / API key / 個人情報をフィールドへ入れないこと。
 */

const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 } as const;

export type LogLevel = keyof typeof LEVELS;
export type LogFields = Record<string, string | number | boolean | null | undefined>;

let threshold: number = LEVELS.info;

export function setLogLevel(level: LogLevel): void {
  threshold = LEVELS[level];
}

function emit(level: LogLevel, message: string, fields?: LogFields): void {
  if (LEVELS[level] < threshold) return;

  const line = JSON.stringify({
    ts: new Date().toISOString(),
    level,
    message,
    ...fields,
  });

  if (level === 'error' || level === 'warn') {
    console.error(line);
  } else {
    console.log(line);
  }
}

export const logger = {
  debug: (message: string, fields?: LogFields) => emit('debug', message, fields),
  info: (message: string, fields?: LogFields) => emit('info', message, fields),
  warn: (message: string, fields?: LogFields) => emit('warn', message, fields),
  error: (message: string, fields?: LogFields) => emit('error', message, fields),
};

/**
 * unknown を安全なメッセージ文字列へ変換する。
 * スタックトレースや秘密値を含みうる本文をそのまま出さないため、message のみ取り出す。
 */
export function toErrorMessage(err: unknown): string {
  if (err instanceof Error) {
    const cause = err.cause instanceof Error ? ` (cause: ${err.cause.message})` : '';
    return `${err.message}${cause}`;
  }
  if (typeof err === 'string') return err;
  return 'unknown error';
}
