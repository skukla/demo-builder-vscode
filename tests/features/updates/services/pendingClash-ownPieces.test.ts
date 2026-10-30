/**
 * A clash kept for fixing is prepared like the clone that found it: Demo Builder's own pieces
 * set aside around Adobe's change, and put back (2026-10-30).
 *
 * The clone compares its clashing files with the copy's and keeps nothing when they differ, so
 * a copy that kept our pieces in would clash where the clone did not. A piece in a file that
 * clashes cannot go back while git's markers are there, so it is recorded on the clash and goes
 * back when the fix is finished.
 *
 * JustRite's header in miniature (`keptClash.testUtils.ts`), with one of our fixes on the line
 * above Khalil's. "GitHub" is local bare repositories.
 */

// FIRST: this module owns the jest.mock calls the imports below must see.
import {
    REAL_GIT_TIMEOUT_MS,
    finishClash,
    fx,
    git,
    keepClash,
    read,
    readPendingClash,
    request,
    storefrontProject,
    updateContext,
    write,
} from './keptClash.testUtils';
import * as fs from 'fs';
import * as path from 'path';
import type { CodePatch } from '@/features/eds/services/patches/codePatchRegistry';
import type { ShippedPatches } from '@/features/eds/services/patches/shippedPatchLedger';
import type { FinishDeps } from '@/features/updates/services/pendingClashFinish';

const HEADER_FIX: CodePatch = {
    id: 'header-nav-start-fix',
    target: 'blocks/header/header.js',
    description: 'A fix on the line above the one Adobe and Khalil both changed.',
    precondition: '// nav start',
    replacement: '// nav start (Demo Builder fix)',
};
const mockShipped = jest.fn<Promise<ShippedPatches>, []>();
jest.mock('@/features/eds/services/patches/shippedPatchLedger', () => ({
    readShippedPatches: () => mockShipped(),
}));

const FIXED_HEADER = "// nav start\nconst dropDown = 'drop-down line with aria attributes plus the quote icon';\n// nav end\n";

/** Our fix lands on GitHub, as creation would have put it there. */
function fixOnGitHub(): void {
    const work = path.join(fx.root, 'fix-work');
    git(fx.root, 'clone', '-q', fx.scBare, work);
    const header = fs.readFileSync(path.join(work, HEADER_FIX.target), 'utf8');
    write(work, HEADER_FIX.target, header.replace(HEADER_FIX.precondition, HEADER_FIX.replacement));
    git(work, 'commit', '-q', '-am', 'Demo Builder fix');
    git(work, 'push', '-q', fx.scBare, 'HEAD:main');
}

const adobeChange = () => ({ ...request(), clash: { ...request().clash, ownPiecesAside: true } });

beforeEach(() => {
    mockShipped.mockResolvedValue({ live: [HEADER_FIX], retired: [], complete: true });
    fixOnGitHub();
});

describe("keepClash, for Adobe's change", () => {
    it('takes our fix out of the clashing file and records it to go back at finishing', async () => {
        const project = storefrontProject();

        await expect(keepClash(project, adobeChange(), updateContext())).resolves.toMatchObject({
            kind: 'kept',
            files: ['blocks/header/header.js'],
        });

        expect(read(HEADER_FIX.target)).toMatch(/^<{7}/m);
        expect(read(HEADER_FIX.target)).not.toContain(HEADER_FIX.replacement);
        expect(readPendingClash(project)?.aside).toEqual({ patches: [HEADER_FIX.id], quickEdit: false });
    }, REAL_GIT_TIMEOUT_MS);

    it('CONTROL: for a change that is not Adobe\'s, nothing is set aside', async () => {
        const project = storefrontProject();

        await keepClash(project, request(), updateContext());

        expect(read(HEADER_FIX.target)).toContain(HEADER_FIX.replacement);
        expect(readPendingClash(project)?.aside).toBeUndefined();
    }, REAL_GIT_TIMEOUT_MS);
});

describe('finishClash puts back what the clash set aside', () => {
    it("pushes the AI's fix with our fix back in the file", async () => {
        const project = storefrontProject();
        const ctx = updateContext();
        await keepClash(project, adobeChange(), ctx);
        // The AI's part: both changes kept, markers gone, our fix not its business.
        write(fx.local, HEADER_FIX.target, FIXED_HEADER);
        const deps: FinishDeps = {
            ctx,
            latestTarget: async () => fx.t2,
            recordTemplateVersion: async () => undefined,
            restorePieces: async () => [],
            livePatches: async () => [HEADER_FIX],
        };

        await expect(finishClash(project, deps)).resolves.toMatchObject({ kind: 'finished', notes: [] });

        expect(git(fx.scBare, 'show', `main:${HEADER_FIX.target}`)).toBe(
            FIXED_HEADER.replace(HEADER_FIX.precondition, HEADER_FIX.replacement).trimEnd(),
        );
    }, REAL_GIT_TIMEOUT_MS);
});
