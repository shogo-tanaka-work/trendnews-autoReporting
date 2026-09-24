import { describe, expect, it } from 'vitest';
import { parseRisingQueries, parseTimeseries, type TimelinePoint } from '../src/collectors/google-trends-keywords.js';
import { buildKeywordMessage } from '../src/notifiers/blocks/keywords.js';
import {
  byMovement,
  isNotable,
  renderKeywordDigest,
  weekOverWeek,
  type KeywordTrend,
} from '../src/services/keyword-trend.js';

/** 古い順に日次の値を並べる */
function series(values: number[]): TimelinePoint[] {
  return values.map((value, index) => ({ timestamp: 1_790_000_000 + index * 86_400, value }));
}

function trend(overrides: Partial<KeywordTrend>): KeywordTrend {
  return {
    keyword: 'Claude Code',
    group: 'AI開発ツール',
    recentAverage: 50,
    changePct: 0,
    risingQueries: [],
    risingError: false,
    error: null,
    ...overrides,
  };
}

describe('weekOverWeek', () => {
  it('直近7日と前の7日の平均を比べる', () => {
    const points = series([...Array(7).fill(40), ...Array(7).fill(50)]);

    expect(weekOverWeek(points)).toEqual({ recentAverage: 50, changePct: 25 });
  });

  it('14日より前の値は比較に使わない', () => {
    const points = series([100, 100, ...Array(7).fill(20), ...Array(7).fill(10)]);

    expect(weekOverWeek(points).changePct).toBe(-50);
  });

  it('並び順に依存しない', () => {
    const points = series([...Array(7).fill(40), ...Array(7).fill(50)]).reverse();

    expect(weekOverWeek(points).changePct).toBe(25);
  });

  it('前週がゼロで今週だけ出た語は新出とする', () => {
    expect(weekOverWeek(series([...Array(7).fill(0), 0, 0, 0, 0, 0, 3, 5])).changePct).toBe('new');
  });

  it('検索が少なすぎて両週ゼロ、または日数不足なら判定しない', () => {
    expect(weekOverWeek(series(Array(14).fill(0))).changePct).toBeNull();
    expect(weekOverWeek(series([10, 20, 30])).changePct).toBeNull();
  });
});

describe('isNotable', () => {
  it('閾値以上の増減、新出、急上昇の関連語があれば載せる', () => {
    expect(isNotable(trend({ changePct: 20 }), 20)).toBe(true);
    expect(isNotable(trend({ changePct: -25 }), 20)).toBe(true);
    expect(isNotable(trend({ changePct: 'new' }), 20)).toBe(true);
    expect(isNotable(trend({ changePct: 5, risingQueries: [{ query: 'skills 作り方', value: '+300%' }] }), 20)).toBe(true);
  });

  it('小さな変化、判定不能、取得失敗は載せない', () => {
    expect(isNotable(trend({ changePct: 19 }), 20)).toBe(false);
    expect(isNotable(trend({ changePct: null }), 20)).toBe(false);
    expect(isNotable(trend({ changePct: 90, error: 'HTTP 500' }), 20)).toBe(false);
  });
});

describe('byMovement', () => {
  it('新出 → 変化率の絶対値の順に並べる', () => {
    const sorted = [trend({ keyword: 'a', changePct: 30 }), trend({ keyword: 'b', changePct: -60 }), trend({ keyword: 'c', changePct: 'new' })].sort(byMovement);

    expect(sorted.map((t) => t.keyword)).toEqual(['c', 'b', 'a']);
  });
});

describe('parseTimeseries', () => {
  it('日次の値を取り出し、途中集計の日を除く', () => {
    const payload = {
      interest_over_time: {
        timeline_data: [
          { timestamp: '1790000000', values: [{ query: 'Codex', value: '40', extracted_value: 40 }] },
          { timestamp: '1790086400', partial_data: true, values: [{ query: 'Codex', value: '10', extracted_value: 10 }] },
        ],
      },
    };

    expect(parseTimeseries(payload)).toEqual([{ timestamp: 1_790_000_000, value: 40 }]);
  });

  it('HTTP 200 でも error を返したら失敗にする', () => {
    expect(() => parseTimeseries({ error: "Google Trends hasn't returned any results for this query." })).toThrow('結果を返しませんでした');
  });

  it('推移が空なら「変化なし」と区別できるよう失敗にする', () => {
    expect(() => parseTimeseries({ interest_over_time: { timeline_data: [] } })).toThrow('空でした');
    expect(() => parseTimeseries({ search_metadata: {} })).toThrow('空でした');
  });

  it('形式が違えば失敗にする', () => {
    expect(() => parseTimeseries({ interest_over_time: { timeline_data: [{ values: 'x' }] } })).toThrow('形式');
  });
});

describe('parseRisingQueries', () => {
  it('rising だけを取り出す', () => {
    const payload = {
      related_queries: {
        rising: [{ query: 'SKILL.md', value: 'Breakout', extracted_value: 5000, link: 'https://example.com' }],
        top: [{ query: 'claude', value: '100', extracted_value: 100 }],
      },
    };

    expect(parseRisingQueries(payload)).toEqual([{ query: 'SKILL.md', value: 'Breakout' }]);
  });

  it('検索が少なく関連クエリがない語は空配列にする', () => {
    expect(parseRisingQueries({ error: 'no results' })).toEqual([]);
  });
});

describe('buildKeywordMessage', () => {
  const now = new Date('2026-09-27T23:50:00.000Z');

  it('動いた語だけを本文に載せ、残りと失敗は末尾にまとめる', () => {
    const message = buildKeywordMessage(
      [
        trend({ keyword: 'Agent Skills', changePct: 45, risingQueries: [{ query: 'SKILL.md', value: 'Breakout' }] }),
        trend({ keyword: 'Codex', changePct: 3 }),
        trend({ keyword: 'RAG', changePct: null, error: 'HTTP 500' }),
      ],
      20,
      now
    );
    const body = JSON.stringify(message?.blocks);

    expect(message?.text).toContain('1語');
    expect(body).toContain('Agent Skills');
    expect(body).toContain('SKILL.md（Breakout）');
    expect(body).toContain('大きな変化なし: Codex');
    expect(body).toContain('取得失敗: RAG');
  });

  it('動いた語がなくても、その旨を通知する', () => {
    const message = buildKeywordMessage([trend({ changePct: 1 })], 20, now);

    expect(JSON.stringify(message?.blocks)).toContain('前週比 ±20% を超えた語はありません');
  });

  it('関連語だけ取得に失敗した語の数を末尾に出す', () => {
    const message = buildKeywordMessage([trend({ changePct: 1, risingError: true })], 20, now);

    expect(JSON.stringify(message?.blocks)).toContain('関連語の取得失敗: 1語');
  });
});

describe('renderKeywordDigest', () => {
  it('グループごとに全語をチェックボックス付きで残す', () => {
    const markdown = renderKeywordDigest('2026-09-27', [
      trend({ keyword: 'Claude Code', changePct: 12 }),
      trend({ keyword: 'GAS 自動化', group: '発注者の悩み', changePct: 'new', risingQueries: [{ query: 'GAS スプレッドシート', value: '+120%' }] }),
    ]);

    expect(markdown).toContain('## AI開発ツール');
    expect(markdown).toContain('- [ ] **Claude Code** +12%');
    expect(markdown).toContain('- [ ] **GAS 自動化** 新出');
    expect(markdown).toContain('  - GAS スプレッドシート（+120%）');
  });
});
