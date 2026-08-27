/**
 * 環境変数の読み込みと検証。
 *
 * このモジュール以外で `process.env` を参照しないこと。
 * 将来 Cloudflare Workers へ移す際、差し替えるのはこのファイルだけになる。
 */
import 'dotenv/config';
import { z } from 'zod';

const EnvSchema = z.object({
  // Slack
  SLACK_BOT_TOKEN: z.string().min(1, 'SLACK_BOT_TOKEN は必須です'),

  // DB / API
  DATABASE_PATH: z.string().default('data/tech-radar.sqlite'),
  API_HOST: z.string().default('127.0.0.1'),
  API_PORT: z.coerce.number().int().positive().default(3000),
  ADMIN_TOKEN: z.string().min(16).optional(),

  // 外部 API
  GITHUB_TOKEN: z.string().optional(),
  YOUTUBE_API_KEY: z.string().optional(),
  CONNPASS_API_KEY: z.string().optional(),
  SERPAPI_API_KEY: z.string().optional(),
  CONNPASS_KEYWORDS: z.string().default(''),
  SLACK_CHANNEL_CONNPASS: z.string().optional(),

  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
});

export type Env = z.infer<typeof EnvSchema>;

/** 起動時にスナップショットを取り、以降 process.env を触らない */
const snapshot: Readonly<Record<string, string | undefined>> = Object.freeze({ ...process.env });

let cached: Env | null = null;

export function loadEnv(): Env {
  if (cached) return cached;

  const parsed = EnvSchema.safeParse(snapshot);
  if (!parsed.success) {
    const detail = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join(', ');
    throw new Error(`環境変数の検証に失敗しました (${detail})`);
  }

  cached = parsed.data;
  return cached;
}

/**
 * カテゴリ設定が持つ `channelEnvKey` から Slack チャンネル ID を引く。
 * 未設定なら undefined を返し、呼び出し側が通知をスキップする。
 */
export function slackChannelFor(envKey: string): string | undefined {
  const value = snapshot[envKey];
  return value && value.trim().length > 0 ? value.trim() : undefined;
}

/** systemd unit 生成など、値の存在確認だけしたい用途向け */
export function hasEnv(key: string): boolean {
  return slackChannelFor(key) !== undefined;
}
