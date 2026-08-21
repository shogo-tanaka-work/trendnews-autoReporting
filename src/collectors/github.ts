/**
 * GitHub Releases Collector。Atom Feed ではなく REST API を使う（要件 6.3）。
 *
 * @see https://docs.github.com/en/rest/releases
 */
import { z } from 'zod';
import type { RawItem } from '../domain/article.js';
import type { GithubSourceConfig } from '../domain/source.js';
import { httpGetJson } from '../lib/http.js';
import type { Collector } from './types.js';

const PER_PAGE = 10;
const BODY_MAX_CHARS = 800;

const ReleaseSchema = z.object({
  id: z.number(),
  name: z.string().nullable().optional(),
  tag_name: z.string(),
  html_url: z.string(),
  body: z.string().nullable().optional(),
  draft: z.boolean(),
  prerelease: z.boolean(),
  published_at: z.string().nullable().optional(),
  created_at: z.string().nullable().optional(),
  author: z.object({ login: z.string() }).nullable().optional(),
});

const ReleaseListSchema = z.array(ReleaseSchema);

/** owner/repo 形式以外は設定ミスなので、収集前に弾く */
const REPO_PATTERN = /^[\w.-]+\/[\w.-]+$/;

export class GithubReleaseCollector implements Collector<GithubSourceConfig> {
  constructor(private readonly token: string | undefined) {}

  async collect(source: GithubSourceConfig): Promise<RawItem[]> {
    if (!REPO_PATTERN.test(source.repo)) {
      throw new Error(`repo の指定が不正です: ${source.repo}`);
    }

    const url = `https://api.github.com/repos/${source.repo}/releases?per_page=${PER_PAGE}`;

    const headers: Record<string, string> = {
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    };
    if (this.token) headers.Authorization = `Bearer ${this.token}`;

    const payload = await httpGetJson(url, { headers, label: `GitHub ${source.repo}` });
    const parsed = ReleaseListSchema.safeParse(payload);

    if (!parsed.success) {
      throw new Error(`GitHub Releases のレスポンス形式が想定と異なります (${source.repo})`);
    }

    return parsed.data
      .filter((release) => !release.draft)
      .filter((release) => source.includePrerelease === true || !release.prerelease)
      .map((release) => {
        const label = release.name && release.name.length > 0 ? release.name : release.tag_name;
        const prefix = release.prerelease ? '[pre] ' : '';

        return {
          externalId: String(release.id),
          title: `${prefix}${source.name} ${label}`,
          url: release.html_url,
          description: (release.body ?? '').slice(0, BODY_MAX_CHARS),
          publishedAt: release.published_at ?? release.created_at ?? undefined,
          author: release.author?.login,
          categories: [source.name, release.prerelease ? 'prerelease' : 'release'],
        } satisfies RawItem;
      });
  }
}
