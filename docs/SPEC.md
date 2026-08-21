# trendnews-autoReporting 仕様

作成日: 2026-08-21
バージョン: 2.0（Tech Intelligence 基盤への刷新）

要件の元資料: [tech-intelligence-requirements.md](../tech-intelligence-requirements.md)

## 目的

公式ブログ・Changelog・GitHub Releases・YouTube Data API といった一次情報を自動収集して
SQLite へ蓄積し、新着だけを Slack へ通知する。二次情報（X / YouTube 解説）に依存せず、
技術の動きを薄く俯瞰し続けられる状態を作る。

## 技術スタック

| 項目 | 採用 |
|---|---|
| Language | TypeScript（strict） |
| Runtime | Node.js 20+（動作確認は 24） |
| API Framework | Hono + @hono/node-server |
| Local DB | SQLite（better-sqlite3） |
| Scheduler | systemd timer（Ubuntu ミニ PC） |
| 通知 | Slack Block Kit（@slack/web-api） |
| バリデーション | zod |
| テスト | Vitest |

将来 Cloudflare Workers + D1 へ移せるよう、Node 依存（`process.env` / `fs` / SQLite ドライバ）は
`lib/env.ts` と `db/` に閉じ込め、Collector と Service は Framework を知らない。

## カテゴリ

収集とスケジュールの正本は `src/config/categories.ts`。

| カテゴリ | 内容 | 方式 | スケジュール(JST) |
|---|---|---|---|
| `ai_news` | AI 企業公式 / 国内 AI メディア | RSS | 08:00, 20:00 |
| `engineer_news` | 国内 IT 総合 / AWS / Google Workspace | RSS | 08:10, 20:10 |
| `economy_news` | 経済・市場・暗号資産 | RSS | 08:20, 20:20 |
| `business_news` | 制度・バックオフィス・仕事術 | RSS | 08:30 |
| `fitness_news` | 筋トレ | RSS | 17:00 |
| `whiskey_news` | ウイスキー | RSS | 22:00 |
| `tech_cloud` | AWS What's New / Cloudflare Changelog / GitHub Changelog / GCP Release Notes | RSS | 08:40, 20:40 |
| `tech_ai` | LangGraph / LangChain / MCP / ADK / OpenAI Agents / Anthropic SDK ほか | GitHub Releases API | 08:50, 20:50 |
| `tech_web` | React / Next.js / Vite / TanStack / Hono / TypeScript / Node / Bun / Deno | GitHub Releases API | 09:10 |
| `tech_youtube` | 技術系チャンネルの新着 | YouTube Data API v3 | 10:00 |
| Connpass | セミナー・勉強会 | Connpass API v2 | 09:00 |

`tech_*` はルールベーススコアリング（`src/config/scoring.ts`）で `minScore` 未満を通知から除外し、
スコア降順で並べる。既存6カテゴリは全件を発行日時の降順で通知する（現行仕様の維持）。

## データモデル

| テーブル | 役割 |
|---|---|
| `sources` | 情報源。カテゴリ設定から毎回 upsert する |
| `articles` | 収集した記事。`UNIQUE(source_id, external_id)` で重複取得を防ぐ |
| `article_scores` | ルールベーススコアと importance（A/B/C）。LLM 判定用の列を空けてある |
| `job_runs` | 実行履歴。無人運用時の障害確認用 |

`articles.notified_at` が NULL のもの（未通知キュー）を毎回の収集後に引き直して Slack へ送る。
**時間窓（旧 `FILTER_HOURS`）ではなく DB で重複排除する**ため、実行間隔がずれても取りこぼし・
二重通知が起きず、Slack 送信に失敗した記事は次回実行で再送される。
`minScore` / `maxPerSource` で選外になった記事は、その場で処理済みにして滞留させない。

同じ URL を複数カテゴリで購読することは意図的に許すので、`url` に UNIQUE は張らない。

## API

| エンドポイント | 内容 |
|---|---|
| `GET /health` | ヘルスチェック |
| `GET /articles` | `?category=` `?source=` `?importance=A` `?from=2026-08-01` `?limit=` |
| `GET /articles/:id` | 単体取得 |
| `GET /sources` | 登録済みの情報源 |
| `GET /categories` | カテゴリ定義とスケジュール |
| `POST /admin/collect` | 手動収集。Bearer 認証必須 |

`POST /admin/collect` は `ADMIN_TOKEN` 未設定なら 503（fail closed）。既定で `127.0.0.1` にのみ bind する。

## 環境変数

`.env.example` は権限設定の都合で自動更新できていない。以下を反映すること。

```dotenv
# Slack
SLACK_BOT_TOKEN=xoxb-your-token-here
SLACK_CHANNEL_AI_NEWS=C0XXXXXXXXX
SLACK_CHANNEL_ENGINEER_NEWS=C0XXXXXXXXX
SLACK_CHANNEL_WHISKEY_NEWS=C0XXXXXXXXX
SLACK_CHANNEL_FITNESS_NEWS=C0XXXXXXXXX
SLACK_CHANNEL_BUSINESS_NEWS=C0XXXXXXXXX
SLACK_CHANNEL_ECONOMY_NEWS=C0XXXXXXXXX
# 以下は新規（チャンネル作成後に設定する。未設定なら収集だけ行い通知はスキップ）
SLACK_CHANNEL_TECH_CLOUD=C0XXXXXXXXX
SLACK_CHANNEL_TECH_WEB=C0XXXXXXXXX
SLACK_CHANNEL_TECH_AI=C0XXXXXXXXX
SLACK_CHANNEL_TECH_YOUTUBE=C0XXXXXXXXX

# 情報源の API キー
# GITHUB_TOKEN は public repo の read のみ（未設定でも動くがレート制限が 60 req/h になる）
GITHUB_TOKEN=
# 未設定なら tech_youtube の収集だけがスキップされる
YOUTUBE_API_KEY=
CONNPASS_API_KEY=your-connpass-api-key-here
SLACK_CHANNEL_CONNPASS=C0XXXXXXXXX
CONNPASS_KEYWORDS=AI,機械学習,Python,TypeScript,AWS,クラウド

# DB / API
DATABASE_PATH=data/tech-radar.sqlite
API_HOST=127.0.0.1
API_PORT=3000
# 16文字以上。未設定なら管理 API は 503 で無効化される
ADMIN_TOKEN=
LOG_LEVEL=info
```

**廃止した変数**: `CRON_*`（→ systemd timer / `categories.ts` の `schedule`）、
`FILTER_HOURS`（→ DB による重複排除）。

## やらないこと（スコープ外）

- LLM スクリーニング（Phase 3）。`article_scores` の `llm_reason` / `should_read_now` を空けてある
- Daily / Weekly Digest（Phase 3）
- 管理画面（Phase 4。Vite + React + TanStack Router を候補とする）
- Cloudflare Workers / D1 への移行（Phase 5。必要になったときだけ）
- Browser Rendering。`ContentFetcher` interface だけ定義し、実装は HTTP のみ

## 完了の定義

- [x] Node.js + TypeScript で起動する
- [x] Hono API が起動する / `/health` が 200 を返す
- [x] SQLite へ接続できる
- [x] AWS / Cloudflare の RSS を取得できる
- [x] GitHub Release を取得できる
- [x] 共通 Article 形式へ Normalize できる
- [x] 重複記事を登録しない（2回目の収集で `new_count` が 0）
- [x] `npm run collect -- <category>` で手動収集できる
- [x] `/articles` で記事一覧を取得できる
- [x] 1ソース失敗時も他ソースの収集を継続する
- [x] ログから失敗原因を確認できる
- [ ] YouTube 新着を取得できる（`YOUTUBE_API_KEY` 待ち）
- [ ] systemd timer で定期収集できる（ミニ PC 上で確認）
- [ ] Slack への実投稿（チャンネル作成待ち）
