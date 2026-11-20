/**
 * The comparison a re-import's form just made, kept for the run that follows (owner, 2026-11-08,
 * walk F74). The form compares the store with the pack (`previewChanges`, about a minute on Luma)
 * to show each data type's changes; the run then compared again as its first step, the same read
 * (`planRepeat`) a minute later. Now the run takes the form's plans when they still describe what
 * it would read:
 *
 * - the same project, pack version, website and store view;
 * - the install record exactly as it was (any run, save or settled send in between changes it);
 * - each data type's rows exactly as compared, placed the same way (`placeCategories`);
 * - made at most `CACHE_TTL.MEDIUM` ago, kept in the house cache entry (`core/cache`, walk F82).
 *
 * Anything else, and the run reads again. A comparison is taken once: a second run reads again.
 * The run then does exactly what the form showed; an edit made in the Admin in those few minutes is
 * not seen, which is the cost of the window, and why it is short.
 *
 * Kept in memory only: a window reload forgets it, and the run reads again.
 *
 * @module features/data-installer/services/demoBuilderEngine/recentComparison
 */

import { createHash } from 'crypto';
import type { CreatedObject, TargetCodes } from './installRecord';
import type { KindPlan } from './repeatInstall';
import type { EarlierPlans } from './runPack';
import { READABLE_KINDS, packKindIn } from './storeCopies';
import { type CacheEntry, createCacheEntry, isExpired } from '@/core/cache/cacheUtils';
import { CACHE_TTL } from '@/core/utils/timeoutConfig';
import type { DatapackId } from '@/types/datapack';

/** Where a comparison was made: the project, the pack version and the store view. */
export interface ComparisonPlace {
    projectPath: string;
    pack: DatapackId;
    target: TargetCodes;
}

interface Kept {
    at: number;
    record: string;
    plans: { plan: KindPlan; rows: string }[];
}

const kept = new Map<string, CacheEntry<Kept>>();

const hashOf = (value: unknown): string =>
    createHash('sha256')
        .update(JSON.stringify(value) ?? '')
        .digest('hex');

const slotOf = ({ projectPath, pack, target }: ComparisonPlace): string =>
    JSON.stringify([projectPath, pack.name, pack.version, target.websiteCode, target.storeCode]);

/** Keep a comparison for the run that may follow. */
export function rememberComparison(
    place: ComparisonPlace,
    created: readonly CreatedObject[],
    items: Record<string, unknown>,
    plans: readonly KindPlan[],
): void {
    const comparison: Kept = {
        at: Date.now(),
        record: hashOf(created),
        plans: plans.map((plan) => ({ plan, rows: hashOf(items[plan.packKind]) })),
    };
    kept.set(slotOf(place), createCacheEntry(comparison, CACHE_TTL.MEDIUM));
}

/**
 * The kept plans for the kinds `items` installs, when they still hold (see the module comment);
 * undefined means read again. The kept comparison is gone afterwards either way.
 */
export function takeComparison(
    place: ComparisonPlace,
    created: readonly CreatedObject[],
    items: Record<string, unknown>,
): { plans: KindPlan[]; ageMs: number } | undefined {
    const slot = slotOf(place);
    const cached = kept.get(slot);
    kept.delete(slot);
    if (!cached || isExpired(cached) || cached.value.record !== hashOf(created)) return undefined;
    const entry = cached.value;
    const rowHashes = new Map<string, string>();
    const plans: KindPlan[] = [];
    // The kinds and order `planRepeat` would give for these items.
    for (const kind of READABLE_KINDS) {
        const packKind = packKindIn(kind, items);
        if (!(packKind in items)) continue;
        if (!rowHashes.has(packKind)) rowHashes.set(packKind, hashOf(items[packKind]));
        const match = entry.plans.find(
            (e) =>
                e.plan.kind === kind &&
                e.plan.packKind === packKind &&
                e.rows === rowHashes.get(packKind),
        );
        if (!match) return undefined;
        plans.push(match.plan);
    }
    return { plans, ageMs: Date.now() - entry.at };
}

/**
 * The run's use of the comparison its form made, for `installPack`, logged either way so Debug
 * Logs say whether the store was read again.
 */
export function reuseComparison(deps: { projectPath: string; log: (line: string) => void }, pack: DatapackId, target: TargetCodes): EarlierPlans {
    return (created, items) => {
        const taken = takeComparison({ projectPath: deps.projectPath, pack, target }, created, items);
        const said = taken ? `using the comparison made ${Math.round(taken.ageMs / 1000)} s ago` : 'comparing the store with the datapack';
        deps.log(`[Data Installer] Demo Builder engine: ${pack.name}@${pack.version}: ${said}`);
        return taken?.plans;
    };
}

/** Forget every kept comparison (tests). */
export function forgetComparisons(): void {
    kept.clear();
}
