/**
 * contentIndex — the one statement of where a site's index lives: the URL
 * every reader builds, and the resolution that tries the shipped brands' paths
 * in order when a source names none.
 */

import {
    CONTENT_INDEX_PATHS,
    FALLBACK_CONTENT_INDEX_PATH,
    contentIndexUrl,
    resolveContentIndex,
} from '@/features/eds/services/contentIndex';
import { createMockLogger } from '../../../helpers/loggerFake';

const SOURCE = { org: 'skukla', site: 'kukla-bodea' };

function fetchAnswering(paths: string[], data: unknown[] = [{}, {}, {}]): jest.Mock {
    return jest.fn(async (url: string) => {
        const ok = paths.some((p) => url.endsWith(p));
        return { ok, status: ok ? 200 : 404, json: async () => ({ data }) } as unknown as Response;
    });
}

describe('contentIndexUrl', () => {
    it('builds the published URL from the stated path — the same URL every reader uses; no path is ever guessed here', () => {
        expect(contentIndexUrl({ ...SOURCE, indexPath: '/full-index.json' })).toBe(
            'https://main--kukla-bodea--skukla.aem.live/full-index.json',
        );
        expect(contentIndexUrl({ ...SOURCE, indexPath: '/sitemap.json' })).toBe(
            'https://main--kukla-bodea--skukla.aem.live/sitemap.json',
        );
        expect(FALLBACK_CONTENT_INDEX_PATH).toBe(CONTENT_INDEX_PATHS[0]);
    });
});

describe('resolveContentIndex', () => {
    it('tries the known paths in order and answers the first that responds, with its page count', async () => {
        const fetchImpl = fetchAnswering(['/sitemap.json']);

        const index = await resolveContentIndex(SOURCE, fetchImpl as unknown as typeof fetch, createMockLogger());

        expect(index).toEqual({ indexPath: '/sitemap.json', found: true, pageCount: 3 });
        expect(fetchImpl.mock.calls.map((c) => c[0])).toEqual([
            'https://main--kukla-bodea--skukla.aem.live/full-index.json',
            'https://main--kukla-bodea--skukla.aem.live/sitemap.json',
        ]);
    });

    it('answers not found, under the fallback path, when no known path responds', async () => {
        const fetchImpl = fetchAnswering([]);

        const index = await resolveContentIndex(SOURCE, fetchImpl as unknown as typeof fetch, createMockLogger());

        expect(index).toEqual({ indexPath: '/full-index.json', found: false });
        expect(fetchImpl).toHaveBeenCalledTimes(CONTENT_INDEX_PATHS.length);
    });

    it('reads a stated path as stated and never second-guesses it', async () => {
        const fetchImpl = fetchAnswering(['/sitemap.json']);

        const index = await resolveContentIndex(
            { ...SOURCE, indexPath: '/pages.json' },
            fetchImpl as unknown as typeof fetch,
            createMockLogger(),
        );

        expect(index).toEqual({ indexPath: '/pages.json', found: false });
        expect(fetchImpl).toHaveBeenCalledTimes(1);
    });

    it('treats a thrown fetch as not found, never as a failure', async () => {
        const fetchImpl = jest.fn(async () => {
            throw new Error('network down');
        });

        const index = await resolveContentIndex(SOURCE, fetchImpl as unknown as typeof fetch, createMockLogger());

        expect(index).toEqual({ indexPath: '/full-index.json', found: false });
    });
});
