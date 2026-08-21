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
