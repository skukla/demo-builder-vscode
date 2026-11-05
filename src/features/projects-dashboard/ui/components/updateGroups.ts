/**
 * The Updates modal's rows under their headings (PL-80): Demo Builder, each project, the
 * template repositories. Shared by the list the SC ticks and the run that follows it.
 *
 * @module features/projects-dashboard/ui/components/updateGroups
 */

import type { PendingUpdateKind, PendingUpdateRow } from '@/types/pendingUpdates';

/** One heading and its rows. */
export interface RowGroup {
    key: string;
    title: string;
    rows: PendingUpdateRow[];
}

/**
 * The kinds whose apply commits to the storefront repository, which the live site serves. The
 * Inspector SDK row is not one: its apply only records the new version.
 */
const LIVE_SITE_KINDS: ReadonlySet<PendingUpdateKind> = new Set<PendingUpdateKind>([
    'template',
    'boilerplate',
    'finish',
    'blockLibrary',
    'blockLibraryInstall',
]);

/** Whether any of these rows, once applied, reaches the live site: the window says so once. */
export function updatesLiveSite(rows: PendingUpdateRow[]): boolean {
    return rows.some((row) => LIVE_SITE_KINDS.has(row.kind));
}

/** The rows under each heading, headings in the order they first appear. */
export function groupsOf(rows: PendingUpdateRow[]): RowGroup[] {
    const groups = new Map<string, RowGroup>();
    for (const row of rows) {
        const group = groups.get(row.group.key) ?? { ...row.group, rows: [] };
        group.rows.push(row);
        groups.set(row.group.key, group);
    }
    return [...groups.values()];
}
