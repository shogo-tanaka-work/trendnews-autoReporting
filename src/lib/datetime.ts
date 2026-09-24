/** 表示用の日時整形。保存は常に ISO8601(UTC)、表示だけ JST に寄せる。 */
import { WEEKDAYS, type Weekday } from '../domain/source.js';

const JST = 'Asia/Tokyo';

export function formatJst(isoDate: string | null | undefined): string {
  if (!isoDate) return '日時不明';

  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) return '日時不明';

  return date.toLocaleString('ja-JP', {
    timeZone: JST,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** イベント日時（年を省き曜日を添える） */
export function formatJstEvent(isoDate: string | null | undefined): string {
  if (!isoDate) return '日時未定';

  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) return '日時未定';

  const weekday = date.toLocaleDateString('ja-JP', { timeZone: JST, weekday: 'short' });
  const body = date.toLocaleString('ja-JP', {
    timeZone: JST,
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  return `${body}(${weekday})`;
}

function isWeekday(value: string): value is Weekday {
  return (WEEKDAYS as readonly string[]).includes(value);
}

/** JST での曜日。systemd timer と同じく Asia/Tokyo 基準で判定する */
export function tokyoWeekday(date: Date): Weekday {
  const weekday = date.toLocaleDateString('en-US', { timeZone: JST, weekday: 'short' });
  if (!isWeekday(weekday)) throw new Error(`曜日を判定できません: ${weekday}`);
  return weekday;
}
