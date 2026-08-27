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

```bash
# 1. 配置
sudo useradd --system --home /opt/tech-radar --shell /usr/sbin/nologin techradar
sudo git clone <repo> /opt/tech-radar
cd /opt/tech-radar
sudo -u techradar npm ci
sudo -u techradar npm run build
sudo install -d -o techradar -g techradar /opt/tech-radar/data

# 2. 秘密情報はプロジェクトルート直下の environment へ置く（Git 管理外。共有領域へ散らさない）
sudo install -m 0640 -o root -g techradar /dev/null /opt/tech-radar/environment
sudo vi /opt/tech-radar/environment   # docs/SPEC.md の「環境変数」を KEY=VALUE 形式で記述

# 3. unit を配置
npm run gen:systemd
sudo cp systemd/*.service systemd/*.timer /etc/systemd/system/
sudo cp -r systemd/generated/* /etc/systemd/system/
sudo systemctl daemon-reload

# 4. API と収集タイマーを有効化
sudo systemctl enable --now tech-radar-api.service
sudo systemctl enable --now tech-radar-connpass.timer
for c in ai_news engineer_news whiskey_news fitness_news business_news economy_news \
         trend_digest tech_cloud tech_web tech_ai tech_youtube; do
  sudo systemctl enable --now "tech-radar-collect@$c.timer"
done
```

### 運用確認

```bash
systemctl list-timers 'tech-radar-*'
journalctl -u tech-radar-collect@tech_cloud --since today
systemctl start tech-radar-collect@tech_cloud   # 手動で1回走らせる
sqlite3 /opt/tech-radar/data/tech-radar.sqlite \
  'SELECT job_name, status, new_count, error_message FROM job_runs ORDER BY id DESC LIMIT 10;'
```

スケジュールの正本は `src/config/categories.ts` の `schedule`。変更したら
`npm run gen:systemd` → drop-in を再配置 → `systemctl daemon-reload` を行う。

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
