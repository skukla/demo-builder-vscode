/**
 * keepClash — a stopped update's clash is applied again in the project's local storefront
 * copy and kept there for the SC's AI to fix, and recorded on the project (EDS-57 step 2).
 *
 * WHY REAL GIT. What is pinned is what git leaves behind: markers in the clashing file, the
 * clean files staged, and a copy put back exactly when the clash is not the clone's. A
 * scripted git cannot leave anything behind. "GitHub" is local bare repositories; the code's
 * https://github.com URLs are pointed at them by the executor (the seam in
 * templateMergeBase.test.ts).
 *
 * SAFETY. Every git process runs with every `GIT_*` variable removed and HOME in the temp root.
 */

// FIRST: this module owns the jest.mock calls the imports below must see.
import {
    HEADER_KHALIL,
    REAL_GIT_TIMEOUT_MS,
    TEMPLATE,
    fx,
    git,
    hasKeptClash,
    keepClash,
    mockGetToken,
    read,
    readPendingClash,
    request,
    storefrontProject,
    updateContext,
    write,
    writePendingClash,
} from './keptClash.testUtils';
import type { PendingClash } from '@/features/updates/services/pendingClash';
import { createMockProject } from '../../../helpers/projectFake';

describe('keepClash', () => {
    it('keeps the clash in the local copy: markers in the clashing file, the rest staged, nothing pushed', async () => {
        const project = storefrontProject();
        const pushedBefore = git(fx.scBare, 'rev-parse', 'main');

        await expect(keepClash(project, request(), updateContext())).resolves.toEqual({
            kind: 'kept',
            storefrontPath: fx.local,
            files: ['blocks/header/header.js'],
        });

        const header = read('blocks/header/header.js');
        expect(header).toMatch(/^<{7}/m);
        expect(header).toContain('drop-down line plus the quote icon');
        expect(header).toContain('drop-down line with aria attributes');
        expect(read('scripts/scripts.js')).toBe('scripts 2\n');
        expect(git(fx.local, 'diff', '--cached', '--name-only', '--diff-filter=AM').split('\n').sort()).toEqual([
            'scripts/new.js',
            'scripts/scripts.js',
        ]);
        expect(git(fx.local, 'diff', '--name-only', '--diff-filter=U')).toBe('blocks/header/header.js');
        expect(git(fx.scBare, 'rev-parse', 'main')).toBe(pushedBefore);
        // Sync Storefront refuses while this mark is there; nothing git tracks shows it.
        await expect(hasKeptClash(fx.local)).resolves.toBe(true);
        expect(git(fx.local, 'status', '--porcelain')).not.toContain('kept-clash');
    }, REAL_GIT_TIMEOUT_MS);

    it('records the clash on the project, with the change it belongs to', async () => {
        const project = storefrontProject();

        await keepClash(project, request(), updateContext());

        expect(readPendingClash(project)).toEqual({
            track: 'boilerplate',
            source: TEMPLATE,
            base: fx.t1,
            target: fx.t2,
            files: ['blocks/header/header.js'],
            fixes: false,
            keptAt: expect.any(String),
        });
    }, REAL_GIT_TIMEOUT_MS);

    it('brings a stale copy up to GitHub first, so the clash is kept against the real storefront', async () => {
        // The copy was made before Khalil's edit reached it.
        git(fx.local, 'reset', '-q', '--hard', 'HEAD~1');
        const project = storefrontProject();

        await expect(keepClash(project, request(), updateContext())).resolves.toMatchObject({ kind: 'kept' });

        expect(read('blocks/header/header.js')).toContain('drop-down line plus the quote icon');
    }, REAL_GIT_TIMEOUT_MS);

    it('keeps nothing in a copy holding a change GitHub lacks, and leaves that change alone', async () => {
        write(fx.local, 'notes.txt', 'only here\n');
        const project = storefrontProject();

        await expect(keepClash(project, request(), updateContext())).resolves.toEqual({
            kind: 'not-kept',
            reason: 'its local copy was left as it is: it has a local change GitHub does not have (notes.txt)',
        });

        expect(read('notes.txt')).toBe('only here\n');
        expect(read('blocks/header/header.js')).toBe(HEADER_KHALIL);
        expect(readPendingClash(project)).toBeUndefined();
        await expect(hasKeptClash(fx.local)).resolves.toBe(false);
    }, REAL_GIT_TIMEOUT_MS);

    it('puts the copy back when the change does not clash there the way it did on GitHub', async () => {
        const project = storefrontProject();

        const outcome = await keepClash(project, request(['scripts/scripts.js']), updateContext());

        expect(outcome).toEqual({ kind: 'not-kept', reason: 'the change did not clash there the way it did on GitHub' });
        expect(git(fx.local, 'status', '--porcelain')).toBe('');
        expect(readPendingClash(project)).toBeUndefined();
    }, REAL_GIT_TIMEOUT_MS);

    it('keeps nothing without a GitHub token', async () => {
        mockGetToken.mockResolvedValue(undefined);
        const ctx = updateContext();

        await expect(keepClash(storefrontProject(), request(), ctx)).resolves.toEqual({
            kind: 'not-kept',
            reason: 'GitHub is not signed in',
        });
        expect(ctx.commandManager.execute).not.toHaveBeenCalled();
    });
});

describe('readPendingClash', () => {
    const clash: PendingClash = {
        track: 'template',
        source: { owner: 'kmanns', repo: 'justrite' },
        base: 'a'.repeat(40),
        target: 'b'.repeat(40),
        files: ['blocks/header/header.js'],
        fixes: false,
        keptAt: '2026-10-21T00:00:00.000Z',
    };

    it('reads back what was written, and nothing once removed', () => {
        const project = createMockProject({
            componentInstances: { 'eds-storefront': { id: 'eds-storefront', name: 'EDS Storefront', status: 'ready', metadata: {} } },
        });

        writePendingClash(project, clash);
        expect(readPendingClash(project)).toEqual(clash);

        writePendingClash(project, undefined);
        expect(readPendingClash(project)).toBeUndefined();
    });

    it.each([
        ['an unknown track', { ...clash, track: 'fork' }],
        ['a short commit', { ...clash, base: 'abc1234' }],
        ['no files', { ...clash, files: [] }],
    ])('reads %s as none', (_label, value) => {
        const project = createMockProject({
            componentInstances: {
                'eds-storefront': { id: 'eds-storefront', name: 'EDS Storefront', status: 'ready', metadata: { pendingClash: value } },
            },
        });

        expect(readPendingClash(project)).toBeUndefined();
    });
});
