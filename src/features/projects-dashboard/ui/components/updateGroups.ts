/**
 * The Updates modal's rows under their headings (PL-80): Demo Builder, each project, the
 * template repositories. Shared by the list the SC ticks and the run that follows it.
 *
 * @module features/projects-dashboard/ui/components/updateGroups
 */

import type { PendingUpdateRow } from '@/types/pendingUpdates';

/** One heading and its rows. */
export interface RowGroup {
    key: string;
    title: string;
    rows: PendingUpdateRow[];
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
