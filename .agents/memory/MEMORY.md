# プロジェクト継続情報

セッションをまたいで引き継ぐ情報だけを置く。仕様は`docs/SPEC.md`、設計判断は`docs/ARCH.md`が正本。

## 更新ルール

- 現行で正しい状態だけを書き、経緯・履歴・セッションIDを残さない。
- 相対日付（昨日・最近）は絶対日付（YYYY-MM-DD）へ変換する。
- 秘密値そのものを書かず、変数名と保管場所だけを書く。
- コードやgit履歴から読み取れることを書かない。
- 作業単位が終わったタイミングで更新する。

## 現在地

- フェーズ: ミニ PC（shogo-NucBox-G3、`~/apps/trendnews-autoReporting`）で systemd 稼働中。通知は economy / engineer / whiskey / neta_weekly / keywords / connpass に絞った。
- 次にやること: main を pull して `sudo bash scripts/deploy-minipc.sh` を再実行し、廃止カテゴリの timer を止める（README「カテゴリを廃止したとき」）。keywords と connpass を手動実行して実出力を確認する。
- その後: 台帳（archive/）を cloud routine で読み、SE 目線の切り口を付けて Linear に週1件起票する（SHO-237 の昇格先）。

## 決定済みで動かさないこと

- **リポジトリを置いた場所のまま動かす**。`/opt/tech-radar` へ複製する構成は 2026-08-28 に廃止した。
  秘密値の置き場所を見失うのが理由。
- **サービス実行ユーザーは `shogo`**。`/home/shogo`が`drwxr-x---`で専用ユーザーから辿れず、
  `archive/`のpushに使うSSH鍵もそのまま使えるため。
- **秘密値はリポジトリ直下の dotenv ファイル1箇所**。`src/lib/env.ts`がこれを読む。
  systemdの`EnvironmentFile=`は二重管理になるので使わない。
- AI・クラウドの公式アップデートは shogo-works の日次 AI ニュース運用が担う。ここへ戻さない。
- 平日の通知は朝の economy_news だけ。増やすときは曜日指定（`notifyDays`）を先に検討する。

## 環境と実行

- デプロイ: `sudo bash scripts/deploy-minipc.sh`（冪等。コード更新は`git pull`のあとに再実行）
- 検証: `npm run typecheck` → `npm test` → `npm run build` → `npm run gen:systemd`
- 秘密値の保管場所: リポジトリ直下の dotenv ファイル。変数名は`.env.example`と`docs/SPEC.md`を参照
- API の listen 先: `API_PORT=3100`（3000 は別プロジェクトが使用中。下記「落とし穴」）

## 未解決の課題

- Connpass API v2 で `prefecture` と `keyword_or`・`ymd` の結合条件（AND/OR）は公式資料に記載がなく、実機で未確認。
- SerpApi（キーワードの動き）の実リクエストが未確認。
- 通知日（土曜）に実行を逃すと、`notifyDays` のカテゴリは翌週の通知日まで持ち越しになる。

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
- `gen:systemd` と `deploy-minipc.sh` は配置済みの timer を消さない。カテゴリを削除したらミニ PC 側で disable する。
- `tsconfig.test.json` は `tsconfig.json` の exclude（`**/*.test.ts`）を継承しており、テストファイルは型検査されていない。
