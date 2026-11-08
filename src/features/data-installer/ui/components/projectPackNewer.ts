/**
 * Whether the demo's pack has something newer than what the demo installed (owner, 2026-11-03,
 * `.rptc/plans/datapack-save-as/`): a later SAVE of the same pack, or the very version installed
 * changed in the library since (team packs are updated in place as `main`).
 *
 * A pack's versions are of two kinds (owner, 2026-11-07). A save makes a dated version, one after
 * another, so a later one replaces what came before. A named version (`main`, `eds-compatible`) is
 * a variant beside the others, changed on its own: one made later is not newer, and flagging it
 * marked Luma's `eds-compatible` for an unrelated `import-form`. Each version's last change shows
 * under its name in the card's picker instead (`versionChanged`).
 *
 * Passive by design: the demo's card marks it, and taking it is the SC's choice. It never counts
 * as an update elsewhere, since a demo may stay on an older version on purpose.
 *
 * @module features/data-installer/ui/components/projectPackNewer
 */

import { isSavedVersion } from '../../packVersions';
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
        .filter((version) => isSavedVersion(version.id.version) && version.id.version !== held.version && timeOf(madeAt(version)) > ownAt)
        .sort((a, b) => timeOf(madeAt(b)) - timeOf(madeAt(a)))[0];
    if (later && ownAt > 0) return { id: later.id, at: madeAt(later) ?? '' };
    const changed = own?.updatedAt;
    if (own && changed && installedAt && timeOf(changed) > timeOf(installedAt)) return { id: own.id, at: changed };
    return undefined;
}

/**
 * What the card's amber dot says on hover (owner, 2026-11-07): "Updated Nov 6" when the version this
 * demo installed changed since (import it again), "Newer version available" when a later save of the
 * pack is in the version list. "Updated" is the version list's own word for a change.
 */
export function newerLabel(newer: NewerVersion, held: DatapackId): string {
    return newer.id.version === held.version ? `Updated ${shortDate(newer.at)}` : 'Newer version available';
}

/** A version's last change, under its name in the picker: "Updated Nov 6". */
export function versionChanged(summary: DatapackSummary): string | undefined {
    const at = madeAt(summary);
    const day = at ? shortDate(at) : '';
    return day ? `Updated ${day}` : undefined;
}

/** "Nov 3": the day, as the card shows it. */
export function shortDate(iso: string): string {
    const at = new Date(iso);
    return Number.isNaN(at.getTime()) ? '' : at.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
