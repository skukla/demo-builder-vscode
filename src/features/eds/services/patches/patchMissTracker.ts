/**
 * Consecutive-miss tracking for patches — the content-patch drift signal.
 *
 * The LKG drift gate verifies CODE ledgers against clonable canonical repos
 * and retires patches whose fixes land upstream. Content patches have no
 * such gate: they target DA.live-authored pages CI can never read, so an
 * obsolete content patch's only symptom is "didn't apply" on every single
 * create/reset — which is exactly how two of them sat undetected until a
 * user read the toast (2026-08-23, `phones-heading-reorder` +
 * `smart-watches-category-id-accs`; the source had absorbed both fixes).
 *
 * This module turns that toast into data: a JSON file under
 * `~/.demo-builder` counts consecutive misses per patch id, resetting the
 * moment a patch applies again (a transient content hiccup must not
 * accumulate). At {@link OBSOLETE_MISS_THRESHOLD} the patch report
 * escalates its copy to "likely obsolete — retire it from the ledger".
 *
 * Every failure mode is FAIL-OPEN: a broken counter must never break a
 * create/reset. An unreadable store counts from zero; an unwritable store
 * still returns this run's counts (as 1) and logs at debug.
 *
 * @module features/eds/services/patches/patchMissTracker
 */

import * as fsPromises from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
// Type-only import, deliberately: the helper imports trackPatchMisses back,
// so a value edge here would be a runtime cycle. The unapplied filter is
// inlined below for the same reason.
import type { PatchReport } from './patchReportHelper';
import type { Logger } from '@/types/logger';

/** Consecutive misses at which the report calls a patch likely obsolete. */
export const OBSOLETE_MISS_THRESHOLD = 3;

interface MissEntry {
    misses: number;
    lastSeen: string;
}

function missFilePath(): string {
    return path.join(os.homedir(), '.demo-builder', 'patch-miss-counts.json');
}

/** Test-only: the resolved store path (homedir is mocked in the suite). */
export function _missFilePathForTests(): string {
    return missFilePath();
}

async function readStore(logger: Logger): Promise<Record<string, MissEntry>> {
    try {
        const raw = await fsPromises.readFile(missFilePath(), 'utf-8');
        const parsed = JSON.parse(raw) as Record<string, MissEntry>;
        return parsed && typeof parsed === 'object' ? parsed : {};
    } catch (error) {
        logger.debug(
            `[Patch] miss store unreadable (counting from zero): ${(error as Error).message}`,
        );
        return {};
    }
}

/**
 * Update the miss counts from one create/reset's patch report.
 *
 * Applied patches reset (their entry is deleted); unapplied PATCHES (the
 * `reference` kind is a copy failure, not a precondition mismatch — it does
 * not count) increment. Returns this run's miss count per unapplied id, for
 * the report copy to escalate on.
 *
 * @param report - the run's unified patch report
 * @param logger - failures land at debug; this function never throws
 */
export async function trackPatchMisses(
    report: PatchReport,
    logger: Logger,
): Promise<Record<string, number>> {
    const store = await readStore(logger);
    const now = new Date().toISOString();

    for (const result of report.results) {
        if (result.kind === 'reference') continue;
        if (result.applied) {
            delete store[result.patchId];
        }
    }

    const counts: Record<string, number> = {};
    for (const item of report.results.filter(r => !r.applied)) {
        if (item.kind === 'reference') continue;
        const misses = (store[item.patchId]?.misses ?? 0) + 1;
        store[item.patchId] = { misses, lastSeen: now };
        counts[item.patchId] = misses;
    }

    try {
        await fsPromises.mkdir(path.dirname(missFilePath()), { recursive: true });
        await fsPromises.writeFile(missFilePath(), JSON.stringify(store, null, 2));
    } catch (error) {
        logger.debug(
            `[Patch] miss store unwritable (counts not persisted): ${(error as Error).message}`,
        );
    }

    return counts;
}
