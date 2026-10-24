/**
 * Whether a storefront is behind how Demo Builder builds storefronts now, and so should be
 * reset (owner, 2026-10-23).
 *
 * `STOREFRONT_CHANGES` lists every change to how Demo Builder builds a storefront that an
 * existing storefront does not pick up by itself: only a reset (or creating it again) gives it
 * one. A change it gets from Republish, or from an update, is not listed. Entries are never
 * removed; each says when it was made and how that is known.
 *
 * When a storefront was built is the stamp creation and reset write on its metadata
 * (`storefrontBuiltThrough`): the newest change the building version of Demo Builder knew,
 * not the calendar date, so a storefront built by an older version still reads as behind the
 * changes that version never had. A build whose own fixes did not all land
 * (`bringStorefrontUpToDate` not current) is also marked incomplete. A project made before the
 * stamp existed falls back to its creation date; with neither, it is older than every change.
 *
 * Pure: no GitHub read, no `vscode`. The projects list computes it for every card, the
 * dashboard and `get_project_status` through `buildStatusPayload`, Diagnostics and the
 * get_storefront_report tool through `readStorefrontReport`.
 *
 * No date is ever shown to the SC (owner): only {@link NEEDS_RESET_LABEL} and
 * {@link NEEDS_RESET_LINE}.
 *
 * @module features/eds/services/storefront/storefrontChanges
 */

import { COMPONENT_IDS } from '@/core/constants';
import type { Project } from '@/types/base';

/** One change to how Demo Builder builds a storefront that only a reset brings to an older one. */
export interface StorefrontChange {
    id: string;
    /** When the change was made, `YYYY-MM-DD`. */
    since: string;
    /** What changed, in one plain line. Internal: logs and tests, never the SC's status. */
    what: string;
    /** How the date, and the need for a reset, are known: a commit, a CHANGELOG line. */
    evidence: string;
}

/** The status pill. */
export const NEEDS_RESET_LABEL = 'Needs reset';

/** The status's one-line explanation, wherever the status is shown. */
export const NEEDS_RESET_LINE =
    "Demo Builder has fixes this storefront doesn't have yet.";

/** Every change, oldest first. */
export const STOREFRONT_CHANGES: readonly StorefrontChange[] = [
    {
        id: 'binary-files-intact',
        since: '2026-09-15',
        what: 'Creation and reset write images, fonts and executable scripts as exact bytes.',
        evidence:
            'Commit d33bb1481 (2026-09-15). CHANGELOG 1.0.0-beta.148: "Repositories reset before this ' +
            'still hold the corrupted files until their next reset."',
    },
    {
        id: 'pdp-sku-in-the-page',
        since: '2026-10-06',
        what: 'Product links use the address the publishing service writes; the retired _HH encoding is taken out.',
        evidence:
            'Commit 833c1857b (2026-10-06, ADR-024). CHANGELOG Unreleased: "Existing storefronts get ' +
            'direct links after a storefront reset." The retired-patches repair undoes the old code at reset.',
    },
    {
        id: 'not-found-import-map',
        since: '2026-10-15',
        what: "The 404 page's import map carries every dropin head.html loads.",
        evidence: 'Commit e9e76c948 (2026-10-15, EDS-45): "Existing storefronts get it on Reset."',
    },
    {
        id: 'checkout-labels',
        since: '2026-10-22',
        what: "Creation and reset keep the B2B template's checkout labels instead of Demo Builder's stub.",
        evidence:
            'CHANGELOG Unreleased, Fixed: "Creation and reset now keep the template\'s labels. A storefront ' +
            'made before this is repaired by its next reset" (or a template or Adobe boilerplate update).',
    },
    {
        id: 'known-patches',
        since: '2026-10-23',
        what: "Creation and reset put every live patch in the shipped ledgers into any storefront's code it fits.",
        evidence:
            'Commit c75b52793 (2026-10-23, EDS-64). Measured on JustRite the same day: 4 of the 6 fit and were ' +
            'missing, and only the build step (creation, reset) applies them.',
    },
];

const BUILT_THROUGH = 'storefrontBuiltThrough';
const INCOMPLETE = 'storefrontBuildIncomplete';

function storefrontMetadataOf(project: Project): Record<string, unknown> | undefined {
    const instance = project.componentInstances?.[COMPONENT_IDS.EDS_STOREFRONT];
    return instance ? (instance.metadata ?? {}) : undefined;
}

/** `YYYY-MM-DD` of a date held as a Date or as the string a loaded project file has. */
function dayOf(value: unknown): string | undefined {
    if (!(value instanceof Date) && typeof value !== 'string') return undefined;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? undefined : date.toISOString().slice(0, 10);
}

/** The newest change a list knows; empty when it knows none. */
function newestChange(changes: readonly StorefrontChange[]): string {
    return changes.reduce((newest, change) => (change.since > newest ? change.since : newest), '');
}

/**
 * Whether the storefront should be reset to catch up with how Demo Builder builds storefronts.
 *
 * @param project - the project; false when it has no storefront
 * @param changes - the list; the shipped one by default
 */
export function storefrontNeedsReset(
    project: Project,
    changes: readonly StorefrontChange[] = STOREFRONT_CHANGES,
): boolean {
    const metadata = storefrontMetadataOf(project);
    if (!metadata || changes.length === 0) return false;
    if (metadata[INCOMPLETE] === true) return true;
    const stamp = typeof metadata[BUILT_THROUGH] === 'string' ? (metadata[BUILT_THROUGH] as string) : undefined;
    const builtOn = stamp ?? dayOf(project.created);
    if (builtOn === undefined) return true;
    return changes.some((change) => change.since > builtOn);
}

/**
 * Record that creation or reset has just built the storefront (the caller saves the project).
 *
 * @param project - the project, changed in place; one with no storefront is left alone
 * @param complete - whether the build step's own fixes all landed (`bringStorefrontUpToDate`)
 * @param changes - the list; the shipped one by default
 */
export function recordStorefrontBuilt(
    project: Project,
    complete: boolean,
    changes: readonly StorefrontChange[] = STOREFRONT_CHANGES,
): void {
    const instance = project.componentInstances?.[COMPONENT_IDS.EDS_STOREFRONT];
    if (!instance) return;
    const metadata: Record<string, unknown> = { ...(instance.metadata ?? {}), [BUILT_THROUGH]: newestChange(changes) };
    if (complete) delete metadata[INCOMPLETE];
    else metadata[INCOMPLETE] = true;
    instance.metadata = metadata;
}
