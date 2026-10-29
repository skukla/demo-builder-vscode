/**
 * Why an undo that takes `erp_owner` out of attribute sets will not run while products
 * carry a value: Commerce would drop each one without a word. Shared by the demo setup's
 * attributes step (`erpAttributesFix`) and the agent's `remove_erp_owner_from_attribute_sets`
 * (`erpOwnerSetsHandlers`), which said it two ways, neither naming the ERP.
 *
 * @module features/app-builder/services/erpTaggedRefusal
 */

import { erpListIdFor } from './erpListId';
import { andList } from '@/core/utils/andList';

/** The ERP an erp_owner value names, by the name it was slugged from; the value itself when none matches (a rename). */
function erpNamed(owner: string, erpNames: readonly string[]): string {
    return erpNames.find((name) => erpListIdFor(name, []) === owner) ?? owner;
}

/**
 * Why the undo will not run, naming the ERPs (release test row 4.14, 2026-10-28: "their ERP"
 * left the SC to guess which). "11 products are assigned to Accuform ERP. Undo Accuform ERP's
 * last product assignment first, or the undo would clear them."
 */
export function taggedRefusal(owners: string[], erpNames: readonly string[]): string {
    const counts = new Map<string, number>();
    for (const owner of owners) counts.set(owner, (counts.get(owner) ?? 0) + 1);
    const named = [...counts].map(([owner, count]) => ({ name: erpNamed(owner, erpNames), count }));
    const products = owners.length === 1 ? '1 product is' : `${owners.length} products are`;
    if (named.length === 1) {
        const [{ name }] = named;
        return `${products} assigned to ${name}. Undo ${name}'s last product assignment first, or the undo would clear them.`;
    }
    const list = andList(named.map(({ name, count }) => `${name} (${count})`));
    return `${products} assigned to ${list}. Undo each ERP's last product assignment first, or the undo would clear them.`;
}
