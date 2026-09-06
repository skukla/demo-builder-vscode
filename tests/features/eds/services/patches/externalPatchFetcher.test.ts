/**
 * External patch fetcher — release pinning
 *
 * The fetcher hardcoded `/main/`, so any push to the patches repo reached every
 * colleague's next build immediately: no deliberate publish, no record of what
 * shipped when, and no rollback target. Patches are written into the user's
 * repo at build time, so there is no recall either — fixing main fixes only
 * future builds.
 *
 * Pinning to the latest published release adds the publish step and the
 * rollback target without costing the release-free update path: cutting a
 * release still requires no VSIX.
 *
 * Fallback is deliberate. No releases exist on that repo yet, so a hard switch
 * would take every storefront build down until the first one is cut. Until then
 * the fetcher falls back to main and says so.
 */

import {
    fetchExternalPatches,
    _clearExternalPatchCacheForTests,
} from '@/features/eds/services/patches/externalPatchFetcher';
import type { Logger } from '@/types/logger';
import { createMockLogger } from '../../../../helpers/loggerFake';

jest.mock('@/core/utils/timeoutConfig', () => ({
    TIMEOUTS: { PREREQUISITE_CHECK: 15000 },
}));

const SOURCE = { owner: 'skukla', repo: 'eds-demo-patches', path: 'b2b' };
const LEDGER = { patches: [{ id: 'x', target: 'scripts/a.js' }] };

function makeLogger(): Logger {
    return createMockLogger() as unknown as Logger;
}

/** Route by URL so each test reads as a scenario rather than a call sequence. */
function routeFetch(opts: { releaseTag?: string; releaseStatus?: number }) {
    return jest.fn().mockImplementation((url: string) => {
        if (url.includes('api.github.com')) {
            const status = opts.releaseStatus ?? (opts.releaseTag ? 200 : 404);
            return Promise.resolve({
                ok: status === 200,
                status,
                json: () => Promise.resolve({ tag_name: opts.releaseTag }),
            });
        }
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(LEDGER) });
    });
}

function contentUrls(mock: jest.Mock): string[] {
    return mock.mock.calls
        .map((c) => String(c[0]))
        .filter((u) => u.includes('raw.githubusercontent'));
}

beforeEach(() => {
    jest.clearAllMocks();
    _clearExternalPatchCacheForTests();
});

describe('fetchExternalPatches — release pinning', () => {
    it('fetches from the latest published release tag', async () => {
        const mock = routeFetch({ releaseTag: 'v1.2.0' });
        global.fetch = mock;

        await fetchExternalPatches(SOURCE, 'code-patches.json', makeLogger());

        expect(contentUrls(mock)[0]).toBe(
            'https://raw.githubusercontent.com/skukla/eds-demo-patches/v1.2.0/b2b/code-patches.json'
        );
    });

    it('falls back to main when the repo has no published release', async () => {
        const mock = routeFetch({});
        global.fetch = mock;

        await fetchExternalPatches(SOURCE, 'code-patches.json', makeLogger());

        expect(contentUrls(mock)[0]).toBe(
            'https://raw.githubusercontent.com/skukla/eds-demo-patches/main/b2b/code-patches.json'
        );
    });

    it('warns when falling back, so an unpinned channel is visible', async () => {
        global.fetch = routeFetch({});
        const logger = makeLogger();

        await fetchExternalPatches(SOURCE, 'code-patches.json', logger);

        const warned = (logger.warn as jest.Mock).mock.calls.map((c) => String(c[0])).join('\n');
        expect(warned).toMatch(/release/i);
        expect(warned).toMatch(/main/);
    });

    it('still returns the ledger when pinned', async () => {
        global.fetch = routeFetch({ releaseTag: 'v1.0.0' });

        const patches = await fetchExternalPatches(SOURCE, 'code-patches.json', makeLogger());

        expect(patches).toEqual(LEDGER.patches);
    });

    it('resolves the release once per repo, not once per ledger file', async () => {
        const mock = routeFetch({ releaseTag: 'v1.0.0' });
        global.fetch = mock;
        const logger = makeLogger();

        await fetchExternalPatches(SOURCE, 'code-patches.json', logger);
        await fetchExternalPatches(SOURCE, 'patches.json', logger);

        const releaseCalls = mock.mock.calls.filter((c) => String(c[0]).includes('api.github.com'));
        expect(releaseCalls).toHaveLength(1);
    });

    it('does not cache a fallback, so a transient lookup failure cannot unpin the session', async () => {
        // Network blip on the release lookup must not leave the channel on main
        // for the rest of the session.
        const failing = jest.fn().mockImplementation((url: string) => {
            if (url.includes('api.github.com')) return Promise.reject(new Error('network'));
            return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(LEDGER) });
        });
        global.fetch = failing;
        await fetchExternalPatches(SOURCE, 'code-patches.json', makeLogger());

        _clearExternalPatchCacheForTests.call(null); // clear only the ledger cache path
        const recovered = routeFetch({ releaseTag: 'v2.0.0' });
        global.fetch = recovered;
        await fetchExternalPatches(SOURCE, 'code-patches.json', makeLogger());

        expect(contentUrls(recovered)[0]).toContain('/v2.0.0/');
    });

    it('does not read a tag out of a failed release response', async () => {
        // GitHub answers a rate-limited or erroring request with a body of its
        // own. Only an OK response is a release; anything else is unpinned, and
        // trusting a field off an error body would pin the channel to a tag
        // nobody published.
        const mock = jest.fn().mockImplementation((url: string) =>
            url.includes('api.github.com')
                ? Promise.resolve({
                      ok: false,
                      status: 403,
                      json: () => Promise.resolve({ tag_name: 'v9.9.9' }),
                  })
                : Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(LEDGER) })
        );
        global.fetch = mock;

        await fetchExternalPatches(SOURCE, 'code-patches.json', makeLogger());

        expect(contentUrls(mock)[0]).toContain('/main/');
    });

    it('bounds both requests with an abort signal', async () => {
        // Asserting the ARGUMENT: fetch is mocked, so it resolves at once
        // whatever it is handed, and a request with no signal only shows itself
        // as a storefront build hanging on an unresponsive github.
        const mock = routeFetch({ releaseTag: 'v1.0.0' });
        global.fetch = mock;

        await fetchExternalPatches(SOURCE, 'code-patches.json', makeLogger());

        expect(mock.mock.calls).toHaveLength(2);
        for (const call of mock.mock.calls) {
            expect(call[1]).toEqual(expect.objectContaining({ signal: expect.anything() }));
        }
    });

    it('caches per ledger file so concurrent callers share one content fetch', async () => {
        const mock = routeFetch({ releaseTag: 'v1.0.0' });
        global.fetch = mock;
        const logger = makeLogger();

        await Promise.all([
            fetchExternalPatches(SOURCE, 'code-patches.json', logger),
            fetchExternalPatches(SOURCE, 'code-patches.json', logger),
        ]);

        expect(contentUrls(mock)).toHaveLength(1);
    });
});

describe('fetchExternalPatches — ledger responses', () => {
    it('returns an empty list when the ledger carries no patches field', async () => {
        global.fetch = jest.fn().mockImplementation((url: string) =>
            url.includes('api.github.com')
                ? Promise.resolve({
                      ok: true,
                      status: 200,
                      json: () => Promise.resolve({ tag_name: 'v1.0.0' }),
                  })
                : Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({}) })
        );

        const patches = await fetchExternalPatches(SOURCE, 'code-patches.json', makeLogger());

        // toStrictEqual, not toEqual: `expect([undefined]).toEqual([])` passes.
        expect(patches).toStrictEqual([]);
    });

    it('throws on a failed ledger fetch, and lets the next call retry', async () => {
        // The failure has to REACH the caller — the registries translate it into
        // a not-applied result and a warning — and it must not be remembered: a
        // cached rejection would make one 503 permanent for the whole session.
        let recovered = false;
        const mock = jest.fn().mockImplementation((url: string) => {
            if (url.includes('api.github.com')) {
                return Promise.resolve({
                    ok: true,
                    status: 200,
                    json: () => Promise.resolve({ tag_name: 'v1.0.0' }),
                });
            }
            return recovered
                ? Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(LEDGER) })
                : Promise.resolve({
                      ok: false,
                      status: 503,
                      statusText: 'Service Unavailable',
                      json: () => Promise.resolve({}),
                  });
        });
        global.fetch = mock;

        await expect(
            fetchExternalPatches(SOURCE, 'code-patches.json', makeLogger())
        ).rejects.toThrow(/503/);

        recovered = true;
        await expect(
            fetchExternalPatches(SOURCE, 'code-patches.json', makeLogger())
        ).resolves.toStrictEqual(LEDGER.patches);
    });
});
