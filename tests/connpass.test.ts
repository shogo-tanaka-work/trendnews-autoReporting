import { describe, expect, it } from 'vitest';
import { isNearbyOffline, nextDaysYmd, upcomingWeekendYmd, type ConnpassEvent } from '../src/collectors/connpass.js';
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
    expect(buildConnpassMessage({ weekend: [], weekendTotal: 0, nearby: [] }, now)).toBeNull();
  });

  it('上限までは全件を載せ、ブロック数を Slack の上限内に収める', () => {
    const message = buildConnpassMessage(
      {
        weekend: Array.from({ length: 25 }, (_, index) => event(index + 1)),
        weekendTotal: 25,
        nearby: Array.from({ length: 10 }, (_, index) => event(100 + index)),
      },
      now
    );
    const body = JSON.stringify(message?.blocks);

    expect(message?.blocks.length).toBeLessThanOrEqual(50);
    expect(body).toContain('|イベント15>');
    expect(body).not.toContain('|イベント16>');
    expect(body).toContain('|イベント105>');
    expect(body).not.toContain('|イベント106>');
  });

  it('省略件数は API の全件数から数える', () => {
    // 取得上限で 25 件しか返らなくても、条件に合う全件は 130 件
    const message = buildConnpassMessage(
      { weekend: Array.from({ length: 25 }, (_, index) => event(index + 1)), weekendTotal: 130, nearby: [] },
      now
    );

    expect(message?.text).toContain('130件');
    expect(JSON.stringify(message?.blocks)).toContain('ほか115件は省略');
  });

  it('週末の一覧で省略されたイベントは近場の節に残す', () => {
    const weekend = Array.from({ length: 16 }, (_, index) => event(index + 1));
    const message = buildConnpassMessage({ weekend, weekendTotal: 16, nearby: [event(16)] }, now);

    expect(message?.text).toContain('中野近辺: 1件');
  });

  it('週末の一覧に載ったイベントは近場の節に重ねて出さない', () => {
    const shared = event(1);
    const message = buildConnpassMessage({ weekend: [shared], weekendTotal: 1, nearby: [shared, event(2)] }, now);

    expect(message?.text).toContain('中野近辺: 1件');
  });

  it('週末が0件でも近場があれば通知する', () => {
    const message = buildConnpassMessage({ weekend: [], weekendTotal: 0, nearby: [event(2)] }, now);

    expect(message).not.toBeNull();
    expect(JSON.stringify(message?.blocks)).toContain('該当なし');
  });
});

describe('nextDaysYmd', () => {
  it('今日を含めて指定日数を JST で返す', () => {
    // UTC では 2026-09-30 15:30、JST では 2026-10-01 00:30
    expect(nextDaysYmd(new Date('2026-09-30T15:30:00.000Z'), 3)).toEqual(['20261001', '20261002', '20261003']);
  });
});

describe('isNearbyOffline', () => {
  it('住所か会場名に中野近辺の地名があれば近場とする', () => {
    expect(isNearbyOffline({ ...event(1), address: '東京都中野区中野4-1-1', place: '中野セントラルパーク' })).toBe(true);
    expect(isNearbyOffline({ ...event(1), address: '東京都杉並区高円寺南4-1', place: '高円寺のコワーキング' })).toBe(true);
    expect(isNearbyOffline({ ...event(1), address: '東京都新宿区西新宿2-8-1', place: null })).toBe(true);
  });

  it('近場以外とオンライン開催は外す', () => {
    expect(isNearbyOffline({ ...event(1), address: '東京都渋谷区渋谷2-21-1', place: '渋谷ヒカリエ' })).toBe(false);
    expect(isNearbyOffline({ ...event(1), address: null, place: 'オンライン' })).toBe(false);
    // 住所がないものは会場名に地名があってもオフラインとみなさない
    expect(isNearbyOffline({ ...event(1), address: null, place: '高円寺のコワーキング' })).toBe(false);
    expect(isNearbyOffline({ ...event(1), address: '東京都新宿区', place: 'オンライン（新宿から配信）' })).toBe(false);
  });
});
