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

| カテゴリ | 内容 | 方式 | 収集(JST) | 通知 | selector | 1回の上限 |
|---|---|---|---|---|---|---|
| `economy_news` | 経済・市場・暗号資産 | RSS | 毎日 08:00 | 収集のたび | ranking | 8 |
| `engineer_news` | 国内 IT 総合 / AWS / Google Workspace | RSS | 毎日 08:10 | 土曜のみ | ranking | 10 |
| `whiskey_news` | ウイスキー | RSS | 毎日 19:00 | 土曜のみ | ranking | 10 |
| Connpass | セミナー・勉強会（直近の金〜日、都内とオンライン） | Connpass API v2 | 木 20:00 | 収集のたび | — | 20（表示） |

AI・クラウドの公式アップデートは shogo-works の日次 AI ニュース運用が担うため、ここでは扱わない。

### 通知量の設計

通知量は「頻度（`schedule` / `notifyDays`）」と「1回の件数（`maxPerNotification`）」で決める。
情報源ごとの上限（`maxPerSource`）だけでは、情報源を増やすたびに通知量が増えてしまうため、
カテゴリ全体の上限を必ず併用する。

見切れない量の通知は読まれないため、平日の通知は朝の `economy_news` 1本に絞っている。

`notifyDays` を指定したカテゴリは、収集は `schedule` のとおり毎日行い、通知は指定曜日（JST）だけ
行う。それ以外の日は未通知の記事を持ち越し、通知日に溜まった分から上位を選ぶ。RSS は直近数十件しか
持たないため、収集まで週1にすると取りこぼす。RSS には人気の指標がないので、上位は各日の
フィード先頭に近い記事になる。

Connpass は金〜日に参加できるイベントを、前の木曜夜にまとめて確認する運用に合わせている。
取得は開催日時順で API 上限の 100 件までとし、Slack には 20 件を載せ、残りは件数だけ示す。
人気ランキングは Web で見られるため取得しない。

### selector

| selector | 選び方 | 用途 |
|---|---|---|
| `ranking` | 情報源内の順位を 0〜1 に正規化し、情報源の重みを掛けて採点する。同じ URL が複数の情報源に出たら束ねて加点する | 一般ニュース。上位だけ読めばよいもの |
| `scoring` | `src/config/scoring.ts` のキーワード配点で `minScore` 未満を除外し、スコア降順で並べる | 一次情報。技術的な重さで判断したいもの |
| `per_source` | 情報源ごとに束ねて発行日時の降順で並べる | 取りこぼしを許さないもの（現在は未使用） |

順位は `articles.source_rank` に保存する。RSS はフィードの掲載順、GitHub Releases は
リリース順、YouTube は uploads playlist の並びをそのまま順位として扱う。

### ランキング情報源（`type: 'ranking'`）

「決めた購読先の新着」ではなく「世の中の上位N件」を取る情報源。`provider` で実装を切り替える。
`trend_digest` の廃止により、現在これを使うカテゴリはない（実装は残している）。

| provider | 取得元 | 鍵 | 重み | 拾うもの |
|---|---|---|---|---|
| `hatena` | ホットエントリ RSS（テクノロジー / 世の中・経済） | 不要 | 1.0 | 日本語で今読まれている記事 |
| `hackernews` | Algolia API（24h・30points 超） | 不要 | 0.9 | 海外技術トレンド |
| `google_trends` | SerpAPI `google_trends_trending_now`（JP） | 必須 | 0.9 | 急上昇検索ワード |
| `qiita` | API v2（直近3日を LGTM 順） | 不要 | 0.8 | 日本の技術記事 |
| `zenn` | `/api/articles?order=daily`（非公式） | 不要 | 0.8 | 日本の技術記事 |
| `github_trending` | Search API（直近7日・star 順） | 任意 | 0.7 | 急上昇リポジトリ |
| `youtube_trending` | Data API v3（急上昇・Science & Technology・JP） | 必須 | 0.6 | 技術系の急上昇動画 |

鍵が必須の provider は、鍵が未設定なら警告を残して空を返す（例外にしない）。
毎回 job が `partial` になると本当の障害が埋もれるため。

ラッコキーワードは有料前提のため入れていない。X API は 403 が X 側要因で確定しているため入れない。

### 発信4本柱と昇格台帳

`pillars` を設定したカテゴリは、発信の4本柱（`src/config/pillars.ts`）で
タグ付けする。スコア順のまま切ると、点数は高いが発信に繋がらない一般ニュースが上位を
占めるため、**タグが付いたものを優先し、無タグには最大3枠しか割かない**。

| 柱 | 拾うもの |
|---|---|
| AIエンジニアリング | LLM / エージェント / MCP / RAG / 各社モデル |
| 業務 | 自動化・効率化・SaaS・ノーコード |
| 組織 | チーム・マネジメント・採用・評価制度 |
| キャリア | 転職・副業・学習・資格 |

`trend_digest` の廃止により、現在 `pillars` と `archiveDigest` を持つカテゴリはない（実装は残している）。

`archiveDigest: true` のカテゴリは、通知できた記事を `archive/YYYY/MM/YYYY-MM-DD.md` へ
チェックボックス付きの Markdown で書き出す。人が読み返して `picks/` へ昇格させるための台帳で、
Slack は「気づく」ための入口という役割分担にしている。

台帳の書き出しに失敗しても収集と通知は成立しているため、エラーを記録して縮退する。

## データモデル

| テーブル | 役割 |
|---|---|
| `sources` | 情報源。カテゴリ設定から毎回 upsert する |
| `articles` | 収集した記事。`UNIQUE(source_id, external_id)` で重複取得を防ぐ。`source_rank` に情報源内の掲載順を持つ |
| `article_scores` | ルールベーススコアと importance（A/B/C）。LLM 判定用の列を空けてある |
| `job_runs` | 実行履歴。無人運用時の障害確認用 |

`articles.notified_at` が NULL のもの（未通知キュー）を毎回の収集後に引き直して Slack へ送る。
**時間窓（旧 `FILTER_HOURS`）ではなく DB で重複排除する**ため、実行間隔がずれても取りこぼし・
二重通知が起きず、Slack 送信に失敗した記事は次回実行で再送される。
`minScore` / `maxPerSource` / `maxPerNotification` で選外になった記事は、その場で処理済みにして
滞留させない。Slack には出ないが DB には残るため、`GET /articles?category=...` で後から引ける。

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
# 未設定なら収集だけ行い通知はスキップ
SLACK_CHANNEL_ECONOMY_NEWS=C0XXXXXXXXX
SLACK_CHANNEL_ENGINEER_NEWS=C0XXXXXXXXX
SLACK_CHANNEL_WHISKEY_NEWS=C0XXXXXXXXX

# 情報源の API キー
# GITHUB_TOKEN は public repo の read のみ（未設定でも動くがレート制限が 60 req/h になる）
GITHUB_TOKEN=
# YouTube / Google Trends（SerpAPI）は ranking 情報源で使う。現在これを使うカテゴリはない
YOUTUBE_API_KEY=
SERPAPI_API_KEY=
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

**廃止した変数**: `SLACK_CHANNEL_AI_NEWS` / `_BUSINESS_NEWS` / `_FITNESS_NEWS` / `_TECH_CLOUD` /
`_TECH_WEB` / `_TECH_AI` / `_TECH_YOUTUBE` / `_TREND_DIGEST`（カテゴリ廃止）、
`CRON_*`（→ systemd timer / `categories.ts` の `schedule`）、
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
