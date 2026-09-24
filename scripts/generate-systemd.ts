/**
 * カテゴリ設定から systemd timer の drop-in を生成する。
 *
 *   npm run gen:systemd
 *
 * スケジュールの正本は src/config/categories.ts の schedule であり、
 * unit ファイル側に時刻をコピーして二重管理しないための仕組み。
 */
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { CATEGORIES } from '../src/config/categories.js';

const OUTPUT_DIR = join(process.cwd(), 'systemd', 'generated');

function dropInContent(categoryKey: string, schedule: string): string {
  return [
    `# 自動生成: src/config/categories.ts (${categoryKey})`,
    '# 手で編集せず、categories.ts を直して npm run gen:systemd を実行すること。',
    '[Timer]',
    '# テンプレート側の値をリセットしてから設定する',
    'OnCalendar=',
    `OnCalendar=${schedule}`,
    '',
  ].join('\n');
}

function main(): void {
  rmSync(OUTPUT_DIR, { recursive: true, force: true });
  mkdirSync(OUTPUT_DIR, { recursive: true });

  const generated: string[] = [];

  for (const category of CATEGORIES) {
    const dir = join(OUTPUT_DIR, `tech-radar-collect@${category.key}.timer.d`);
    mkdirSync(dir, { recursive: true });

    const path = join(dir, 'schedule.conf');
    writeFileSync(path, dropInContent(category.key, category.schedule), 'utf8');
    generated.push(`${category.key}\t${category.schedule}`);
  }

  console.log(`生成しました: ${OUTPUT_DIR}`);
  for (const line of generated) console.log(`  ${line}`);
  console.log('');
  console.log('ミニ PC への反映:');
  console.log('  # 配置・ビルド・unit 登録・timer 有効化まで一括で行う');
  console.log('  sudo bash scripts/deploy-minipc.sh');
  console.log('');
  console.log('  # スケジュールだけ入れ替える場合（unit 本体は配置済みが前提）');
  console.log('  sudo cp -r systemd/generated/. /etc/systemd/system/');
  console.log('  sudo systemctl daemon-reload');
  for (const category of CATEGORIES) {
    console.log(`  sudo systemctl restart tech-radar-collect@${category.key}.timer`);
  }
}

main();
