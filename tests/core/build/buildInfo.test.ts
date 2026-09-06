/**
 * buildInfo — makes the RUNNING build say which checkout it came from.
 *
 * The defect this exists for (2026-08-12): two complete `dist/` trees existed on
 * one machine — a main checkout and a worktree — and F5 bound the Extension Dev
 * Host to whichever folder had focus. Every change built into the other tree was
 * invisible, with no signal anywhere: not in the UI, not in the logs, not in
 * Diagnostics. Two reload-and-look cycles were spent before anyone compared
 * `dist/` timestamps, and the first diagnosis blamed a second watcher that did
 * not exist.
 *
 * So the contract here is about FAILURE, not the happy path: a missing or
 * corrupt stamp must degrade to "unknown", never throw into activation, because
 * a diagnostic that can break the thing it diagnoses is worse than none.
 */

import * as fsPromises from 'fs/promises';

jest.mock('fs/promises', () => ({
    readFile: jest.fn(),
    readdir: jest.fn(),
    stat: jest.fn(),
}));

import {
    describeBuildInfo,
    isDistStale,
    newestMtimeUnder,
    readBuildInfo,
} from '@/core/build/buildInfo';

const readFileMock = fsPromises.readFile as jest.Mock;
const readdirMock = fsPromises.readdir as jest.Mock;
const statMock = fsPromises.stat as jest.Mock;

const EXT_PATH = '/checkout/demo-builder-vscode';

const STAMP = {
    checkoutPath: '/checkout/demo-builder-vscode',
    branch: 'develop',
    commit: '54bcbcb9',
    dirty: false,
    builtAt: '2026-08-12T08:36:25.000Z',
};

beforeEach(() => jest.clearAllMocks());

describe('readBuildInfo', () => {
    it('reads the stamp esbuild wrote beside the bundles', async () => {
        readFileMock.mockResolvedValue(JSON.stringify(STAMP));

        expect(await readBuildInfo(EXT_PATH)).toEqual(STAMP);
        expect(readFileMock).toHaveBeenCalledWith(`${EXT_PATH}/dist/build-info.json`, 'utf-8');
    });

    it('returns undefined when the stamp is absent rather than throwing', async () => {
        // A packaged VSIX built before this existed, or a partial build.
        const err = new Error('ENOENT') as NodeJS.ErrnoException;
        err.code = 'ENOENT';
        readFileMock.mockRejectedValue(err);

        expect(await readBuildInfo(EXT_PATH)).toBeUndefined();
    });

    it('returns undefined on malformed JSON rather than throwing', async () => {
        readFileMock.mockResolvedValue('{not json');

        expect(await readBuildInfo(EXT_PATH)).toBeUndefined();
    });

    it('rejects a stamp missing the fields that make it useful', async () => {
        // A half-written stamp claiming a branch but no commit would report a
        // build identity that cannot be checked against anything.
        readFileMock.mockResolvedValue(JSON.stringify({ branch: 'develop' }));

        expect(await readBuildInfo(EXT_PATH)).toBeUndefined();
    });

    it.each(['checkoutPath', 'branch', 'commit', 'builtAt'] as const)(
        'rejects a stamp missing only %s — every field is required on its own',
        async (missing) => {
            // Each field is load-bearing: the commit and branch ARE the identity,
            // builtAt is what the staleness check compares against, and the
            // checkout path is the thing the two-dist-trees defect needed named.
            const partial = { ...STAMP };
            delete (partial as Record<string, unknown>)[missing];
            readFileMock.mockResolvedValue(JSON.stringify(partial));

            expect(await readBuildInfo(EXT_PATH)).toBeUndefined();
        }
    );

    it('rejects a stamp that is not an object at all', async () => {
        // `dist/build-info.json` holding a bare number parses cleanly, and
        // spreading it would answer a stamp-shaped object with no identity in it.
        readFileMock.mockResolvedValue('42');

        expect(await readBuildInfo(EXT_PATH)).toBeUndefined();
    });

    it('carries a dirty flag through, so an uncommitted build says so', async () => {
        readFileMock.mockResolvedValue(JSON.stringify({ ...STAMP, dirty: true }));

        expect(await readBuildInfo(EXT_PATH)).toEqual({ ...STAMP, dirty: true });
    });

    it('normalises a non-boolean dirty flag to false rather than passing it on', async () => {
        readFileMock.mockResolvedValue(JSON.stringify({ ...STAMP, dirty: 'yes' }));

        expect(await readBuildInfo(EXT_PATH)).toEqual({ ...STAMP, dirty: false });
    });
});

describe('describeBuildInfo', () => {
    it('leads with branch@commit — the identity you compare at a glance', () => {
        expect(describeBuildInfo(STAMP)).toMatch(/^develop@54bcbcb9/);
    });

    it('marks a dirty tree, so an uncommitted build never reads as its commit', () => {
        expect(describeBuildInfo({ ...STAMP, dirty: true })).toMatch(/54bcbcb9\+/);
    });

    it('names the checkout, which is the whole point', () => {
        expect(describeBuildInfo(STAMP)).toContain('/checkout/demo-builder-vscode');
    });
});

describe('isDistStale', () => {
    const builtAtMs = Date.parse(STAMP.builtAt);

    it('is stale when a source file is newer than the build', () => {
        expect(isDistStale(STAMP, builtAtMs + 1000)).toBe(true);
    });

    it('is fresh when the build is newer than every source file', () => {
        expect(isDistStale(STAMP, builtAtMs - 1000)).toBe(false);
    });

    it('is not stale when the source is exactly as old as the build', () => {
        // Equal means the build already includes it. Reporting stale here would
        // send someone rebuilding on every check that landed in the same ms.
        expect(isDistStale(STAMP, builtAtMs)).toBe(false);
    });

    it('is not stale when the source mtime is unknown', () => {
        // Never cry stale on missing evidence — a false alarm here sends someone
        // rebuilding to chase a problem that is somewhere else entirely.
        expect(isDistStale(STAMP, undefined)).toBe(false);
    });
});

describe('newestMtimeUnder', () => {
    function tree(files: Record<string, number>) {
        readdirMock.mockImplementation(async (dir: string) => {
            const prefix = dir.endsWith('/') ? dir : dir + '/';
            const names = new Set<string>();
            for (const p of Object.keys(files)) {
                if (!p.startsWith(prefix)) continue;
                names.add(p.slice(prefix.length).split('/')[0]);
            }
            return Array.from(names).map((name) => {
                const child = `${prefix}${name}`;
                const isDir = Object.keys(files).some((p) => p.startsWith(child + '/'));
                return { name, isFile: () => !isDir, isDirectory: () => isDir };
            });
        });
        statMock.mockImplementation(async (p: string) => ({ mtimeMs: files[p] ?? 0 }));
    }

    it('finds the newest mtime across nested directories', async () => {
        tree({
            '/src/a.ts': 100,
            '/src/deep/b.ts': 900,
            '/src/deep/c.ts': 400,
        });

        expect(await newestMtimeUnder('/src')).toBe(900);
    });

    it('asks for dirents, which is what tells a directory from a file', async () => {
        // Without `withFileTypes` readdir answers plain strings, the walk never
        // recurses, and a stale nested source reads as fresh.
        tree({ '/src/a.ts': 100 });

        await newestMtimeUnder('/src');

        expect(readdirMock).toHaveBeenCalledWith('/src', { withFileTypes: true });
    });

    it('ignores an entry that is neither a file nor a directory', async () => {
        // A socket or a dangling symlink has no mtime worth reporting, and
        // stat-ing it would answer 0 rather than nothing.
        readdirMock.mockResolvedValue([
            { name: 'a.ts', isFile: () => true, isDirectory: () => false },
            { name: 'weird.sock', isFile: () => false, isDirectory: () => false },
        ]);
        statMock.mockImplementation(async (p: string) => ({
            mtimeMs: p.endsWith('weird.sock') ? 5000 : 100,
        }));

        expect(await newestMtimeUnder('/src')).toBe(100);
    });

    it('keeps walking when one file cannot be stat-ed', async () => {
        readdirMock.mockResolvedValue([
            { name: 'gone.ts', isFile: () => true, isDirectory: () => false },
            { name: 'b.ts', isFile: () => true, isDirectory: () => false },
        ]);
        statMock.mockImplementation(async (p: string) => {
            if (p.endsWith('gone.ts')) throw new Error('ENOENT');
            return { mtimeMs: 700 };
        });

        expect(await newestMtimeUnder('/src')).toBe(700);
    });

    it('returns undefined for a directory it cannot read', async () => {
        readdirMock.mockRejectedValue(new Error('EACCES'));

        expect(await newestMtimeUnder('/src')).toBeUndefined();
    });
});
