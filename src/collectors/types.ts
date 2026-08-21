import type { RawItem } from '../domain/article.js';
import type { SourceConfig } from '../domain/source.js';

export interface Collector<T extends SourceConfig = SourceConfig> {
  collect(source: T): Promise<RawItem[]>;
}

/**
 * 本文取得の抽象。V1 は HTTP 実装のみ。
 * Browser Rendering が必要になったらこの interface の別実装を足す（要件 19章）。
 */
export interface ContentFetcher {
  fetch(url: string): Promise<string>;
}
