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
    return previewOver(products, rules, input, added);
}

/**
 * What every ERP owns now, before anything is added: the dialog shows this until a name is
 * typed, rather than counting for an ERP that has no name yet (owner, 2026-10-18: an empty
 * name previewed "The new ERP" owning the products tagged `erp`).
 */
export function previewAsItStands(products: readonly ErpOwnedProductRow[], input: ErpAddPreviewInput): ErpAddPreview {
    return previewOver(products, input.erps, input);
}

/** The rows for a set of rules: each ERP's count and examples, nobody, and the overlap. */
function previewOver(
    products: readonly ErpOwnedProductRow[],
    rules: readonly ErpOwnsEntry[],
    input: ErpAddPreviewInput,
    added?: ErpOwnsEntry & { name: string },
): ErpAddPreview {
    const owners = ownersAcross(products, rules);
    const skusOf = (pick: (claimed: string[]) => boolean): string[] =>
        [...owners].filter(([, claimed]) => pick(claimed)).map(([sku]) => sku);
    const names = new Map(input.erps.map((erp) => [erp.erp, erp.name] as const));
    if (added) names.set(added.erp, added.name);
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
            isNew: rule.erp === added?.erp,
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

/** One line of the dialog's table: who, how many, and what that means. */
export interface PreviewLine {
    who: string;
    count: string;
    says: string;
    /**
     * An ERP already added that owns nothing yet and is given products by hand: the dialog
     * offers Assign products on its line (owner, 2026-10-19).
     */
    assignable?: boolean;
}

/**
 * What a rule means, in the words of the button an SC presses (Assign products), never the
 * attribute code (owner, 2026-10-18: "tagged" and `erp_owner` confused). An ERP on another
 * ERP's tag, or any other attribute, keeps its exact words, so an odd setup stays visible.
 */
function plainRule(entry: ErpOwnsEntry, row: { count: number; isNew: boolean }, websiteName: (code: string) => string): string {
    const { owns } = entry;
    if (owns.mode === 'all') return 'All products not assigned to another ERP';
    if (owns.mode === 'websites') {
        const sites = (owns.websites ?? []).map(websiteName);
        return sites.length ? `Products sold on ${sites.join(', ')}` : 'Products sold on the websites you choose';
    }
    if (owns.attribute !== `erp_owner=${entry.erp}`) {
        const exact = describeOwnsAcross(owns);
        return `${exact.charAt(0).toUpperCase()}${exact.slice(1)}`;
    }
    if (row.count > 0) return 'Products assigned to it';
    // An ERP already added carries an Assign products button on its line, which says the rest.
    return row.isNew ? 'None yet: assign products to it after adding' : 'None yet.';
}

/**
 * The preview as the dialog's table: one line per ERP, then nobody and the overlap when there
 * are any. The shared preview keeps the exact rules and the example SKUs for the agent.
 *
 * @param rules - the rule each row's ERP will have (`rulesAfterAdd`, or the ERPs as they stand)
 * @param websites - the store's websites, so a website rule names them
 */
export function previewLines(
    preview: ErpAddPreview,
    rules: readonly ErpOwnsEntry[],
    websites: ReadonlyArray<{ code: string; name: string }>,
): PreviewLine[] {
    const ruleOf = new Map(rules.map((rule) => [rule.erp, rule]));
    const websiteName = (code: string) => websites.find((site) => site.code === code)?.name ?? code;
    const lines: PreviewLine[] = preview.erps.map((row) => {
        const rule = ruleOf.get(row.erp) ?? { erp: row.erp, owns: { mode: 'all' as const } };
        const changes = row.narrowed ? ' (changes when this ERP is added)' : '';
        const line: PreviewLine = { who: row.name, count: productCount(row.count), says: `${plainRule(rule, row, websiteName)}${changes}` };
        if (!row.isNew && row.count === 0 && rule.owns.mode === 'attribute' && rule.owns.attribute === `erp_owner=${rule.erp}`) {
            line.assignable = true;
        }
        return line;
    });
    if (preview.nobody.count > 0) {
        lines.push({ who: 'Nobody', count: productCount(preview.nobody.count), says: 'Products no ERP owns' });
    }
    if (preview.overlap.count > 0) {
        lines.push({
            who: 'Two ERPs',
            count: productCount(preview.overlap.count),
            says: 'Their orders are refused until a rule changes',
        });
    }
    return lines;
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
