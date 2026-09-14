/**
 * businessStructureFit — does the connected backend have the business
 * structure the chosen demo's storefront expects?
 *
 * The expected codes are the demo card's configDefaults (a shipped package's,
 * or the codes Add a demo read from a colleague's storefront). The backend's
 * structure is what Business Structure discovered. A code the backend lacks is
 * a storefront pointed at a website, store or store view that does not exist
 * there (owner, 2026-09-14: alert the SC on this step, where the structure is
 * known).
 *
 * Compared by code only: the pickers below let the SC choose any combination,
 * so parentage is not this check's question.
 *
 * @module features/project-creation/ui/components/businessStructureFit
 */

import {
    ACCS_STORE_CODE,
    ACCS_STORE_VIEW_CODE,
    ACCS_WEBSITE_CODE,
    PAAS_STORE_CODE,
    PAAS_STORE_VIEW_CODE,
    PAAS_WEBSITE_CODE,
} from '@/core/config/envVarKeys';
import type { CommerceStoreStructure } from '@/types/commerceStore';

/** One level of the structure: its words, the two keys that can carry it, and where to look. */
const LEVELS: ReadonlyArray<{
    noun: string;
    keys: readonly [string, string];
    codes: (structure: CommerceStoreStructure) => Array<{ code: string }>;
}> = [
    { noun: 'website', keys: [ACCS_WEBSITE_CODE, PAAS_WEBSITE_CODE], codes: (s) => s.websites },
    { noun: 'store', keys: [ACCS_STORE_CODE, PAAS_STORE_CODE], codes: (s) => s.storeGroups },
    { noun: 'store view', keys: [ACCS_STORE_VIEW_CODE, PAAS_STORE_VIEW_CODE], codes: (s) => s.storeViews },
];

/**
 * Name each expected code the backend does not have, website first.
 *
 * @param expected - the demo card's configDefaults
 * @param structure - the discovered structure; absent means there is nothing to compare against
 * @returns e.g. `['website adobe', 'store view usaistore']`, or an empty list
 */
export function missingStructure(
    expected: Record<string, string> | undefined,
    structure: CommerceStoreStructure | undefined,
): string[] {
    if (!expected || !structure) return [];
    const missing: string[] = [];
    for (const level of LEVELS) {
        const code = expected[level.keys[0]] || expected[level.keys[1]];
        if (code && !level.codes(structure).some((entry) => entry.code === code)) {
            missing.push(`${level.noun} ${code}`);
        }
    }
    return missing;
}
