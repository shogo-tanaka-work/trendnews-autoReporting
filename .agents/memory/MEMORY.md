# プロジェクト継続情報

セッションをまたいで引き継ぐ情報だけを置く。仕様は`docs/SPEC.md`、設計判断は`docs/ARCH.md`が正本。

## 更新ルール

- 現行で正しい状態だけを書き、経緯・履歴・セッションIDを残さない。
- 相対日付（昨日・最近）は絶対日付（YYYY-MM-DD）へ変換する。
- 秘密値そのものを書かず、変数名と保管場所だけを書く。
- コードやgit履歴から読み取れることを書かない。
- 作業単位が終わったタイミングで更新する。

## 現在地

- フェーズ: ミニ PC（shogo-NucBox-G3）で systemd 稼働開始。
- 直近の作業: 2026-08-28、`sudo bash scripts/deploy-minipc.sh` で unit を配置。
  収集 timer 12本が有効、API は稼働中。失敗ユニットなし。
- 次にやること: Slack への実投稿確認と `trend_digest` の台帳 push 確認。
  どちらも未実施（下記「未解決の課題」）。

## 決定済みで動かさないこと

- **リポジトリを置いた場所のまま動かす**。`/opt/tech-radar` へ複製する構成は 2026-08-28 に廃止した。
  秘密値の置き場所を見失うのが理由。
- **サービス実行ユーザーは `shogo`**。`/home/shogo`が`drwxr-x---`で専用ユーザーから辿れず、
  `archive/`のpushに使うSSH鍵もそのまま使えるため。
- **秘密値はリポジトリ直下の dotenv ファイル1箇所**。`src/lib/env.ts`がこれを読む。
  systemdの`EnvironmentFile=`は二重管理になるので使わない。

## 環境と実行

- デプロイ: `sudo bash scripts/deploy-minipc.sh`（冪等。コード更新は`git pull`のあとに再実行）
- 検証: `npm test` → `npm run typecheck` → `npm run build`
- 秘密値の保管場所: リポジトリ直下の dotenv ファイル。変数名は`.env.example`と`docs/SPEC.md`を参照
- API の listen 先: `API_PORT=3100`（3000 は別プロジェクトが使用中。下記「落とし穴」）

## 未解決の課題

- Slack への実投稿が未確認。`sudo systemctl start tech-radar-collect@tech_cloud`で確認する。
- `trend_digest`の`ExecStartPost`（`scripts/commit-archive.sh`）による台帳の commit / push が未確認。
  `ProtectSystem=strict`下で`.git/`と`archive/`だけを開けている構成のため、実行して確かめる必要がある。
- YouTube 収集（`YOUTUBE_API_KEY`と`channelRef`の解決）が未確認。詳細は`docs/引き継ぎメモ.md`のD章。

## 落とし穴

- **ポート 3000 は別プロジェクトが占有している**（`/var/www/workout/myTrainingNote_v2`、www-data、
  ブート時から常駐）。止めないこと。Tech Radar は`API_PORT=3100`を使う。
- **旧 node-cron 版 `my-cron-app.service` は 2026-08-28 に disable 済み**
  （`~/ドキュメント/trendnews-autoReporting`）。再度有効化すると Slack へ二重通知される。
- **`systemd/*.service`の`ExecStart`は nvm の node を絶対パスで指す**。
  `nvm install`でバージョンを上げるとパスが切れるので、unit 側も直す。
  `deploy-minipc.sh`が起動前に検出して止まる。
- **`ReadWritePaths=`は存在しないパスを指定すると`226/NAMESPACE`で起動失敗する**。
  `data/`は Git 管理外なので`deploy-minipc.sh`が unit から読み取って作る。
