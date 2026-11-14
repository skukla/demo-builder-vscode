/**
 * Where a datapack comes from, in one place for the Show list on the screen and `find_datapacks`
 * for agents (step-07 P1): both name the same four sources.
 *
 * @module features/data-installer/packSource
 */

import type { DatapackStoreName } from '@/types/datapack';

/** Where a pack comes from, as an SC would say it. */
export type PackSource = 'yours' | 'team' | 'installer' | 'community';

/** What a pack's row or group says about where it lives. A row with no store is the Data Installer's. */
export interface PackOrigin {
    store?: DatapackStoreName;
    mine?: boolean;
    team?: boolean;
}

/**
 * Where a pack comes from. Team (Demo Builder's) before Yours (owner, 2026-11-03): a team pack is
 * the store's, whoever uploaded it. Every Data Installer pack is the Data Installer's, curated or
 * not (owner, 2026-11-05: its uncurated packs read as mislabelled under Community); Community is
 * colleagues'.
 *
 * @param origin - the pack's store and marks
 * @returns its source
 */
export function packSource(origin: PackOrigin): PackSource {
    if (origin.store === 'library') {
        if (origin.team) return 'team';
        return origin.mine ? 'yours' : 'community';
    }
    return 'installer';
}
