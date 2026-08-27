# アーキテクチャ決定記録

## ADR-001: Backend Framework に Hono を採用する
- 決定: Node.js + Hono
- 理由: Web Standards ベースで Cloudflare Workers へそのまま持っていける。今回必要なのは
  API / Collector / Batch であり、Express のエコシステムも Next.js の SSR も要らない。
- 日付: 2026-08-21

## ADR-002: V1 のデータストアは SQLite
- 決定: better-sqlite3 + `data/tech-radar.sqlite`
- 理由: 単一ユーザー・小データ量。SQL で扱え、バックアップが容易。D1 が SQLite 系の SQL semantics を
  採るため将来移行しやすい。DDL は SQLite / D1 の双方で通る構文に限定する。
- 日付: 2026-08-21

## ADR-003: 重複排除を「時間窓」から「DB」へ変える
- 決定: `articles` の `UNIQUE(source_id, external_id)` と `notified_at IS NULL` で判定する
- 理由: 旧実装は「発行時刻が `FILTER_HOURS` 以内か」でしか重複を見ていなかったため、実行タイミングが
  ずれると取りこぼしと二重通知が起きた。`FILTER_HOURS` は廃止する。
- 補足: 同じ URL を複数カテゴリで購読することは意図的に許すので `url` に UNIQUE は張らない。
- 日付: 2026-08-21

## ADR-004: スケジューラを node-cron から systemd timer へ移す
- 決定: `tech-radar-collect@<category>.timer` をカテゴリごとに有効化する
- 理由: status / journalctl / 実行履歴が揃い、無人運用時の障害確認がしやすい。
  常駐プロセスが死ぬと全カテゴリが止まる node-cron の単一障害点も外れる。
- 補足: スケジュールの正本は `src/config/categories.ts` の `schedule`。
  `npm run gen:systemd` が drop-in を生成し、unit 側へ時刻をコピーしない。
- 日付: 2026-08-21

## ADR-005: Collector を Framework から独立させる
- 決定: `services/collect.ts` の `collectAll()` は Hono も systemd も知らない
- 理由: CLI（`jobs/collect.ts`）と `POST /admin/collect` が同じ関数を呼ぶ。将来 Workers の
  `scheduled` ハンドラからも同じ関数を呼べる。
- 日付: 2026-08-21

## ADR-006: LLM の前にルールベースで絞る
- 決定: `config/scoring.ts` のキーワード配点で一次スクリーニングし、`article_scores` へ保存する
- 理由: 全記事を LLM へ送るとコストが読めない。V1 は LLM なしで運用し、
  `llm_reason` / `should_read_now` 列だけ空けておく。
- 日付: 2026-08-21

## ADR-007: スクレイピングを最終手段にする
- 決定: API > RSS > HTTP GET の順で取得し、Browser Rendering は実装しない
- 理由: 壊れにくさと低コストを優先する。将来必要になったら `ContentFetcher` の別実装を足す。
- 日付: 2026-08-21

## ADR-008: 通知対象は「今回挿入した分」ではなく「未通知の全件」
- 決定: `services/collect.ts` は収集後に `articles.listPending(category)` を引き、
  そこから通知対象を選ぶ
- 理由: 挿入分だけを対象にすると、Slack 送信に失敗した記事が二度と再送されない。
  未通知キューを見ることで、送信失敗・チャンネル未設定からの復帰が自然に再送になる。
- 補足: 1回あたり 2000 件を上限とし、`maxPerSource` と `minScore` で通知量を抑える。
  選外になった記事とカテゴリ設定から外れた情報源の記事は、その場で処理済みにして滞留させない。
- 日付: 2026-08-21

## ADR-009: 通知量を「頻度」と「1回の件数」の2軸で抑える
- 決定: `CategoryConfig` に `maxPerNotification` を足し、速報は `tech_cloud` / `tech_ai` のみに絞る
- 理由: 既存6カテゴリは全件通知（`maxPerSource` のみ）だったため、上限が情報源数に比例して
  膨らみ、1日あたり最大 400 件・通知15回超になっていた。頻度だけを下げても1回の量が増えるので
  効かない。カテゴリ全体の件数上限を併用して初めて量が制御できる。
- 補足: 週次カテゴリは7日分から上位を選ぶため、件数が減ると同時に選抜の質が上がる。
  選外の記事は既読化するが DB には残るので `GET /articles` から引ける。
- 日付: 2026-08-27

## ADR-010: 選抜方法を selector で切り替える
- 決定: `useScoring: boolean` を廃し、`selector: 'per_source' | 'ranking' | 'scoring'` にする
- 理由: 選抜方法は2択ではなくなった。真偽値のままだと `ranking` を足すたびに条件が増える。
  また `useScoring` は `selector === 'scoring'` から導出できるので、二重に持つ必要がない。
- 補足: `ranking` は「情報源内の順位 × 情報源の重み ＋ 複数ソース出現ボーナス」で採点する。
  ドメインに依存しないため、経済でもウイスキーでも同じ選抜が効く。順位は
  `articles.source_rank` に保存し、RSS の掲載順・GitHub のリリース順をそのまま使う。
- 日付: 2026-08-27

## ADR-011: 既存 DB への列追加は ADD_COLUMNS で行う
- 決定: `db/schema.ts` の `ADD_COLUMNS` を `openDatabase()` が毎回適用する
- 理由: `CREATE TABLE IF NOT EXISTS` は既存テーブルへ列を足さないため、`source_rank` のような
  後付けの列が本番 DB に反映されない。マイグレーションツールを入れるほどの規模ではないので、
  `PRAGMA table_info` で存在を見てから `ALTER TABLE` する最小の仕組みに留める。
- 補足: 既存行を埋められないため、ここへ足す列は必ず NULL 許容にする。
- 日付: 2026-08-27

## ADR-012: トレンド発掘を trend_digest カテゴリとして統合する
- 決定: 旧 `trend-keyword-researcher`（別リポジトリ・Discord 通知）の7情報源を
  `type: 'ranking'` の情報源として取り込み、`trend_digest` カテゴリにまとめる
- 理由: 収集・正規化・重複排除・通知・systemd 常駐という骨格が同一で、`http` と
  `normalizeUrl` を二重に実装していた。器を共通化し、違い（ランキング統合という
  選抜ロジック）だけを `selector: 'ranking'` として持つ。
- 補足: 通知先は Discord Webhook から Slack Bot token へ移す。Webhook URL は
  それ自体が認証情報で scope 制限も監査ログも無く、失効以外の制御手段がない。
- 補足: 旧実装の「直近14日のアーカイブを読んで再掲抑制」は、
  `UNIQUE(source_id, external_id)` による恒久的な重複排除へ置き換える。
- 日付: 2026-08-27

## ADR-013: Slack は入口、archive/ が昇格台帳
- 決定: `archiveDigest: true` のカテゴリは、通知できた記事を
  `archive/YYYY/MM/YYYY-MM-DD.md` へチェックボックス付きで書き出す
- 理由: Slack は流れて消えるため、「掘る対象を選ぶ」作業には向かない。
  旧 trend-keyword-researcher が持っていた archive → picks → 発信運用の導線は
  運用として機能していたので、通知先を Slack へ移しても台帳は残す。
- 補足: 台帳は通知が成功した分だけ書く。送信前に書くと、失敗して再送された回で
  同じ日の台帳を二度書くことになる。同日再実行時は追記ではなく上書きする。
- 補足: 台帳の commit / push は systemd の ExecStartPost（trend_digest 専用の
  drop-in）で行う。ProtectSystem=strict のため archive/ と .git/ を
  ReadWritePaths で明示的に開ける必要がある。
- 日付: 2026-08-27

## 現在のアーキテクチャ

```text
systemd timer (カテゴリごと)          Hono API (常時起動)
        │                                    │
        ▼                                    ▼
 jobs/collect.ts                    POST /admin/collect
        └────────────┬───────────────────────┘
                     ▼
            services/collect.ts
                     │
     ┌───────────────┼────────────────┐
     ▼               ▼                ▼
 collectors/     services/        services/
 rss|github|     normalize.ts     score.ts
 youtube                │              │
                        ▼              ▼
                 db/repositories (SQLite)
                        │
                        ▼
                 services/notify.ts → notifiers/slack.ts
```
