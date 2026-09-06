/**
 * Runtime-surface resolver (ADR-008 consumer) — unit tests.
 *
 * Verifies the merge is a strict floor over the static hand list (never removes),
 * that the generated derived/residual blocks map into the right categories, and
 * that fetch failure / no-source degrade to exactly the static inventory.
 */

import {
    mergeRuntimeSurfaces,
    getRuntimeSurfaces,
    fetchRuntimeSurfaces,
    _clearRuntimeSurfaceCacheForTests,
    type GeneratedRuntimeSurfaces,
    type RuntimeSurfaceSource,
} from '@/features/eds/services/runtimeSurfaceResolver';
import { RUNTIME_SURFACES } from '@/features/eds/services/runtimeSurfaceInventory';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';
import { createMockLogger } from '../../../helpers/loggerFake';

const logger = createMockLogger();
const source: RuntimeSurfaceSource = { owner: 'skukla', repo: 'eds-demo-patches', path: 'b2b' };

const LEDGER_URL =
    'https://raw.githubusercontent.com/skukla/eds-demo-patches/main/b2b/runtime-surfaces.json';

/** The only Response fields this module reads. */
const ok = (body: unknown) => ({ ok: true, status: 200, json: () => Promise.resolve(body) });
const notOk = (status: number) => ({ ok: false, status, json: () => Promise.resolve({}) });

const realFetch = global.fetch;

beforeEach(() => {
    jest.clearAllMocks();
    _clearRuntimeSurfaceCacheForTests();
});

afterEach(() => {
    global.fetch = realFetch;
});

describe('mergeRuntimeSurfaces', () => {
    it('returns the static base unchanged when generated is null', () => {
        expect(mergeRuntimeSurfaces(null)).toEqual(RUNTIME_SURFACES);
    });

    it('unions derived fragments + navFooter into fragments, and residual into spreadsheets', () => {
        const base = {
            spreadsheets: ['/placeholders'],
            fragments: ['/nav'],
            authPages: [{ path: '/customer/login', blockClass: 'commerce-login' }],
        };
        const generated: GeneratedRuntimeSurfaces = {
            derived: {
                fragments: ['/customer/sidebar-fragment'],
                navFooter: ['/nav', '/footer'],
                customerPages: ['/customer/account'],
            },
            residual: { spreadsheets: ['/metadata'] },
        };
        const merged = mergeRuntimeSurfaces(generated, base);
        expect(merged.fragments.sort()).toEqual(
            ['/customer/sidebar-fragment', '/footer', '/nav'].sort()
        );
        expect(merged.spreadsheets.sort()).toEqual(['/metadata', '/placeholders'].sort());
    });

    it('is a strict floor — never drops a base entry, even if generated omits it', () => {
        const base = {
            spreadsheets: ['/placeholders', '/sitemap'],
            fragments: ['/nav', '/footer'],
            authPages: [{ path: '/customer/account', blockClass: 'commerce-account' }],
        };
        const merged = mergeRuntimeSurfaces(
            { derived: { fragments: [] }, residual: { spreadsheets: [] } },
            base
        );
        expect(merged.spreadsheets).toEqual(expect.arrayContaining(base.spreadsheets));
        expect(merged.fragments).toEqual(expect.arrayContaining(base.fragments));
        expect(merged.authPages).toEqual(base.authPages); // authPages never altered by the merge
    });

    it('does not synthesize authPages from customerPages (blockClass is human-owned)', () => {
        const base = { spreadsheets: [], fragments: [], authPages: [] };
        const merged = mergeRuntimeSurfaces(
            { derived: { customerPages: ['/customer/orders'] } },
            base
        );
        expect(merged.authPages).toEqual([]);
    });
});

describe('getRuntimeSurfaces', () => {
    it('returns the static inventory when no source is given (no fetch)', async () => {
        const fetcher = jest.fn();
        const result = await getRuntimeSurfaces(undefined, logger, { fetcher: fetcher });
        expect(result).toBe(RUNTIME_SURFACES);
        expect(fetcher).not.toHaveBeenCalled();
    });

    it('merges the generated surfaces when the fetch succeeds', async () => {
        const fetcher = jest.fn().mockResolvedValue({
            derived: { fragments: ['/brand-new-fragment'] },
        } as GeneratedRuntimeSurfaces);
        const result = await getRuntimeSurfaces(source, logger, { fetcher: fetcher });
        expect(result.fragments).toContain('/brand-new-fragment');
        // floor preserved
        expect(result.fragments).toEqual(expect.arrayContaining(RUNTIME_SURFACES.fragments));
    });

    it('ignores a ledger still shipping the retired placeholderSheets field (lenient parsing)', async () => {
        // Sheets are content since 2026-08-23; a generated runtime-surfaces.json
        // that still carries the field must be read without error and without
        // resurrecting the surface.
        const fetcher = jest.fn().mockResolvedValue({
            derived: { placeholderSheets: ['placeholders/ghost'] },
        } as GeneratedRuntimeSurfaces);
        const result = await getRuntimeSurfaces(source, logger, { fetcher: fetcher });
        expect('placeholderSheets' in result).toBe(false);
        expect(result.fragments).toEqual(expect.arrayContaining(RUNTIME_SURFACES.fragments));
    });

    it('falls back to the static inventory when the fetch returns null', async () => {
        const fetcher = jest.fn().mockResolvedValue(null);
        const result = await getRuntimeSurfaces(source, logger, { fetcher: fetcher });
        expect(result).toEqual(RUNTIME_SURFACES);
    });
});

/**
 * The fetcher itself. Everything above hands `getRuntimeSurfaces` a stub
 * fetcher, so the real one — the URL it builds, its timeout, its treatment of a
 * non-200, and the cache it keeps — was driven by nothing.
 */
describe('fetchRuntimeSurfaces', () => {
    const GENERATED: GeneratedRuntimeSurfaces = {
        derived: { fragments: ['/derived-fragment'] },
        residual: { spreadsheets: ['/derived-sheet'] },
    };

    it('reads the ledger from raw.githubusercontent under a bounded timeout', async () => {
        const fetchMock = jest.fn().mockResolvedValue(ok(GENERATED));
        global.fetch = fetchMock;
        const timeout = jest.spyOn(AbortSignal, 'timeout');

        await expect(fetchRuntimeSurfaces(source, logger)).resolves.toEqual(GENERATED);

        // The ARGUMENTS are the contract: the exact ledger URL, and a bounded
        // signal so a hung raw.githubusercontent cannot stall a storefront create.
        const [url, init] = fetchMock.mock.calls[0];
        expect(url).toBe(LEDGER_URL);
        expect(init.signal).toBeInstanceOf(AbortSignal);
        expect(timeout).toHaveBeenCalledWith(TIMEOUTS.PREREQUISITE_CHECK);
        timeout.mockRestore();
    });

    it('returns null when the ledger has no generated inventory (404)', async () => {
        global.fetch = jest.fn().mockResolvedValue(notOk(404));

        await expect(fetchRuntimeSurfaces(source, logger)).resolves.toBeNull();
    });

    it('returns null when the fetch itself fails', async () => {
        global.fetch = jest.fn().mockRejectedValue(new Error('offline'));

        await expect(fetchRuntimeSurfaces(source, logger)).resolves.toBeNull();
    });

    it('caches a successful read per source, and the test hook really clears it', async () => {
        const fetchMock = jest.fn().mockResolvedValue(ok(GENERATED));
        global.fetch = fetchMock;

        await fetchRuntimeSurfaces(source, logger);
        await fetchRuntimeSurfaces(source, logger);
        expect(fetchMock).toHaveBeenCalledTimes(1);

        _clearRuntimeSurfaceCacheForTests();
        await fetchRuntimeSurfaces(source, logger);
        expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it('keys the cache by owner/repo/path, so a second ledger is fetched', async () => {
        const fetchMock = jest.fn().mockResolvedValue(ok(GENERATED));
        global.fetch = fetchMock;

        await fetchRuntimeSurfaces(source, logger);
        await fetchRuntimeSurfaces({ ...source, path: 'b2c' }, logger);

        expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it('evicts a failed read so the next create retries rather than inheriting it', async () => {
        // A storefront created while offline must not poison every later create
        // in the same window with a cached "no generated inventory".
        const fetchMock = jest
            .fn()
            .mockRejectedValueOnce(new Error('offline'))
            .mockResolvedValue(ok(GENERATED));
        global.fetch = fetchMock;

        await expect(fetchRuntimeSurfaces(source, logger)).resolves.toBeNull();
        await expect(fetchRuntimeSurfaces(source, logger)).resolves.toEqual(GENERATED);
        expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it('evicts even when the failure path itself throws, so the cache holds no rejection', async () => {
        // The only way the inner promise can reject is the failure logger, and a
        // rejected promise left in the cache would be handed to every later
        // caller for the rest of the session.
        const brokenLogger = createMockLogger({
            warn: jest.fn((_message: string, ..._args: unknown[]): void => {
                throw new Error('log sink down');
            }),
        });
        const fetchMock = jest
            .fn()
            .mockRejectedValueOnce(new Error('offline'))
            .mockResolvedValue(ok(GENERATED));
        global.fetch = fetchMock;

        await expect(fetchRuntimeSurfaces(source, brokenLogger)).rejects.toThrow('log sink down');
        await expect(fetchRuntimeSurfaces(source, logger)).resolves.toEqual(GENERATED);
    });
});

describe('mergeRuntimeSurfaces — untrusted ledger contents', () => {
    it('drops entries that are not strings (the ledger is parsed JSON, not typed data)', () => {
        // The generated file comes off the network. Its declared type is a promise
        // the file cannot keep, and a null path would reach the publisher as a
        // surface to preview.
        const generated = JSON.parse(
            '{"derived":{"fragments":["/real",null,7]},"residual":{"spreadsheets":[{"nope":1},"/sheet"]}}'
        ) as GeneratedRuntimeSurfaces;
        const base = { spreadsheets: [], fragments: [], authPages: [] };

        const merged = mergeRuntimeSurfaces(generated, base);

        expect(merged.fragments).toStrictEqual(['/real']);
        expect(merged.spreadsheets).toStrictEqual(['/sheet']);
    });
});
