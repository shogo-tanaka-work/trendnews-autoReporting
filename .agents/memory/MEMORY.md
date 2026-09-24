# プロジェクト継続情報

セッションをまたいで引き継ぐ情報だけを置く。仕様は`docs/SPEC.md`、設計判断は`docs/ARCH.md`が正本。

## 更新ルール

- 現行で正しい状態だけを書き、経緯・履歴・セッションIDを残さない。
- 相対日付（昨日・最近）は絶対日付（YYYY-MM-DD）へ変換する。
- 秘密値そのものを書かず、変数名と保管場所だけを書く。
- コードやgit履歴から読み取れることを書かない。
- 作業単位が終わったタイミングで更新する。

## 現在地

- フェーズ: ミニ PC（`/opt/tech-radar`、systemd）で本番稼働中。通知は economy / engineer / whiskey / connpass の4本に絞った。
- 次にやること: ミニ PC へ反映し、廃止カテゴリの timer を止める（手順は README「カテゴリを廃止したとき」）。connpass を手動実行して都内・オンラインに絞れているか確認する。
- 実装済み（ミニ PC 未反映）: ネタ週報（neta_weekly、日曜 09:00）、キーワードの動き（日曜 08:50）、connpass の中野近辺オフライン。
- その後: 台帳（archive/）を cloud routine で読み、SE 目線の切り口を付けて Linear に週1件起票する（SHO-237 の昇格先）。

## 決定済みで動かさないこと

- AI・クラウドの公式アップデートは shogo-works の日次 AI ニュース運用が担う。ここへ戻さない。
- 平日の通知は朝の economy_news だけ。増やすときは曜日指定（`notifyDays`）を先に検討する。

## 環境と実行

- 検証: `npm run typecheck` → `npm test` → `npm run build` → `npm run gen:systemd`
- 秘密値の保管場所: ミニ PC の `/opt/tech-radar/environment`（変数名は docs/SPEC.md「環境変数」）。

## 未解決の課題

- ミニ PC が GitHub 上の main と同じ版で動いているか未確認。台帳 push（archive/）は origin に 2026-08-27 分しか届いていない。
- Connpass API v2 で `prefecture` と `keyword_or`・`ymd` の結合条件（AND/OR）は公式資料に記載がなく、実機で未確認。
- 通知日（土曜）に実行を逃すと、`notifyDays` のカテゴリは翌週の通知日まで持ち越しになる。

## 落とし穴

- `tsconfig.test.json` は `tsconfig.json` の exclude（`**/*.test.ts`）を継承しており、テストファイルは型検査されていない。

- `gen:systemd` は配置済みの timer を消さない。カテゴリを削除したらミニ PC 側で disable する。
