import { describe, expect, it } from 'vitest';
import {
  dedupeByExternalId,
  normalizeUrl,
  stripHtml,
  toIsoDate,
  toNewArticle,
} from '../src/services/normalize.js';

describe('normalizeUrl', () => {
  it('計測用パラメータとフラグメントを落とす', () => {
    expect(normalizeUrl('https://example.com/a?utm_source=x&id=1#top')).toBe('https://example.com/a?id=1');
  });

  it('http/https 以外は受け付けない', () => {
    expect(normalizeUrl('javascript:alert(1)')).toBeNull();
    expect(normalizeUrl('ftp://example.com/a')).toBeNull();
    expect(normalizeUrl('not a url')).toBeNull();
  });
});

describe('stripHtml', () => {
  it('タグと実体参照を除去して空白を畳む', () => {
    expect(stripHtml('<p>Hello &amp;   <b>world</b></p>')).toBe('Hello & world');
  });

  it('script の中身を残さない', () => {
    expect(stripHtml('<script>evil()</script>safe')).toBe('safe');
  });
});

describe('toIsoDate', () => {
  it('解釈できない日付は null にする', () => {
    expect(toIsoDate('not a date')).toBeNull();
    expect(toIsoDate(undefined)).toBeNull();
  });

  it('RFC822 形式を ISO へ変換する', () => {
    expect(toIsoDate('Tue, 19 Aug 2026 10:00:00 GMT')).toBe('2026-08-19T10:00:00.000Z');
  });
});

describe('toNewArticle', () => {
  const fetchedAt = '2026-08-21T00:00:00.000Z';

  it('RawItem を共通形式へ変換する', () => {
    const article = toNewArticle(
      'aws-whats-new',
      {
        externalId: 'guid-1',
        title: '  <b>New</b> feature  ',
        url: 'https://aws.amazon.com/x?utm_medium=rss',
        description: '<p>desc</p>',
        publishedAt: '2026-08-20T09:00:00Z',
        categories: ['Lambda', ' '],
      },
      fetchedAt
    );

    expect(article).toEqual({
      sourceId: 'aws-whats-new',
      externalId: 'guid-1',
      title: 'New feature',
      url: 'https://aws.amazon.com/x',
      description: 'desc',
      publishedAt: '2026-08-20T09:00:00.000Z',
      fetchedAt,
      categories: ['Lambda'],
    });
  });

  it('URL かタイトルが取れない項目は捨てる', () => {
    expect(toNewArticle('s', { externalId: 'a', title: 'ok', url: 'bad' }, fetchedAt)).toBeNull();
    expect(toNewArticle('s', { externalId: 'a', title: '  ', url: 'https://a.example' }, fetchedAt)).toBeNull();
  });

  it('externalId が空なら正規化後の URL を使う', () => {
    const article = toNewArticle('s', { externalId: '', title: 't', url: 'https://a.example/1' }, fetchedAt);
    expect(article?.externalId).toBe('https://a.example/1');
  });
});

describe('dedupeByExternalId', () => {
  it('同一バッチ内の重複を落とす', () => {
    const base = {
      title: 't',
      url: 'https://a.example',
      description: null,
      publishedAt: null,
      fetchedAt: '2026-08-21T00:00:00.000Z',
      categories: [],
    };

    const result = dedupeByExternalId([
      { ...base, sourceId: 's1', externalId: 'a' },
      { ...base, sourceId: 's1', externalId: 'a' },
      { ...base, sourceId: 's2', externalId: 'a' },
    ]);

    expect(result).toHaveLength(2);
  });
});
