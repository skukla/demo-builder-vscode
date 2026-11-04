/**
 * Whether the demo's pack has something newer than what the demo installed (owner, 2026-11-03,
 * `.rptc/plans/datapack-save-as/`): another version of the same pack made later, or the very
 * version installed changed in the library since (team packs are updated in place as `main`).
 *
 * Passive by design: the demo's card marks it, and taking it is the SC's choice. It never counts
 * as an update elsewhere, since a demo may stay on an older version on purpose.
 *
 * @module features/data-installer/ui/components/projectPackNewer
 */

import type { DatapackGroup } from '../../services/datapackCatalog';
import type { DatapackSummary } from '../../types';
import type { DatapackId } from '@/types/datapack';

/** What is newer: which version to open, and when it changed. */
export interface NewerVersion {
    id: DatapackId;
    at: string;
}

const timeOf = (iso: string | undefined): number => (iso ? Date.parse(iso) || 0 : 0);
const madeAt = (summary: DatapackSummary): string | undefined => summary.updatedAt ?? summary.createdAt;

/**
 * @param group - the demo's pack, every version the library lists
 * @param held - the version the demo uses
 * @param installedAt - when Demo Builder installed it, when it did
 */
export function newerVersionOf(group: DatapackGroup | undefined, held: DatapackId | undefined, installedAt: string | undefined): NewerVersion | undefined {
    if (!group || !held) return undefined;
    const own = group.versions.find((version) => version.id.version === held.version);
    const ownAt = timeOf(own ? (own.createdAt ?? madeAt(own)) : undefined);
    const later = group.versions
        .filter((version) => version.id.version !== held.version && timeOf(madeAt(version)) > ownAt)
        .sort((a, b) => timeOf(madeAt(b)) - timeOf(madeAt(a)))[0];
    if (later && ownAt > 0) return { id: later.id, at: madeAt(later) ?? '' };
    const changed = own?.updatedAt;
    if (own && changed && installedAt && timeOf(changed) > timeOf(installedAt)) return { id: own.id, at: changed };
    return undefined;
}

/** "Nov 3": the day, as the card shows it. */
export function shortDate(iso: string): string {
    const at = new Date(iso);
    return Number.isNaN(at.getTime()) ? '' : at.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
