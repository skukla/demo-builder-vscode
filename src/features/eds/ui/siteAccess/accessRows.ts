/**
 * The Site access view as ONE list: each person once, with everything they hold.
 *
 * The host answers two lists (configuration admins, content readers) because they
 * live in two systems. The SC thinks in people ("who has access, and to what"), so
 * the screen merges them here. Pure: view in, rows out.
 *
 * @module features/eds/ui/siteAccess/accessRows
 */

import type { ChangeType } from './useSiteAccess';
import type { SiteAccessList, SiteAccessView } from '@/types/webviewPayloads';

/** One thing that can be taken away from a person, from their row's menu. */
export interface AccessRemoval {
    type: Extract<ChangeType, 'removeSiteAdmin' | 'removeContentReader'>;
    /** The menu item: "Remove configuration admin". */
    label: string;
    /** The confirmation's sentence ending: "...will no longer be a configuration admin." */
    consequence: string;
}

export interface AccessRow {
    email: string;
    /** What they hold, in words, in list order: ["Configuration admin", "Reads content"]. */
    roles: string[];
    removals: AccessRemoval[];
}

const ADMIN_REMOVAL: AccessRemoval = {
    type: 'removeSiteAdmin',
    label: 'Remove configuration admin',
    consequence: 'be a configuration admin',
};

const READER_REMOVAL: AccessRemoval = {
    type: 'removeContentReader',
    label: 'Remove content access',
    consequence: "be able to read this storefront's content",
};

function addList(
    rows: Map<string, AccessRow>,
    list: SiteAccessList | undefined,
    removal: AccessRemoval,
): void {
    for (const person of list?.people ?? []) {
        const key = person.email.toLowerCase();
        const row = rows.get(key) ?? { email: person.email, roles: [], removals: [] };
        row.roles.push(person.role);
        if (person.removable && list?.canManage) row.removals.push(removal);
        rows.set(key, row);
    }
}

/** Every person in the view, once, admins' order first. */
export function accessRowsOf(view: SiteAccessView | null): AccessRow[] {
    const rows = new Map<string, AccessRow>();
    addList(rows, view?.admins, ADMIN_REMOVAL);
    addList(rows, view?.readers, READER_REMOVAL);
    return [...rows.values()];
}

/** What the Give access dialog can offer: only what this identity may change. */
export interface GrantChoices {
    admin: boolean;
    read: boolean;
}

export function grantChoicesOf(view: SiteAccessView | null): GrantChoices {
    return { admin: Boolean(view?.admins?.canManage), read: Boolean(view?.readers?.canManage) };
}
