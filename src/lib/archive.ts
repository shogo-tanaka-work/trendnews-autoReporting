/**
 * 昇格台帳のファイル書き出し。fs への依存はここだけに閉じる。
 *
 * 置き場所はリポジトリ直下の archive/。ミニ PC が書いて commit し、
 * Mac が pull して picks/ へ昇格させる、という一方向の流れを前提にする。
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';

/** JST の YYYY-MM-DD。日付の境目を Asia/Tokyo に合わせる */
export function tokyoDate(at: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tokyo' }).format(at);
}

/**
 * archive/YYYY/MM/YYYY-MM-DD{suffix}.md。日付は tokyoDate の形式であること。
 * 同じ日に別の台帳を書くときは suffix で分ける（例: '-keywords'）。
 */
export function digestPath(archiveDir: string, date: string, suffix = ''): string {
  return join(resolve(archiveDir), date.slice(0, 4), date.slice(5, 7), `${date}${suffix}.md`);
}

/**
 * 同じ日に2回走った場合は上書きする。
 * 追記にすると通知の再送で台帳が重複し、昇格作業の邪魔になるため。
 */
export async function saveDigest(
  archiveDir: string,
  date: string,
  markdown: string,
  suffix = ''
): Promise<string> {
  const target = digestPath(archiveDir, date, suffix);

  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, markdown, 'utf-8');

  return target;
}
