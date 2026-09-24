import { describe, expect, it } from 'vitest';
import { upcomingWeekendYmd, type ConnpassEvent } from '../src/collectors/connpass.js';
import { buildConnpassMessage } from '../src/notifiers/blocks/connpass.js';

describe('upcomingWeekendYmd', () => {
  it('木曜夜の実行では翌日からの金〜日を返す', () => {
    // 2026-09-24(木) 20:00 JST
    expect(upcomingWeekendYmd(new Date('2026-09-24T11:00:00.000Z'))).toEqual(['20260925', '20260926', '20260927']);
  });

  it('月曜の実行ではその週の金〜日を返す', () => {
    // 2026-09-21(月) 09:00 JST
    expect(upcomingWeekendYmd(new Date('2026-09-21T00:00:00.000Z'))).toEqual(['20260925', '20260926', '20260927']);
  });

  it('週末の実行では残りの日だけを返す', () => {
    // 2026-09-26(土) 10:00 JST
    expect(upcomingWeekendYmd(new Date('2026-09-26T01:00:00.000Z'))).toEqual(['20260926', '20260927']);
  });

  it('金曜の実行では当日からの金〜日、日曜の実行では当日だけを返す', () => {
    expect(upcomingWeekendYmd(new Date('2026-09-25T01:00:00.000Z'))).toEqual(['20260925', '20260926', '20260927']);
    expect(upcomingWeekendYmd(new Date('2026-09-27T01:00:00.000Z'))).toEqual(['20260927']);
  });

  it('年をまたぐ週末も連続した日付を返す', () => {
    // 2026-12-31(木) 20:00 JST
    expect(upcomingWeekendYmd(new Date('2026-12-31T11:00:00.000Z'))).toEqual(['20270101', '20270102', '20270103']);
  });

  it('日付と曜日は JST で判定する', () => {
    // UTC では 2026-09-23(水) 15:30、JST では 2026-09-24(木) 00:30
    expect(upcomingWeekendYmd(new Date('2026-09-23T15:30:00.000Z'))).toEqual(['20260925', '20260926', '20260927']);
  });

  it('月をまたぐ週末も連続した日付を返す', () => {
    // 2026-10-01(木) 20:00 JST
    expect(upcomingWeekendYmd(new Date('2026-10-01T11:00:00.000Z'))).toEqual(['20261002', '20261003', '20261004']);
  });
});

function event(id: number): ConnpassEvent {
  return {
    id,
    title: `イベント${id}`,
    url: `https://connpass.com/event/${id}/`,
    started_at: '2026-09-26T13:00:00+09:00',
    place: 'オンライン',
    accepted: 10,
    limit: 50,
  };
}

describe('buildConnpassMessage', () => {
  const now = new Date('2026-09-24T11:00:00.000Z');

  it('イベントがなければ通知しない', () => {
    expect(buildConnpassMessage([], 0, now)).toBeNull();
  });

  it('上限までは全件を載せ、ブロック数を Slack の上限内に収める', () => {
    const message = buildConnpassMessage(
      Array.from({ length: 25 }, (_, index) => event(index + 1)),
      25,
      now
    );
    const body = JSON.stringify(message?.blocks);

    expect(message?.blocks.length).toBeLessThanOrEqual(50);
    expect(body).toContain('イベント20');
    expect(body).not.toContain('イベント21');
  });

  it('省略件数は API の全件数から数える', () => {
    // 取得上限で 25 件しか返らなくても、条件に合う全件は 130 件
    const message = buildConnpassMessage(
      Array.from({ length: 25 }, (_, index) => event(index + 1)),
      130,
      now
    );

    expect(message?.text).toContain('130件');
    expect(JSON.stringify(message?.blocks)).toContain('ほか110件は省略');
  });
});
