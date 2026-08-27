# trendnews-autoReporting

一次情報（RSS / GitHub Releases / YouTube Data API / Connpass API）と、世の中のトレンド
（はてブ / Hacker News / Qiita / Zenn / GitHub 急上昇 / Google Trends）を自動収集して
SQLite へ蓄積し、新着だけを Slack へ Block Kit で通知する Tech Intelligence 基盤。

- **引き継ぎメモ（ミニ PC 作業はここから）: [docs/引き継ぎメモ.md](docs/引き継ぎメモ.md)**
- 仕様: [docs/SPEC.md](docs/SPEC.md)
- アーキテクチャ決定記録: [docs/ARCH.md](docs/ARCH.md)
- 元要件: [tech-intelligence-requirements.md](tech-intelligence-requirements.md)

## セットアップ

```bash
npm ci
npm run typecheck
npm test
```

ローカル実行には環境変数ファイルが必要。テンプレートと必須項目は
[docs/SPEC.md の「環境変数」](docs/SPEC.md#環境変数) を参照する。

## 開発コマンド

```bash
npm run collect -- tech_cloud   # 単一カテゴリを収集（カテゴリ一覧は npm run collect -- nope で表示）
npm run collect -- all          # 全カテゴリを直列で収集
npm run connpass                # Connpass セミナー情報を通知
npm run dev                     # Hono API を起動（http://127.0.0.1:3000）
npm run build                   # dist/ へビルド
npm run gen:systemd             # カテゴリ設定から systemd timer の drop-in を生成
```

Slack チャンネルが未設定のカテゴリは、収集だけ行って通知をスキップする。
チャンネルを作る前でも安全に動かせる。

## API

listen 先は `API_HOST` / `API_PORT` で決まる（既定は `127.0.0.1:3000`）。他のアプリとポートが競合する場合はここを変える。

```bash
curl http://127.0.0.1:3000/health
curl 'http://127.0.0.1:3000/articles?category=tech_web&limit=10'
curl 'http://127.0.0.1:3000/articles?importance=A&from=2026-08-01'
curl http://127.0.0.1:3000/sources
curl http://127.0.0.1:3000/categories

# 手動収集（ADMIN_TOKEN 必須。未設定なら 503）
curl -X POST http://127.0.0.1:3000/admin/collect \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"category":"tech_cloud"}'
```

## Ubuntu ミニ PC へのデプロイ

このリポジトリを**置いた場所のまま** systemd から動かす。コードも秘密値も複製しないので、
更新は `git pull` のあとにスクリプトを実行し直すだけでよい。

```bash
sudo bash scripts/deploy-minipc.sh
```

`scripts/deploy-minipc.sh` がやること:

1. unit の `User=` / `WorkingDirectory=` / `ExecStart=` の node が、実体と一致するかを先に検査する
   （ずれていると配置は通るのに起動だけが `203/EXEC` などで失敗する）
2. `better-sqlite3` が unit の node で読み込めるか確かめ、駄目なら `npm rebuild` する
   （native module なので、開発と実行で node の ABI が違うと実行時にだけ落ちる）
3. `npm run build` と `npm run gen:systemd`
4. **unit 本体（`*.service` / `*.timer`）と drop-in の両方**を `/etc/systemd/system/` へ置く。
   `generated/` は drop-in だけなので、これだけでは `Unit ... not found` になる
5. 全カテゴリの `tech-radar-collect@<category>.timer` と `tech-radar-connpass.timer` を有効化する。
   環境変数が揃っていなければ API は `enable` だけして起動しない

### 前提

- **Node.js 20 以上**。`systemd/*.service` の `ExecStart` が絶対パスで node を指しているので、
  node を入れ替えたらここも直す（nvm でバージョンを上げたときが該当する）。
- **秘密値はリポジトリ直下の dotenv ファイル**に置く。`src/lib/env.ts` がこれを読むため、
  `npm run collect` などの手動実行と systemd 実行で同じ設定になる。
  systemd の `EnvironmentFile=` は二重管理になるので使わない。
- サービスは**リポジトリの所有ユーザー**として動く。`ProtectSystem=strict` を掛けているので、
  書き込み先は unit の `ReadWritePaths=`（`data/`、trend_digest のみ `archive/` と `.git/`）だけ。

### 運用確認

```bash
systemctl list-timers 'tech-radar-*'
journalctl -u tech-radar-collect@tech_cloud --since today
systemctl start tech-radar-collect@tech_cloud   # 手動で1回走らせる
sqlite3 data/tech-radar.sqlite \
  'SELECT job_name, status, new_count, error_message FROM job_runs ORDER BY id DESC LIMIT 10;'
```

スケジュールの正本は `src/config/categories.ts` の `schedule`。変更したら
`sudo bash scripts/deploy-minipc.sh` を実行し直す（`npm run gen:systemd` の出力にも手順が出る）。

## 昇格の運用（trend_digest）

トレンドダイジェストは Slack で気づくための入口で、掘る対象を選ぶのは `archive/` の台帳。

```
[Mac] 開発 ──push──> GitHub ──pull──> [ミニ PC] 毎朝 07:15 収集
                                          ├─ Slack へ通知
                                          └─ archive/YYYY/MM/*.md を commit して push
[Mac] pull ──> チェックを付けた行を picks/ へ ──> 発信運用から symlink
```

1. ミニ PC が `archive/YYYY/MM/YYYY-MM-DD.md` を commit → Mac で pull
2. 掘りたい項目のチェックボックスを埋め、`picks/` へ切り出す
3. 発信運用側から `picks/` の該当ファイルへ symlink を張る

台帳は**通知できた分だけ**書き出す。Slack 送信に失敗した記事は次回に再送されるため、
送信前に書くと同じ日の台帳を二度書くことになる。

`archive/` を push し返すので、ミニ PC の SSH 鍵に**書き込み権限**が要る
（deploy key なら Allow write access）。サービスはリポジトリの所有ユーザーとして動くので、
普段 `git push` に使っている鍵がそのまま使われる。

## 情報源を足す

`src/config/categories.ts` に1行足すだけでよい。

```ts
{ id: 'gh-drizzle', type: 'github', name: 'Drizzle ORM', repo: 'drizzle-team/drizzle-orm', emoji: ':droplet:' }
```

- `type: 'rss'` … `url` を指定。Cloudflare のように category が付くフィードは `includeCategories` で絞れる
- `type: 'github'` … `repo` は `owner/name`。`includePrerelease: true` で prerelease も拾う
- `type: 'youtube'` … `channelRef` に `UC...` のチャンネル ID か `@handle` を指定する
- `type: 'ranking'` … `provider` に取得元を指定する（はてブ / Hacker News / Qiita / Zenn /
  GitHub 急上昇 / YouTube 急上昇 / Google Trends）。`weight` で情報源の信頼度を 0〜1 で表す

通知量はカテゴリ側の `maxPerNotification`（1回の総件数）で決まるので、情報源を足しても
通知が増えることはない。詳細は [docs/SPEC.md の「通知量の設計」](docs/SPEC.md#通知量の設計)。
