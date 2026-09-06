/**
 * Consecutive-miss tracking for patches — the content-patch drift signal.
 *
 * The LKG gate verifies CODE ledgers against clonable canonicals; content
 * patches target DA.live pages it never reads, so an obsolete content patch's
 * only symptom is "didn't apply" on every create/reset. Counting consecutive
 * misses turns that toast into data: at the threshold the report escalates to
 * "likely obsolete". Backed by a JSON file under ~/.demo-builder so headless
 * callers count too; every failure mode is fail-open (a broken counter must
 * never break a create/reset).
 */

import * as os from 'os';
import * as path from 'path';
import * as fsPromises from 'fs/promises';
import {
    trackPatchMisses,
    OBSOLETE_MISS_THRESHOLD,
    _missFilePathForTests,
} from '@/features/eds/services/patches/patchMissTracker';
import {
    createPatchReport,
    addContentResult,
    addReferenceResult,
} from '@/features/eds/services/patches/patchReportHelper';
import type { PatchReport } from '@/features/eds/services/patches/patchReportHelper';
import type { Logger } from '@/types/logger';
import { createMockLogger } from '../../../../helpers/loggerFake';

// Fail-safe nonexistent default (the jest.mock('os') house rule): a missed
// override must not read or write the real ~/.demo-builder.
jest.mock('os', () => ({
    ...jest.requireActual('os'),
    homedir: jest.fn(() => '/nonexistent-home-for-patch-miss-tests'),
}));

const logger = createMockLogger() as unknown as Logger;

let dir: string;

beforeEach(async () => {
    jest.clearAllMocks();
    dir = await fsPromises.mkdtemp(path.join(jest.requireActual('os').tmpdir(), 'patch-miss-'));
    (os.homedir as jest.Mock).mockReturnValue(dir);
});

afterEach(async () => {
    await fsPromises.rm(dir, { recursive: true, force: true });
});

function reportWith(entries: Array<{ id: string; applied: boolean }>) {
    const report = createPatchReport();
    for (const e of entries) {
        addContentResult(report, {
            patchId: e.id,
            pagePath: '/page',
            applied: e.applied,
            ...(e.applied ? {} : { reason: 'precondition not found' }),
        });
    }
    return report;
}

describe('trackPatchMisses', () => {
    it('counts consecutive misses across calls and resets on apply', async () => {
        const miss = reportWith([{ id: 'p1', applied: false }]);

        expect(await trackPatchMisses(miss, logger)).toEqual({ p1: 1 });
        expect(await trackPatchMisses(miss, logger)).toEqual({ p1: 2 });

        const hit = reportWith([{ id: 'p1', applied: true }]);
        expect(await trackPatchMisses(hit, logger)).toEqual({});

        expect(await trackPatchMisses(miss, logger)).toEqual({ p1: 1 });
    });

    it('persists across "sessions" (a fresh read of the same file)', async () => {
        const miss = reportWith([{ id: 'p2', applied: false }]);
        await trackPatchMisses(miss, logger);
        const onDisk = JSON.parse(
            await fsPromises.readFile(_missFilePathForTests(), 'utf-8')
        );
        expect(onDisk.p2.misses).toBe(1);
    });

    it('fails open: an unwritable store returns counts of 1 and never throws', async () => {
        (os.homedir as jest.Mock).mockReturnValue('/nonexistent-home-for-patch-miss-tests');
        const miss = reportWith([{ id: 'p3', applied: false }]);

        await expect(trackPatchMisses(miss, logger)).resolves.toEqual({ p3: 1 });
    });

    it('an unapplied reference result is not counted as a miss', async () => {
        // A `reference` entry is a content-completeness gap — a page the copy
        // could not find — not a patch whose precondition stopped matching.
        // Counting it would escalate an unrelated failure to "retire this
        // patch from the ledger".
        const report = createPatchReport();
        addReferenceResult(report, '/customer/nav', 'not in source');

        await expect(trackPatchMisses(report, logger)).resolves.toStrictEqual({});
    });

    it('an APPLIED reference result does not reset a patch id\'s miss count', async () => {
        // The reset loop skips `reference` entries before it looks at
        // `applied`, so a reference that shares an id with a real patch cannot
        // zero that patch's count.
        const miss = reportWith([{ id: 'p4', applied: false }]);
        await trackPatchMisses(miss, logger);
        await trackPatchMisses(miss, logger);

        const mixed: PatchReport = createPatchReport();
        mixed.results.push({ kind: 'reference', patchId: 'p4', target: 'p4', applied: true });
        addContentResult(mixed, {
            patchId: 'p4',
            pagePath: '/page',
            applied: false,
            reason: 'precondition not found',
        });

        await expect(trackPatchMisses(mixed, logger)).resolves.toStrictEqual({ p4: 3 });
    });

    it.each([
        ['null', 'null'],
        ['a bare JSON string', '"not-an-object"'],
    ])('a store holding %s counts from zero instead of throwing', async (_label, raw) => {
        // The store is whatever is on disk; a hand-edited or truncated file can
        // parse to something that is not a Record. Anything but an object is
        // discarded — indexing it would throw out of a fail-open path.
        await fsPromises.mkdir(path.dirname(_missFilePathForTests()), { recursive: true });
        await fsPromises.writeFile(_missFilePathForTests(), raw);

        const miss = reportWith([{ id: 'p5', applied: false }]);
        await expect(trackPatchMisses(miss, logger)).resolves.toStrictEqual({ p5: 1 });
    });

    it('exposes the threshold the toast escalates at', () => {
        expect(OBSOLETE_MISS_THRESHOLD).toBeGreaterThanOrEqual(2);
    });
});
