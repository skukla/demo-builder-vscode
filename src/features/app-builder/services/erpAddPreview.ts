/**
 * What every ERP will own once a new one is added (AB-75): the preview "Add another ERP" shows
 * and `add_erp` answers without `confirm`. Worked out with the one resolver every reader uses
 * (`ownersAcross`), over the rules as the add will leave them (`rulesAfterAdd`, which applies
 * the one narrowing the precedence needs), so the preview is what the add delivers: the
 * catch-all keeps what no product rule claims, and a product two rules claim is counted as an
 * overlap.
 *
 * Pure and vscode-free: the dialog imports it as well as the handler.
 *
 * @module features/app-builder/services/erpAddPreview
 */

import { describeOwnsAcross, ownersAcross, rulesAfterAdd, type OwnsDefaultInput } from './erpOwnership';
import type { ErpAddPreview, ErpOwnedProductRow, ErpOwnsEntry, ErpOwnsRule } from '@/types/erpOwnership';

/** How many SKUs each line shows. */
const EXAMPLES = 3;

/** The ERPs beside the new one, with their names (what the store read answers). */
export interface ErpAddPreviewInput extends OwnsDefaultInput {
    erps: ReadonlyArray<ErpOwnsEntry & { name: string }>;
}

/**
 * Preview the add.
 *
 * @param products - the store's products, as the ownership resolver reads them
 * @param input - the store's websites and each existing ERP's rule and name
 * @param added - the new ERP: its list id, its name and the rule it is given
 * @returns one row per ERP (the new one last), what nobody owns, and what two rules claim
 */
export function previewErpAdd(
    products: readonly ErpOwnedProductRow[],
    input: ErpAddPreviewInput,
    added: ErpOwnsEntry & { name: string },
): ErpAddPreview {
    const rules = rulesAfterAdd(input, { erp: added.erp, owns: added.owns });
    const owners = ownersAcross(products, rules);
    const skusOf = (pick: (claimed: string[]) => boolean): string[] =>
        [...owners].filter(([, claimed]) => pick(claimed)).map(([sku]) => sku);
    const names = new Map([...input.erps.map((erp) => [erp.erp, erp.name] as const), [added.erp, added.name] as const]);
    const before = new Map(input.erps.map((erp) => [erp.erp, erp.owns]));
    const erps = rules.map((rule) => {
        const owned = skusOf((claimed) => claimed.includes(rule.erp));
        const previous = before.get(rule.erp);
        return {
            erp: rule.erp,
            name: names.get(rule.erp) ?? rule.erp,
            count: owned.length,
            describe: describeOwnsAcross(rule.owns),
            examples: owned.slice(0, EXAMPLES),
            isNew: rule.erp === added.erp,
            narrowed: previous !== undefined && JSON.stringify(previous) !== JSON.stringify(rule.owns),
        };
    });
    const nobody = skusOf((claimed) => claimed.length === 0);
    const overlap = skusOf((claimed) => claimed.length > 1);
    return {
        erps,
        nobody: { count: nobody.length, examples: nobody.slice(0, EXAMPLES) },
        overlap: { count: overlap.length, examples: overlap.slice(0, EXAMPLES) },
    };
}

/** "1 product" or "12 products". */
export function productCount(count: number): string {
    return count === 1 ? '1 product' : `${count} products`;
}

/**
 * The preview in sentences, one idea each, for the dialog and the agent alike. An ERP that will
 * own nothing by `erp_owner` is told where to go next (AB-74's Assign products).
 */
export function previewSentences(preview: ErpAddPreview): Array<{ line: string; detail?: string; examples?: string }> {
    const sentences: Array<{ line: string; detail?: string; examples?: string }> = [];
    const examples = (skus: string[]) => (skus.length ? `For example: ${skus.join(', ')}.` : undefined);
    for (const erp of preview.erps) {
        const detail = `${erp.describe.charAt(0).toUpperCase()}${erp.describe.slice(1)}.`;
        const changed = erp.narrowed ? ' Its rule changes to this when the ERP is added.' : '';
        sentences.push({ line: `${erp.name}: ${productCount(erp.count)}.`, detail: `${detail}${changed}`, examples: examples(erp.examples) });
    }
    if (preview.nobody.count > 0) {
        sentences.push({ line: `Nobody: ${productCount(preview.nobody.count)}.`, examples: examples(preview.nobody.examples) });
    }
    if (preview.overlap.count > 0) {
        sentences.push({
            line: `Claimed by two ERPs: ${productCount(preview.overlap.count)}.`,
            detail: 'Orders for them are refused until one rule changes.',
            examples: examples(preview.overlap.examples),
        });
    }
    return sentences;
}

/**
 * What to do next when the new ERP will own nothing, or undefined. By `erp_owner` that is
 * Assign products on its card after adding (AB-74); by any other rule, the rule itself.
 */
export function ownsNothingNext(preview: ErpAddPreview, rule: ErpOwnsRule): string | undefined {
    const added = preview.erps.find((erp) => erp.isNew);
    if (!added || added.count > 0) return undefined;
    const byOwnerTag = rule.mode === 'attribute' && (rule.attribute ?? '').startsWith('erp_owner=');
    if (byOwnerTag) return `${added.name} will own no products yet. After adding, use Assign products on its card.`;
    return `${added.name} will own no products yet. No product in the store matches its rule.`;
}
