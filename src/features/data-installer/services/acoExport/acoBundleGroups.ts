/**
 * A Commerce bundle's options as ACO bundle groups, the Data Installer service's mapping
 * (`acoBundleProductsExport.js` L72-122; `.rptc/research/datapack-engine/aco-export-spec.md` §3).
 *
 * @module features/data-installer/services/acoExport/acoBundleGroups
 */

import { isOn, slugOfLabel } from './acoRowParts';
import type { AcoBundleGroup, CommerceBundleOption, CommerceCatalogProduct } from '@/types/acoPack';

type BundleLink = NonNullable<CommerceBundleOption['product_links']>[number];

/** A selection's SKU: its own, else the product its id names in this store view (L48-65). */
function skuOf(link: BundleLink, skuById: ReadonlyMap<string, string>): string | undefined {
    const own = (link.sku ?? '').trim();
    if (own) return own;
    return link.id === undefined ? undefined : skuById.get(String(link.id));
}

/** A quantity, 1 when missing, not a number or not above zero (L93-94). */
function quantityOf(raw: BundleLink['qty']): number {
    const qty = raw === undefined || raw === null ? 1 : Number(raw);
    return Number.isNaN(qty) || qty <= 0 ? 1 : qty;
}

/** One option's group, or undefined when none of its selections can be named. */
function groupOf(
    option: CommerceBundleOption,
    skuById: ReadonlyMap<string, string>,
): AcoBundleGroup | undefined {
    const items: AcoBundleGroup['items'] = [];
    const defaults: string[] = [];
    for (const link of option.product_links ?? []) {
        const sku = skuOf(link, skuById);
        if (!sku) continue;
        items.push({
            sku,
            qty: quantityOf(link.qty),
            userDefinedQty: isOn(link.can_change_quantity),
        });
        if (isOn(link.is_default)) defaults.push(sku);
    }
    if (items.length === 0) return undefined;
    const type = (option.type ?? 'select').toLowerCase();
    return {
        group: slugOfLabel((option.title ?? '').trim() || 'option'),
        required: isOn(option.required),
        multiSelect: type === 'multi' || type === 'checkbox',
        items,
        ...(defaults.length > 0 ? { defaultItemSkus: defaults } : {}),
    };
}

/** The bundle's groups, by option position; an option with no selection is left out. */
export function bundleGroups(
    bundle: CommerceCatalogProduct,
    skuById: ReadonlyMap<string, string>,
): AcoBundleGroup[] {
    const options = [...(bundle.extension_attributes?.bundle_product_options ?? [])].sort(
        (a, b) => Number(a.position ?? 0) - Number(b.position ?? 0),
    );
    return options
        .map((option) => groupOf(option, skuById))
        .filter((group): group is AcoBundleGroup => group !== undefined);
}
