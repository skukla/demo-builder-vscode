/**
 * Whether the version the demo installed changed in the library since (owner, 2026-11-03,
 * `.rptc/plans/datapack-save-as/`): team packs are updated in place as `main`.
 *
 * A pack's versions are of two kinds (owner, 2026-11-07). A named version (`main`,
 * `eds-compatible`) is a variant beside the others, changed on its own: one made later is not newer,
 * and flagging it marked Luma's `eds-compatible` for an unrelated `import-form`. Each version's last
 * change shows under its name in the card's picker instead (`versionChanged`).
 *
 * A save is written once and never changes, and a pack's saves are one thing on the card, not
 * versions beside each other (owner, 2026-11-09, walk F99): the card shows the save in use, and the
 * SC never manages the others (Phase 2). So a later save is never "newer": the dot only says that a named
 * version changed since this demo installed it.
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
    if (!group || !held || isSavedVersion(held.version)) return undefined;
    const own = group.versions.find((version) => version.id.version === held.version);
    const changed = own?.updatedAt;
    if (own && changed && installedAt && timeOf(changed) > timeOf(installedAt)) return { id: own.id, at: changed };
    return undefined;
}

/** What the card's amber dot says on hover, short, with when (walk F88): "Updated on Nov 9". */
export function newerLabel(newer: NewerVersion): string {
    return `Updated on ${shortDate(newer.at)}`;
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
