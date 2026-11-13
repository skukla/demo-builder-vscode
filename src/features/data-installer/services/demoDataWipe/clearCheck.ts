/**
 * The check's answer (`ClearCheck`, datapack-simplification step 06): what a plan removes and keeps,
 * one row and one full record list per data type, each record under its own type (J1-5: a catalog's
 * customer group counts under Customer Groups, a company's members under Customers). Kept records
 * carry no reason (J1-3b). Already-closed orders and protected settings are not listed; orders left
 * open with a note (payment review) go to the clearing's result, not here.
 *
 * Removed is what the plan writes, and nothing else: what any install record lists, this project's
 * included, is kept out of the plan (`readWipeClaims`). Step 06's C3 adds this project's records back,
 * together with the datapack removal that takes them first.
 *
 * A type a read failed for is marked by `classifyTransience`'s kind (P6-Q3): slow is the problem to
 * retry, and the clearing waits; refused and strange are left alone.
 *
 * @module features/data-installer/services/demoDataWipe/clearCheck
 */

import { dataTypeLabel } from '../../ui/dataTypeLabel';
import { ATTRIBUTE_SET_KIND } from '../demoBuilderEngine/attributeSetsKind';
import { ATTRIBUTE_KIND } from '../demoBuilderEngine/attributesKind';
import {
    CATALOG_KIND,
    COMPANY_KIND,
    CUSTOMER_GROUP_KIND,
    CUSTOMER_KIND,
} from '../demoBuilderEngine/b2bKeys';
import { CART_RULE_KIND } from '../demoBuilderEngine/cartRulesKind';
import { PRODUCT_KIND } from '../demoBuilderEngine/productKinds';
import type { WipeCategory } from './wipeReads';
import type { WipeScope } from './wipeScope';
import { classifyTransience } from '@/core/errors';
import type { TreeListNode } from '@/core/ui/components/ui/TreeList';
import { andList } from '@/core/utils/andList';
import { CommerceReadError } from '@/features/app-builder/services/erpFillReaders';
import type { ClearCheck, ClearRecords, ClearUnread } from '@/types/demoDataWipe';

export const WEBSITE_SETTINGS = 'website_settings';
export const ORDERS = 'orders';
export const RETURNS = 'returns';

/** The summary's order (the J1 prototype's), each type by the code its records name it by. */
const TYPE_ORDER: readonly string[] = [
    PRODUCT_KIND,
    'categories',
    CUSTOMER_KIND,
    COMPANY_KIND,
    CATALOG_KIND,
    CART_RULE_KIND,
    CUSTOMER_GROUP_KIND,
    ATTRIBUTE_SET_KIND,
    ATTRIBUTE_KIND,
    WEBSITE_SETTINGS,
    ORDERS,
    RETURNS,
];

/** What deciding the check is handed. */
export interface CheckInputs {
    scope: WipeScope;
    /** Each type's records, as the plan decided them. */
    planned: Record<string, ClearRecords>;
    /** The types a read failed for, with the first failure. */
    failures: ReadonlyMap<string, unknown>;
}

/** Statuses that mean Commerce turned the read away, or has the route switched off: Open Commerce Admin. */
const REFUSED_STATUSES: ReadonlySet<number> = new Set([401, 403, 404]);

/**
 * P6-Q3's kinds, from `classifyTransience`; and, before it, a status Commerce answered, which says
 * "refused" where `classifyTransience`'s words do not ("Commerce answered 403 ..."). Kept here, not in
 * `classifyTransience`: its other callers decide retry and sign-in, where a 404 means something else.
 */
function unreadKind(error: unknown): ClearUnread {
    if (error instanceof CommerceReadError && error.status !== undefined && REFUSED_STATUSES.has(error.status)) return 'refused';
    const { kind, retryable } = classifyTransience(error);
    if (retryable) return 'slow';
    return kind === 'auth' ? 'refused' : 'strange';
}

function happensOf(type: string, count: number, unread: ClearUnread | undefined): string {
    if (unread) return "Couldn't be read";
    const digits = count.toLocaleString('en-US');
    if (type === ORDERS || type === RETURNS) return `${digits} closed`;
    return type === WEBSITE_SETTINGS
        ? `${digits} set back to the default value`
        : `${digits} removed`;
}

const orderOf = (type: string): number =>
    TYPE_ORDER.includes(type) ? TYPE_ORDER.indexOf(type) : TYPE_ORDER.length;

/** The answer, without the project, the token, the warning and the datapack, which the plan and the handler add. */
export function checkOf(inputs: CheckInputs): Omit<ClearCheck, 'project' | 'token' | 'warning' | 'datapack'> {
    const records = inputs.planned;
    const unread: Record<string, ClearUnread> = {};
    for (const [type, error] of inputs.failures) unread[type] = unreadKind(error);
    const types = [...new Set([...Object.keys(records), ...Object.keys(unread)])].sort(
        (a, b) => orderOf(a) - orderOf(b),
    );
    const shown = types.filter(
        (t) =>
            unread[t] || (records[t]?.removed.length ?? 0) > 0 || (records[t]?.kept.length ?? 0) > 0,
    );
    const rows = shown.map((type) => {
        const count = unread[type] ? 0 : (records[type]?.removed.length ?? 0);
        return {
            type,
            label: dataTypeLabel(type),
            count,
            happens: happensOf(type, count, unread[type]),
        };
    });
    const slow = shown.filter((t) => unread[t] === 'slow');
    return {
        websites: inputs.scope.websites,
        rows,
        records: Object.fromEntries(shown.map((t) => [t, records[t] ?? { removed: [], kept: [] }])),
        ...(Object.keys(unread).length > 0 ? { unread } : {}),
        total: rows.reduce((sum, row) => sum + row.count, 0),
        ...(slow.length > 0
            ? { problem: `Commerce didn't answer for ${andList(slow.map(dataTypeLabel))}.` }
            : {}),
    };
}

/** The categories going as a tree, in the store's order, each under the one above it when that goes too. */
export function categoryTree(
    tree: readonly WipeCategory[],
    remove: readonly WipeCategory[],
): TreeListNode[] {
    const going = new Set(remove.map((c) => String(c.id)));
    const nodes = new Map<string, TreeListNode>();
    const roots: TreeListNode[] = [];
    for (const category of tree.filter((c) => going.has(String(c.id)))) {
        const node: TreeListNode = {
            name: category.name ?? String(category.id),
            id: String(category.id),
        };
        nodes.set(String(category.id), node);
        const parentId = (category.path ?? '').split('/').filter(Boolean).slice(-2, -1)[0];
        const parent = parentId === undefined ? undefined : nodes.get(parentId);
        if (parent) (parent.children ??= []).push(node);
        else roots.push(node);
    }
    return roots;
}
