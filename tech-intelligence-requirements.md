# Tech Intelligence / Tech Radar 収集システム
## Claude Code 引き継ぎ用・簡易要件 / 技術選定方針

作成日: 2026-08-21

---

## 1. 背景

システム開発・Web・AI Agent・クラウド周辺の技術情報を、XやYouTubeなどの二次情報だけに依存せず、公式ブログ、Changelog、GitHub Releases、RSS、APIなどの一次情報から自動収集したい。

ロールモデルのイメージは、YouTubeの「クロノITチャンネル」のように、

- 最近どの技術が話題になっているか
- 何が新しくリリースされたか
- どの技術を今後キャッチアップすべきか

を定期的に俯瞰できる仕組み。

目的は「誰よりも早く知ること」ではなく、

1. 一次情報の段階で重要な動きを薄く把握する
2. 後日、X / YouTube / Zenn / Qiita等の解説で理解を深める
3. 情報収集そのものに時間を使いすぎない

状態を作ること。

---

# 2. システムの目的

## 2.1 主目的

以下の情報源から技術アップデートを自動収集し、重要度を判定して保存する。

- RSS / Atom
- 公式Changelog
- GitHub Releases / GitHub API
- YouTube Data API
- その他公式API

原則としてスクレイピングは使用しない。

---

## 2.2 将来的な到達イメージ

```text
公式一次情報
├─ AWS RSS
├─ Cloudflare RSS
├─ GitHub REST API
├─ YouTube Data API
├─ 各OSS / Framework
└─ その他RSS
        ↓
Collector
        ↓
Normalizer
        ↓
Rule-based Filter
        ↓
Database
        ↓
LLM Screening
        ↓
重要情報のみ要約
        ↓
Hono API
        ↓
管理画面 / Daily Digest / Weekly Digest
```

最終的には自分専用の

**Tech Intelligence / Tech Radar**

として利用する。

---

# 3. V1 スコープ

まずは最小構成で無人収集まで完成させる。

## 必須機能

### 3.1 情報収集

以下を対象とする。

#### Cloud / Infra

- AWS What's New
- AWS News Blog
- Cloudflare Changelog
- GitHub Changelog

#### Web / JavaScript

- React
- Next.js
- Vite
- TanStack
- Hono
- TypeScript
- Node.js
- Bun
- Deno

#### AI / AI Agent

- OpenAI
- Anthropic
- Google Gemini / Google AI
- LangChain
- LangGraph
- MCP
- Google ADK
- Microsoft系Agent Framework

#### YouTube

特定の技術系チャンネルをウォッチ対象として登録できるようにする。

初期候補:

- クロノIT
- 各クラウド / OSSベンダー公式
- 海外の主要AI / Web開発チャンネル

---

## 3.2 正規化

情報源によってデータ形式が異なるため、内部では共通形式に正規化する。

例:

```ts
type Article = {
  id: string
  sourceId: string
  sourceType: 'rss' | 'github' | 'youtube' | 'api' | 'web'
  title: string
  url: string
  description?: string
  publishedAt: string
  fetchedAt: string
  categories?: string[]
  author?: string

  score?: number
  importance?: 'A' | 'B' | 'C'
  summarized?: boolean
}
```

---

# 4. 重要度判定

## 4.1 LLMの前にルールベースで絞る

LLM APIへすべての情報を送らない。

まず通常のコードで一次スクリーニングする。

例:

```text
+5 Agent
+5 MCP
+5 Claude
+5 OpenAI
+4 LangGraph
+4 TanStack
+4 Workers
+4 AWS
+4 React
+3 TypeScript
+3 Hono
+3 D1
+3 R2

+5 GA
+5 Breaking Change
+5 Deprecated
+5 RFC
+4 Public Beta
+4 New API
+4 Release

-5 typo
-5 docs only
-4 localization
-3 minor fix
```

スコア閾値は設定ファイル化する。

---

## 4.2 LLMスクリーニング

ルール判定後の候補のみLLMへ送信する。

入力は可能な限り小さくする。

例:

```json
{
  "title": "...",
  "description": "...",
  "source": "Cloudflare",
  "categories": ["Workers", "Agents"],
  "publishedAt": "..."
}
```

LLMの出力:

```json
{
  "importance": "A",
  "reason": "AI Agent開発に影響する新機能",
  "shouldReadNow": true
}
```

### 判定基準

- A: 今把握しておく価値が高い
- B: 週次まとめで確認すればよい
- C: 現時点では無視してよい

---

# 5. 本文取得方針

重要なのは、

**最初からWebページ本文を取得しないこと。**

優先順位:

```text
1. RSS本文 / description
2. APIレスポンス
3. GitHub Release body
4. YouTube description
5. 通常HTTP GET
6. HTML parser
7. Browser Rendering
```

Browser Rendering / Browser Runは最終手段とする。

利用条件:

- RSSなし
- APIなし
- HTTP GETでは本文取得不可
- JavaScript Rendering必須

この条件を満たす場合だけ使用する。

---

# 6. 情報源別の取得方式

## 6.1 AWS

優先:

```text
AWS What's New RSS
AWS News Blog RSS
```

公式のWhat's NewはRSS購読に対応している。

用途:

- 新AWSサービス
- GA
- Preview
- 新リージョン
- Bedrock
- AgentCore
- Lambda
- ECS / EKS
- S3
- CloudWatch
- AI関連

---

## 6.2 Cloudflare

Cloudflare Changelog RSSを使用する。

Cloudflareは製品単位でRSSを提供しているため、スクレイピング不要。

特に監視するもの:

```text
Workers
D1
R2
Durable Objects
Agents
AI Gateway
Workers AI
Workflows
Queues
Containers
Browser Run
Vectorize
Cloudflare Tunnel
Zero Trust関連
```

RSSの`category`を利用してプログラム側で絞り込む。

---

## 6.3 GitHub / OSS

GitHub REST APIを基本とする。

例:

```text
GET /repos/{owner}/{repo}/releases
GET /repos/{owner}/{repo}/releases/latest
```

監視候補:

```text
tanstack/router
langchain-ai/langgraph
langchain-ai/langchain
vercel/next.js
facebook/react
vitejs/vite
honojs/hono
microsoft/TypeScript
nodejs/node
oven-sh/bun
denoland/deno
```

Atom FeedよりREST APIを優先する。

Release情報だけでは不足するOSSについては、将来的に以下も検討する。

- GitHub Discussions
- RFC repository
- Issues
- Pull Requests

ただしV1ではRelease中心でよい。

---

## 6.4 YouTube

YouTube Data API v3を使用。

基本:

```text
Channel
 ↓
contentDetails.relatedPlaylists.uploads
 ↓
Uploads Playlist
 ↓
playlistItems.list
```

特定チャンネルの新着監視を行う。

全YouTube検索を毎回実行する方式は採用しない。

理由:

- ノイズが増える
- API quota効率が悪い
- 信頼できるチャンネルを固定監視した方が品質が高い

---

# 7. 技術選定

## Runtime

```text
Node.js
TypeScript
```

### 理由

今回の処理は主に、

- HTTP API
- RSS parse
- JSON
- SQLite
- LLM API
- GitHub API
- YouTube API

であり、Python / Go / Rustを選択するほどCPU負荷の高い処理ではない。

TypeScriptのままCloudflare Workersへ移行しやすい点も重視する。

---

# 8. Backend Framework

## 採用: Hono

```text
Node.js + Hono
```

### 採用理由

- 軽量
- TypeScriptとの相性がよい
- Web Standardsベース
- Node.jsで利用可能
- Cloudflare Workersで利用可能
- 将来的なWorkers移行が容易
- APIサーバ用途に十分

HonoはNode.js Adapterを持ち、Cloudflare Workersでも公式対応している。

---

## Expressを採用しない理由

Expressでも実現可能だが、今回の用途ではHonoの方が将来のCloudflare移行との相性が良い。

Expressのエコシステムの大きさを必要とするほど複雑なAPIではない。

---

## Next.jsを採用しない理由

今回必要なのはAPI / Collector / Batch処理であり、

- SSR
- React Server Components
- SEO
- App Router

等を必要としない。

Next.jsはオーバースペック。

---

## TanStack Routerについて

バックエンド用途では使用しない。

将来的に管理画面を構築する場合、

```text
Vite
+ React
+ TanStack Router
```

を採用候補とする。

例:

```text
React SPA
   ↓
TanStack Router
   ↓
Hono API
```

TanStack Routerを実践的に試す場所として管理画面が適している。

---

# 9. データベース

## V1

```text
SQLite
```

自宅ミニPC上に配置する。

### 理由

- 単一ユーザー
- データ量が小さい
- セットアップが容易
- バックアップが容易
- SQLで扱える
- 将来的にD1へ移行しやすい

---

## 将来

```text
SQLite
   ↓
Cloudflare D1
```

Cloudflare D1はSQLite系のSQL semanticsを採用している。

DBアクセス層をRepositoryとして分離し、SQLite固有コードをCollectorへ直接書かないこと。

---

# 10. DB簡易設計

V1では以下程度でよい。

```text
sources
articles
article_scores
digests
job_runs
```

## sources

```text
id
name
type
url
enabled
config_json
created_at
updated_at
```

## articles

```text
id
source_id
external_id
title
url
description
published_at
fetched_at
categories_json
raw_json
created_at
```

`url`または`source_id + external_id`にUNIQUE制約を付け、重複取得を防ぐ。

## article_scores

```text
article_id
rule_score
importance
llm_reason
should_read_now
scored_at
```

## job_runs

```text
id
job_name
started_at
finished_at
status
processed_count
error_message
```

無人運用時の障害確認用。

---

# 11. Batch / Scheduler

UbuntuミニPC上では、

```text
systemd service
+
systemd timer
```

を使用する。

cronコマンドでも実現できるが、systemd timerを優先する。

理由:

- status確認
- logging
- retry設計
- journalctl
- 実行履歴確認
- サービス管理

がしやすい。

---

# 12. プロセス構成

Hono APIとCollector Batchを分離する。

```text
tech-radar-api.service
        ↓
     Hono API
     常時起動


tech-radar-collector.timer
        ↓
tech-radar-collector.service
        ↓
     collectAll()
```

CollectorをHTTP Routeへ直接埋め込まない。

---

# 13. Collectorの設計

重要:

**Collector / Domain LogicはHonoから独立させる。**

例:

```ts
export async function collectAll() {
  await collectAws()
  await collectCloudflare()
  await collectGithub()
  await collectYoutube()
}
```

Node.js:

```ts
await collectAll()
```

Hono:

```ts
app.post('/admin/collect', async (c) => {
  await collectAll()
  return c.json({ ok: true })
})
```

将来Cloudflare Workers:

```ts
export default {
  fetch: app.fetch,

  scheduled: async () => {
    await collectAll()
  }
}
```

この構造を維持する。

---

# 14. 推奨ディレクトリ構成

Claude Code側で最終調整してよい。

初期案:

```text
src/
├─ index.ts
│
├─ api/
│  ├─ articles.ts
│  ├─ sources.ts
│  └─ health.ts
│
├─ collectors/
│  ├─ aws.ts
│  ├─ cloudflare.ts
│  ├─ github.ts
│  ├─ youtube.ts
│  └─ rss.ts
│
├─ domain/
│  ├─ article.ts
│  └─ source.ts
│
├─ services/
│  ├─ collect.ts
│  ├─ normalize.ts
│  ├─ score.ts
│  └─ summarize.ts
│
├─ db/
│  ├─ client.ts
│  ├─ schema.ts
│  └─ repositories/
│
├─ jobs/
│  └─ collect.ts
│
├─ config/
│  ├─ sources.ts
│  └─ scoring.ts
│
└─ lib/
   ├─ logger.ts
   └─ env.ts

data/
└─ tech-radar.sqlite

systemd/
├─ tech-radar-api.service
├─ tech-radar-collector.service
└─ tech-radar-collector.timer
```

---

# 15. API V1

最低限以下を用意する。

```text
GET /health

GET /articles
GET /articles/:id

GET /articles?importance=A
GET /articles?source=cloudflare
GET /articles?from=2026-08-01

GET /sources

POST /admin/collect
```

`POST /admin/collect`はローカル環境専用または認証必須とする。

外部公開時は必ず保護する。

---

# 16. ロギング

最低限以下を残す。

```text
collector start
collector end
source
request count
new article count
duplicate count
error count
LLM request count
LLM token usage
processing time
```

systemdではjournalctlから確認可能にする。

将来的には構造化JSONログでもよい。

---

# 17. エラー処理

1ソースの失敗で全Collectorを停止させない。

例:

```text
AWS              OK
Cloudflare       OK
GitHub/TanStack  ERROR
GitHub/LangGraph OK
YouTube          OK
```

この場合でも他ソースは処理完了させる。

エラー内容は`job_runs`またはlogへ記録する。

---

# 18. コスト設計

## 基本方針

無料または非常に低コストで運用する。

### コストを抑える順番

```text
RSS / API
 ↓
Rule-based Filter
 ↓
Title / DescriptionのみLLM
 ↓
重要記事だけ本文
 ↓
重要記事だけ詳細要約
```

以下は避ける。

```text
全記事
 ↓
Browser Rendering
 ↓
全文
 ↓
LLM
```

---

# 19. Browser Rendering方針

V1では原則実装しなくてよい。

インターフェースのみ考慮しておく。

例:

```ts
interface ContentFetcher {
  fetch(url: string): Promise<string>
}
```

将来的に、

```text
HttpFetcher
BrowserFetcher
```

などを追加できる構成にする。

---

# 20. 将来のCloudflare移行

移行イメージ:

```text
Ubuntu mini PC

Node.js
Hono
systemd timer
SQLite

       ↓

Cloudflare

Workers
Hono
Cron Triggers / scheduled
D1
```

Collector本体は極力共通化する。

Runtime依存部分を分離する。

特に以下を直接Domain層へ埋め込まない。

```text
process.env
fs
Node.js専用API
SQLiteドライバ
systemd依存処理
```

---

# 21. 将来の管理画面

V1には不要。

Phase 2以降で検討。

候補:

```text
Vite
React
TanStack Router
```

画面例:

```text
Dashboard

今日
🔥 A 5件
🟡 B 18件
⚪ C 52件

カテゴリ
├─ AI Agent
├─ Web
├─ AWS
├─ Cloudflare
├─ OSS
└─ YouTube
```

各記事:

```text
TanStack Start RC
Source: GitHub
Importance: A

なぜ重要:
React Full-stack Framework周辺の選択肢として注目度上昇

[公式を見る]
```

---

# 22. 将来的なDigest

以下を生成できるようにする。

```text
Daily Digest
Weekly Digest
```

Weekly Digestイメージ:

```text
今週の重要アップデート

1. LangGraph
2. TanStack Start
3. AWS Bedrock / AgentCore
4. Cloudflare Workers
5. React / Next.js

今週読むべきもの: 3件
様子見: 8件
その他: 42件
```

---

# 23. 開発フェーズ

## Phase 1: Collector MVP

目標:

**無人収集できること。**

実装:

- Hono
- SQLite
- RSS
- GitHub API
- YouTube API
- AWS
- Cloudflare
- systemd
- `/health`
- `/articles`

LLMなしでもよい。

---

## Phase 2: Scoring

- keyword scoring
- category scoring
- importance A/B/C
- duplicate detection改善

---

## Phase 3: LLM

- CandidateだけLLM
- importance判定
- short summary
- reason
- token / cost記録

---

## Phase 4: UI

```text
Vite
React
TanStack Router
```

管理画面構築。

---

## Phase 5: Cloudflare

必要性が出た場合のみ、

```text
Workers
D1
Cron Triggers
```

へ移行。

自宅ミニPCで問題なく運用できている場合、無理に移行する必要はない。

---

# 24. Claude Codeへの実装方針

最初から大規模に作らない。

まず以下を完成条件とする。

```bash
npm run collect
```

を実行すると、

```text
AWS
Cloudflare
GitHub
YouTube
```

からデータを取得し、SQLiteへ保存する。

その後、

```bash
npm run dev
```

でHono APIを起動し、

```bash
curl http://localhost:3000/articles
```

で保存した記事一覧をJSON取得できること。

ここまでをMVPとする。

---

# 25. MVP 完了条件

以下を満たせばPhase 1完成。

- [ ] Node.js + TypeScriptで起動する
- [ ] Hono APIが起動する
- [ ] SQLiteへ接続できる
- [ ] AWS RSSを取得できる
- [ ] Cloudflare RSSを取得できる
- [ ] GitHub Releaseを取得できる
- [ ] YouTube新着を取得できる
- [ ] データを共通Article形式へNormalizeできる
- [ ] 重複記事を登録しない
- [ ] `npm run collect`で手動収集できる
- [ ] systemd timerで定期収集できる
- [ ] `/health`が200を返す
- [ ] `/articles`で記事一覧を取得できる
- [ ] 1ソース失敗時も他ソースの収集を継続する
- [ ] ログから失敗原因を確認できる

---

# 26. 非機能要件

## 優先順位

```text
1. 無人運用
2. 壊れにくさ
3. 低コスト
4. 拡張性
5. 高速性
```

大量トラフィックや高負荷処理は現時点では考慮不要。

---

## Security

- API KeyをGit管理しない
- `.env`を使用
- GitHub Tokenは必要最小権限
- YouTube API Keyを公開しない
- Admin APIをインターネットへ無認証公開しない
- 将来的にCloudflareへ公開する場合はAccess等も検討する

---

# 27. 技術選定まとめ

| 項目 | 採用 |
|---|---|
| Language | TypeScript |
| Runtime | Node.js |
| API Framework | Hono |
| Local DB | SQLite |
| Scheduler | systemd timer |
| Service | systemd service |
| AWS | RSS |
| Cloudflare | RSS |
| OSS | GitHub REST API |
| YouTube | YouTube Data API |
| AI判定 | 後付け |
| Browser Rendering | 最終Fallback |
| Frontend | V1なし |
| Future Frontend | Vite + React + TanStack Router |
| Future Hosting | Cloudflare Workers |
| Future DB | Cloudflare D1 |

---

# 28. 技術選定上の重要原則

このプロジェクトでは以下を守る。

### 1. スクレイピングファーストにしない

```text
API > RSS > HTTP > Browser Rendering
```

### 2. LLMファーストにしない

```text
Rule-based Filter
 ↓
LLM
```

### 3. FrameworkとDomainを分離する

CollectorやScoringをHono Routeへ直接書かない。

### 4. Node.js依存を閉じ込める

将来Workersへ移植可能にする。

### 5. UIを先に作らない

まず情報が自動で蓄積される状態を作る。

---

# 29. Claude Codeへの最初の依頼案

以下の順序で進めることを推奨する。

```text
1. この要件を読み、ディレクトリ構成を再検討
2. MVP範囲を確定
3. package / library選定
4. DB schema設計
5. Collector interface設計
6. RSS Collector実装
7. GitHub Collector実装
8. YouTube Collector実装
9. SQLite保存
10. Hono API
11. systemd service / timer
12. テスト
```

過剰設計を避け、Phase 1ではLLM / Frontendを実装しなくてもよい。

---

# 30. 参考・公式資料

- Hono Node.js
  - https://hono.dev/docs/getting-started/nodejs

- Hono Cloudflare Workers
  - https://hono.dev/docs/getting-started/cloudflare-workers

- Hono Web Standards
  - https://hono.dev/docs/concepts/web-standard

- Cloudflare D1
  - https://developers.cloudflare.com/d1/

- Cloudflare D1 SQL
  - https://developers.cloudflare.com/d1/sql-api/sql-statements/

- Cloudflare RSS Feeds
  - https://developers.cloudflare.com/fundamentals/new-features/available-rss-feeds/

- Cloudflare RSS format
  - https://developers.cloudflare.com/fundamentals/new-features/consuming-rss-feeds/

- AWS What's New
  - https://aws.amazon.com/new/

- GitHub REST API Releases
  - https://docs.github.com/en/rest/releases

- YouTube Data API Channels
  - https://developers.google.com/youtube/v3/docs/channels

- YouTube Data API PlaylistItems
  - https://developers.google.com/youtube/v3/docs/playlistItems/list

---

# 31. 最終方針

まずは、

```text
Ubuntu mini PC
+ Node.js
+ TypeScript
+ Hono
+ SQLite
+ systemd
```

で、

**「一次情報を勝手に収集して蓄積する」**

ところまで作る。

その後、

```text
Rule scoring
→ LLM
→ Digest
→ UI
```

の順に追加する。

最初から「AIニュースサービス」を作るのではなく、

**壊れにくい収集基盤を先に作ることを最優先とする。**
