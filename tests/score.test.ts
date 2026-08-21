import { describe, expect, it } from 'vitest';
import { scoreArticle, toImportance } from '../src/services/score.js';

describe('scoreArticle', () => {
  it('技術キーワードとリリース種別を加算する', () => {
    const result = scoreArticle({
      title: 'Cloudflare Workers AI Agents are now generally available',
      description: 'New API for building agents on Workers.',
    });

    expect(result.matchedLabels).toEqual(expect.arrayContaining(['Agent', 'Workers', 'GA', 'New API']));
    expect(result.score).toBeGreaterThanOrEqual(9);
    expect(result.importance).toBe('A');
  });

  it('同じキーワードが何度出ても加点は1回だけ', () => {
    const once = scoreArticle({ title: 'MCP', description: '' });
    const many = scoreArticle({ title: 'MCP MCP MCP', description: 'MCP MCP' });

    expect(many.score).toBe(once.score);
  });

  it('ノイズ語で減点する', () => {
    const result = scoreArticle({ title: 'chore: bump version', description: 'docs only change' });

    expect(result.score).toBeLessThan(0);
    expect(result.importance).toBe('C');
  });

  it('カテゴリもスコアリング対象にする', () => {
    const result = scoreArticle({ title: '無関係なタイトル', description: '', categories: ['Hono'] });

    expect(result.matchedLabels).toContain('Hono');
  });
});

describe('toImportance', () => {
  it('閾値で A / B / C を切り替える', () => {
    expect(toImportance(9)).toBe('A');
    expect(toImportance(8)).toBe('B');
    expect(toImportance(4)).toBe('B');
    expect(toImportance(3)).toBe('C');
  });
});
