/**
 * Code-patch pipeline wrappers — the failure paths.
 *
 * Split from `codePatchPipelineHelpers.test.ts` (750-line limit). That suite
 * covers the happy phases: routing by target prefix, fetching missing template
 * files, composing patches, writing back. This one covers what the wrappers
 * promise when the network, the template repo or the destination repo
 * misbehaves — the three catch blocks, the abort signal on the template fetch,
 * the not-ok guard that keeps an error page out of the working set, and the
 * falsy-SHA guard that decides what `createOrUpdateFile` is handed.
 */

import {
    applyCanonicalCodePatches,
    applyBlockCodePatches,
} from '@/features/eds/services/patches/codePatchPipelineHelpers';
import type { GitHubFileOperations } from '@/features/eds/services/github/githubFileOperations';
import {
    SOURCE,
    mockLogger,
    installCodePatchFetchLifecycle,
} from './codePatchPipelineHelpers.testUtils';

installCodePatchFetchLifecycle();

describe('codePatchPipelineHelpers — failure paths', () => {
    /** Ledger fetch + an optional handler for the per-target raw fetches. */
    const ledgerFetch = (patches: unknown[], onRaw?: (url: string) => Promise<unknown>) =>
        jest.fn().mockImplementation((url: string) => {
            if (url.includes('code-patches.json')) {
                return Promise.resolve({ ok: true, json: () => Promise.resolve({ patches }) });
            }
            return onRaw
                ? onRaw(url)
                : Promise.reject(new Error(`unexpected template fetch: ${url}`));
        });

    const patch = (over: Record<string, unknown>) => ({
        description: '',
        precondition: 'OLD',
        replacement: 'NEW',
        ...over,
    });

    describe('applyCanonicalCodePatches', () => {
        it('returns no results and fetches nothing when every requested patch is block-phase', async () => {
            // The canonical wrapper owns the NON-blocks/ half of the ledger. When
            // the requested IDs are all block targets there is nothing for this
            // phase to do, and it must not reach out to the template repo for a
            // file the block phase will read from the destination repo instead.
            const fetchMock = ledgerFetch([patch({ id: 'b', target: 'blocks/hero/hero.js' })]);
            global.fetch = fetchMock;
            const fileOverrides = new Map<string, string>();

            const results = await applyCanonicalCodePatches(
                fileOverrides,
                'tmpl-owner',
                'tmpl-repo',
                ['b'],
                SOURCE,
                mockLogger
            );

            expect(results).toEqual([]);
            expect(fileOverrides.size).toBe(0);
            // Only the ledger read — no per-target template fetch.
            const targetFetches = fetchMock.mock.calls
                .map(([url]) => String(url))
                .filter((url) => url.endsWith('blocks/hero/hero.js'));
            expect(targetFetches).toEqual([]);
        });

        it('gives the template fetch an abort signal', async () => {
            // Without it a hung raw.githubusercontent connection stalls the whole
            // reset: this loop is sequential and has no other timeout.
            const fetchMock = ledgerFetch([patch({ id: 'p', target: 'scripts/a.js' })], () =>
                Promise.resolve({ ok: true, text: () => Promise.resolve('an OLD line') })
            );
            global.fetch = fetchMock;

            await applyCanonicalCodePatches(
                new Map<string, string>(),
                'tmpl-owner',
                'tmpl-repo',
                ['p'],
                SOURCE,
                mockLogger
            );

            expect(fetchMock).toHaveBeenCalledWith(
                'https://raw.githubusercontent.com/tmpl-owner/tmpl-repo/main/scripts/a.js',
                expect.objectContaining({ signal: expect.any(AbortSignal) })
            );
        });

        it('keeps an error-page body out of the working set', async () => {
            // A non-2xx response still has a body, and raw.githubusercontent's 404
            // page is text. Patching it would put the error page into the reset
            // commit as the file's content — and here the body even satisfies the
            // precondition, so the patch would report a clean success.
            const fetchMock = ledgerFetch([patch({ id: 'p', target: 'scripts/a.js' })], () =>
                Promise.resolve({
                    ok: false,
                    status: 404,
                    text: () => Promise.resolve('404: OLD Not Found'),
                })
            );
            global.fetch = fetchMock;
            const fileOverrides = new Map<string, string>();

            const results = await applyCanonicalCodePatches(
                fileOverrides,
                'tmpl-owner',
                'tmpl-repo',
                ['p'],
                SOURCE,
                mockLogger
            );

            expect(fileOverrides.has('scripts/a.js')).toBe(false);
            expect(results[0].applied).toBe(false);
        });

        it('survives a template fetch that rejects and reports the patch not-applied', async () => {
            // Proceed-and-warn (ADR-006 D1): a transport failure on one target is
            // reported through the engine's result list, never thrown at the reset.
            const fetchMock = ledgerFetch([patch({ id: 'p', target: 'scripts/a.js' })], () =>
                Promise.reject(new Error('ECONNRESET'))
            );
            global.fetch = fetchMock;
            const fileOverrides = new Map<string, string>();

            const results = await applyCanonicalCodePatches(
                fileOverrides,
                'tmpl-owner',
                'tmpl-repo',
                ['p'],
                SOURCE,
                mockLogger
            );

            expect(results).toHaveLength(1);
            expect(results[0].applied).toBe(false);
            expect(fileOverrides.has('scripts/a.js')).toBe(false);
        });
    });

    describe('applyBlockCodePatches', () => {
        /** File ops whose per-path behaviour each test sets explicitly. */
        const makeOps = (
            reads: Record<string, { content: string; sha: string } | Error | null>,
            write: jest.Mock = jest.fn().mockResolvedValue({ sha: 'new', commitSha: 'c' })
        ): GitHubFileOperations =>
            ({
                getFileContent: jest.fn(async (_o: string, _r: string, path: string) => {
                    const entry = reads[path];
                    if (entry instanceof Error) throw entry;
                    return entry ?? null;
                }),
                createOrUpdateFile: write,
            }) as unknown as GitHubFileOperations;

        it('keeps patching the other targets when one read fails', async () => {
            // One unreadable block must not abort the phase — the rest of the
            // library still gets its patches, and the failed target is reported
            // through the engine rather than thrown.
            global.fetch = ledgerFetch([
                patch({ id: 'bad', target: 'blocks/bad/bad.js' }),
                patch({ id: 'good', target: 'blocks/good/good.js' }),
            ]);
            const write = jest.fn().mockResolvedValue({ sha: 'new', commitSha: 'c' });
            const ops = makeOps(
                {
                    'blocks/bad/bad.js': new Error('502 Bad Gateway'),
                    'blocks/good/good.js': { content: 'an OLD line', sha: 'sha-good' },
                },
                write
            );

            const results = await applyBlockCodePatches(
                ops,
                'owner',
                'repo',
                ['bad', 'good'],
                SOURCE,
                mockLogger
            );

            expect(results).toHaveLength(2);
            expect(results.find((r) => r.patchId === 'good')?.applied).toBe(true);
            expect(results.find((r) => r.patchId === 'bad')?.applied).toBe(false);
            expect(write).toHaveBeenCalledTimes(1);
            expect(write).toHaveBeenCalledWith(
                'owner',
                'repo',
                'blocks/good/good.js',
                'an NEW line',
                expect.any(String),
                'sha-good'
            );
        });

        it('returns the engine results even when the write-back fails', async () => {
            // The patches DID apply; only the commit failed. Throwing here would
            // lose the whole report, including the patches that succeeded on
            // other files, and abort a storefront setup that is otherwise fine.
            global.fetch = ledgerFetch([patch({ id: 'p', target: 'blocks/hero/hero.js' })]);
            const write = jest.fn().mockRejectedValue(new Error('409 Conflict'));
            const ops = makeOps(
                { 'blocks/hero/hero.js': { content: 'an OLD line', sha: 'sha-hero' } },
                write
            );

            const results = await applyBlockCodePatches(
                ops,
                'owner',
                'repo',
                ['p'],
                SOURCE,
                mockLogger
            );

            expect(results).toHaveLength(1);
            expect(results[0].applied).toBe(true);
            expect(write).toHaveBeenCalledTimes(1);
        });

        it('sends no SHA rather than an empty one when the read carried no SHA', async () => {
            // `createOrUpdateFile` branches on whether it was given a SHA: with one
            // it takes the update-with-SHA path, without one it creates. An empty
            // string is neither — it reaches the API as a malformed update.
            global.fetch = ledgerFetch([patch({ id: 'p', target: 'blocks/hero/hero.js' })]);
            const write = jest.fn().mockResolvedValue({ sha: 'new', commitSha: 'c' });
            const ops = makeOps(
                { 'blocks/hero/hero.js': { content: 'an OLD line', sha: '' } },
                write
            );

            await applyBlockCodePatches(ops, 'owner', 'repo', ['p'], SOURCE, mockLogger);

            expect(write).toHaveBeenCalledWith(
                'owner',
                'repo',
                'blocks/hero/hero.js',
                'an NEW line',
                expect.any(String),
                undefined
            );
        });
    });
});
