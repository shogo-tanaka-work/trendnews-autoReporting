/**
 * Slack への送信。@slack/web-api への依存はここへ閉じ込める。
 */
import { WebClient, type KnownBlock } from '@slack/web-api';

export type SlackPost = {
  channel: string;
  text: string;
  blocks: KnownBlock[];
};

export interface SlackNotifier {
  post(message: SlackPost): Promise<void>;
}

export class SlackWebApiNotifier implements SlackNotifier {
  private readonly client: WebClient;

  constructor(token: string) {
    this.client = new WebClient(token);
  }

  async post(message: SlackPost): Promise<void> {
    await this.client.chat.postMessage({
      channel: message.channel,
      text: message.text,
      blocks: message.blocks,
    });
  }
}
