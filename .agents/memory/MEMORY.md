# プロジェクト継続情報

セッションをまたいで引き継ぐ情報だけを置く。仕様は`docs/SPEC.md`、設計判断は`docs/ARCH.md`が正本。

## 更新ルール

- 現行で正しい状態だけを書き、経緯・履歴・セッションIDを残さない。
- 相対日付（昨日・最近）は絶対日付（YYYY-MM-DD）へ変換する。
- 秘密値そのものを書かず、変数名と保管場所だけを書く。
- コードやgit履歴から読み取れることを書かない。
- 作業単位が終わったタイミングで更新する。

## 現在地

- フェーズ: ミニ PC（shogo-NucBox-G3、`~/apps/trendnews-autoReporting`）で systemd 稼働中。
  2026-09-25 に通知整理後の構成を反映し、timer は economy / engineer / whiskey / neta_weekly / keywords / connpass の6つ。
  廃止カテゴリの timer と drop-in は削除済み。
- 次にやること: 2026-09-27（日）08:50 の keywords で関連クエリのノイズ除去の効きを確認し、
  `IGNORED_RISING_QUERIES`（`src/config/keywords.ts`）を調整する。除いたクエリは journal の「ノイズとみなした関連クエリ」に出る。
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
  - 依存・unit・スクリプトが変わらないコードだけの更新なら、`git pull` → `npm run build` で次回のジョブから反映される（API は別途 restart が要る）。
- sudo はパスワードが要り、dotenv ファイルの確認は hook がブロックする。どちらも利用者に `!` 付きで実行してもらう。
  長い sudo コマンドをチャットから SSH 端末へ貼ると `_` が空白に化けたことがあるので、スクリプトファイルにして渡す。
- 検証: `npm run typecheck` → `npm test` → `npm run build` → `npm run gen:systemd`
- 秘密値の保管場所: リポジトリ直下の dotenv ファイル。変数名は`.env.example`と`docs/SPEC.md`を参照
- API の listen 先: `API_PORT=3100`（3000 は別プロジェクトが使用中。下記「落とし穴」）

## 未解決の課題

- Connpass API v2 で `prefecture` と `keyword_or`・`ymd` の結合条件（AND/OR）は公式資料に記載がなく、実機で未確認。
- connpass の近場の候補が取得上限（100件）で切れる。2026-09-25 は全106件。取りこぼしが問題になるなら上限の扱いを見直す。
- 通知日（土曜）に実行を逃すと、`notifyDays` のカテゴリは翌週の通知日まで持ち越しになる。

## 落とし穴

- **ポート 3000 は別プロジェクトが占有している**（`/var/www/workout/myTrainingNote_v2`、www-data、
  ブート時から常駐）。止めないこと。Tech Radar は`API_PORT=3100`を使う。
- **timer の時刻を変えて配置すると、その場でジョブが走り Slack に通知が飛ぶ**（`Persistent=true`のため、
  前回実行が新しい時刻より前だと取りこぼし扱いになる）。2026-09-25 の深夜に economy_news と connpass が通知した。
  時刻を変える配置は、通知されても困らない時間帯に行う。
- **ミニ PC の checkout に未コミットの変更を残さない・ブランチを切り替えない**。neta_weekly の
  `commit-archive.sh` が `git pull --rebase` するため失敗する。ミニ PC で開発するときは `git worktree` で別ディレクトリに作る。
- **`systemd/*.service`の`ExecStart`は nvm の node を絶対パスで指す**。
  `nvm install`でバージョンを上げるとパスが切れるので、unit 側も直す。
  `deploy-minipc.sh`が起動前に検出して止まる。
- **`ReadWritePaths=`は存在しないパスを指定すると`226/NAMESPACE`で起動失敗する**。
  `data/`は Git 管理外なので`deploy-minipc.sh`が unit から読み取って作る。
- `gen:systemd` と `deploy-minipc.sh` は配置済みの timer を消さない。カテゴリを削除したらミニ PC 側で disable する。
- `tsconfig.test.json` は `tsconfig.json` の exclude（`**/*.test.ts`）を継承しており、テストファイルは型検査されていない。
