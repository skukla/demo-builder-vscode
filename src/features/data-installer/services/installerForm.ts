/**
 * A pack in the form the Data Installer takes, before it is copied or loaded there (owner,
 * 2026-11-06: packs an SC makes are meant to reach the Data Installer).
 *
 * The Data Installer checks every data item against its own schema when it is written, and a pack
 * there is never replaced, so one item it refuses would leave half a pack in the shared catalog.
 * So the whole pack is put in its form, or refused, before anything is sent. What it takes was
 * found by checking all 14 packs in Demo Builder's store against the service's schemas on
 * 2026-11-06 (125 items): three things differed, and the third is `itemParts.ts`'s.
 *
 * - A gift card names its attribute set ("Gift Card"); the Data Installer takes only a number. A
 *   set's number differs between stores, except the Default set's, 4 on a standard Commerce store,
 *   which holds every gift card attribute (read on the test store the same day). So a gift card
 *   goes in the Default set (owner's choice, 2026-11-06), and the result says so.
 * - An import-form item's `allowed_error_count` written as text; the Data Installer takes a number.
 * - An item over its 1 MB request limit: refused before any write by the writer (`itemParts.ts`).
 *
 * A data type the Data Installer has no schema for is refused before any write too: store settings
 * travel in a settings layer, a pack of their own in Demo Builder's store.
 *
 * @module features/data-installer/services/installerForm
 */

import type { DatapackFile } from './datapackZip';

/** The data types the Data Installer takes: one schema each (its `config/schemas`, read 2026-11-06). */
const INSTALLER_KINDS = new Set([
    'attribute_assign_to_set',
    'attribute_sets',
    'b2b_companies',
    'b2b_shared_catalog_categories',
    'b2b_shared_catalog_company_assignments',
    'b2b_shared_catalog_products',
    'b2b_shared_catalogs',
    'cart_rules',
    'categories',
    'coupons',
    'customer_groups',
    'customers',
    'customers_export',
    'giftcards',
    'product_attribute_swatches',
    'product_attributes',
    'product_export',
    'products',
    'source_items',
    'sources',
    'stock_source_links',
    'stocks',
    'aco_categories',
    'aco_metadata',
    'aco_price_books',
    'aco_prices',
    'aco_products',
    'aco_product_layers',
]);

/** The Default attribute set's number on a standard Commerce store. */
export const DEFAULT_ATTRIBUTE_SET_ID = 4;

/** Why a pack cannot go to the Data Installer: nothing was sent. */
export class InstallerFormError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'InstallerFormError';
    }
}

/** The pack as the Data Installer takes it, and each change made, in words. */
export interface InstallerForm {
    pack: DatapackFile;
    changes: string[];
}

type Row = Record<string, unknown>;

/** Gift cards with their attribute set as the Default set's number, and how many changed. */
function giftCardsInDefaultSet(records: unknown): { records: unknown; moved: number } {
    if (!Array.isArray(records)) return { records, moved: 0 };
    let moved = 0;
    const rows = records.map((row: unknown) => {
        const product = (row as { product?: Row } | null)?.product;
        if (!product || typeof product.attribute_set_id === 'number') return row;
        moved += 1;
        return {
            ...(row as Row),
            product: { ...product, attribute_set_id: DEFAULT_ATTRIBUTE_SET_ID },
        };
    });
    return { records: rows, moved };
}

/** An import body with its error count as a number, and whether it changed. */
function errorCountAsNumber(records: unknown): { records: unknown; changed: boolean } {
    const source = (records as { source?: Row } | null)?.source;
    const count = source?.allowed_error_count;
    if (typeof count !== 'string' || count.trim() === '' || !Number.isFinite(Number(count)))
        return { records, changed: false };
    return {
        records: { ...(records as Row), source: { ...source, allowed_error_count: Number(count) } },
        changed: true,
    };
}

/**
 * The pack in the Data Installer's form.
 *
 * @throws InstallerFormError naming each data type the Data Installer has no schema for
 */
export function toInstallerForm(pack: DatapackFile): InstallerForm {
    const unknown = pack.items
        .map((item) => item.dataType)
        .filter((kind) => !INSTALLER_KINDS.has(kind));
    if (unknown.length > 0) {
        throw new InstallerFormError(
            `The Data Installer takes no ${unknown.join(', ')} data, so nothing was sent. ` +
                "Store settings travel in a settings layer, kept in Demo Builder's datapack store.",
        );
    }
    const changes: string[] = [];
    const items = pack.items.map((item) => {
        if (item.dataType === 'giftcards') {
            const { records, moved } = giftCardsInDefaultSet(item.records);
            if (moved > 0) {
                changes.push(
                    `${moved === 1 ? '1 gift card goes' : `${moved} gift cards go`} in the Default attribute set: the Data Installer takes a set by its number, and only the Default set's is the same on every store.`,
                );
            }
            return { ...item, records };
        }
        if (item.dataType === 'product_export') {
            const { records, changed } = errorCountAsNumber(item.records);
            if (changed)
                changes.push(
                    "The product import's allowed error count goes as a number, as the Data Installer takes it.",
                );
            return { ...item, records };
        }
        return item;
    });
    return { pack: { ...pack, items }, changes };
}
