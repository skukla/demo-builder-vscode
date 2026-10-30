/**
 * The Commerce reads an ACO pack is made from (`.rptc/research/datapack-engine/aco-export-spec.md`
 * §2), over the project's own signed client: store-wide for the lists, through one store view
 * (its `Store` header) for categories and products, as the service reads them. Each read is made
 * once per export and shared, where the service repeated some.
 *
 * @module features/data-installer/services/acoExport/acoStoreReads
 */

import { readAllPages } from '@/features/app-builder/services/erpFillReaders';
import type {
    CommerceAttributeOption,
    CommerceAttributeRow,
    CommerceCatalogProduct,
    CommerceCategoryRow,
    CommerceCustomerGroupRow,
    CommerceStoreConfigRow,
} from '@/types/acoPack';
import type { CommerceStoreView } from '@/types/commerceStore';
import type { CommerceGet } from '@/types/commerceWire';

/** The project's Commerce GET: store-wide when no store view is named, else through that one. */
export type AcoCommerce = (storeView?: string) => Promise<CommerceGet | { refusal: string }>;

/** An export that cannot go ahead, in words an SC can act on. */
export class AcoExportError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'AcoExportError';
    }
}

/** Only user-defined attributes, as the service asks (`export_exclusions_aco.json` L6-13). */
const USER_DEFINED =
    '&searchCriteria[filterGroups][0][filters][0][field]=is_user_defined&searchCriteria[filterGroups][0][filters][0][value]=1';

/** The product kinds that need a second read when the list leaves their graph out (R7). */
function lacksGraph(product: CommerceCatalogProduct): boolean {
    const ext = product.extension_attributes ?? {};
    if (product.type_id === 'configurable')
        return !ext.configurable_product_options?.length || !ext.configurable_product_links?.length;
    if (product.type_id === 'bundle')
        return !(ext.bundle_product_options ?? []).some((o) => (o.product_links ?? []).length > 0);
    return false;
}

/**
 * The list row completed from the product's own read: its graph and custom attributes from the
 * detail, the list's SKU and type kept (`acoConfigurableProductsEnrich.js` L12-82).
 */
export function withDetail(
    row: CommerceCatalogProduct,
    detail: CommerceCatalogProduct,
): CommerceCatalogProduct {
    const own = row.extension_attributes ?? {};
    const more = detail.extension_attributes ?? {};
    const byCode = new Map(
        [...(row.custom_attributes ?? []), ...(detail.custom_attributes ?? [])].map((a) => [
            a.attribute_code,
            a,
        ]),
    );
    return {
        ...row,
        ...detail,
        sku: row.sku,
        type_id: row.type_id ?? detail.type_id,
        extension_attributes: {
            ...own,
            ...more,
            configurable_product_options:
                more.configurable_product_options ?? own.configurable_product_options,
            configurable_product_links:
                more.configurable_product_links ?? own.configurable_product_links,
            bundle_product_options: more.bundle_product_options ?? own.bundle_product_options,
        },
        ...(detail.custom_attributes ? { custom_attributes: [...byCode.values()] } : {}),
    };
}

/** Every read an export makes, each once. */
export class AcoStoreReads {
    private readonly views = new Map<string, Promise<CommerceGet>>();
    private readonly cache = new Map<string, Promise<unknown>>();

    constructor(
        private readonly commerce: AcoCommerce,
        private readonly log: (line: string) => void,
    ) {}

    private once<T>(key: string, read: () => Promise<T>): Promise<T> {
        if (!this.cache.has(key)) this.cache.set(key, read());
        return this.cache.get(key) as Promise<T>;
    }

    /** The client through one store view, or store-wide; a refusal stops the export. */
    private client(storeView?: string): Promise<CommerceGet> {
        const key = storeView ?? '';
        if (!this.views.has(key)) {
            this.views.set(
                key,
                this.commerce(storeView).then((answer) => {
                    if (typeof answer !== 'function') throw new AcoExportError(answer.refusal);
                    return answer;
                }),
            );
        }
        return this.views.get(key) as Promise<CommerceGet>;
    }

    private async list<T>(
        key: string,
        path: string,
        criteria = '',
        storeView?: string,
    ): Promise<T[]> {
        return this.once(`${key}@${storeView ?? ''}`, async () =>
            readAllPages<T>(await this.client(storeView), path, criteria),
        );
    }

    private async bare<T>(path: string): Promise<T[]> {
        return this.once(path, async () => ((await (await this.client())(path)) ?? []) as T[]);
    }

    /** R1: every store view but Admin. */
    async storeViews(): Promise<CommerceStoreView[]> {
        return (await this.bare<CommerceStoreView>('store/storeViews')).filter(
            (view) => Number(view.id) !== 0 && (view.code ?? '').trim() !== '',
        );
    }

    /** R2: the user-defined attributes, what `aco_metadata` describes. */
    userAttributes(): Promise<CommerceAttributeRow[]> {
        return this.list('user-attributes', 'products/attributes', USER_DEFINED);
    }

    /** R4: every attribute, for naming a configurable's choices. */
    allAttributes(): Promise<CommerceAttributeRow[]> {
        return this.list('attributes', 'products/attributes');
    }

    /** R3 and R5: every category, as this store view names them. */
    categories(storeView: string): Promise<CommerceCategoryRow[]> {
        return this.list('categories', 'categories/list', '', storeView);
    }

    /** R6 and R13: every product through this store view, configurables and bundles completed (R7). */
    products(storeView: string): Promise<CommerceCatalogProduct[]> {
        return this.once(`products@${storeView}`, async () => {
            const get = await this.client(storeView);
            const rows = await readAllPages<CommerceCatalogProduct>(get, 'products');
            // One at a time, as the service reads them: a store of many configurables would
            // otherwise send them all at once.
            const out: CommerceCatalogProduct[] = [];
            for (const row of rows)
                out.push(lacksGraph(row) ? await this.completed(get, row, storeView) : row);
            return out;
        });
    }

    /** A configurable or bundle completed from its own read; kept as listed when that read fails. */
    private async completed(
        get: CommerceGet,
        row: CommerceCatalogProduct,
        storeView: string,
    ): Promise<CommerceCatalogProduct> {
        try {
            return withDetail(
                row,
                (await get(
                    `products/${encodeURIComponent(row.sku.trim())}`,
                )) as CommerceCatalogProduct,
            );
        } catch (error) {
            this.log(
                `aco export: could not read ${row.sku} through ${storeView}, kept as listed: ${error instanceof Error ? error.message : String(error)}`,
            );
            return row;
        }
    }

    /** R8: a super attribute's options; none when the read fails, so its labels stay ids. */
    async options(code: string): Promise<CommerceAttributeOption[]> {
        return this.once(`options@${code}`, async () => {
            try {
                return ((await (
                    await this.client()
                )(`products/attributes/${encodeURIComponent(code)}/options`)) ??
                    []) as CommerceAttributeOption[];
            } catch (error) {
                this.log(
                    `aco export: could not read the options of ${code}, its labels stay ids: ${error instanceof Error ? error.message : String(error)}`,
                );
                return [];
            }
        });
    }

    /** R9: every website but Admin. */
    async websites(): Promise<Array<{ id: number; code: string; name: string }>> {
        const sites = await this.bare<{ id: number | string; code: string; name: string }>(
            'store/websites',
        );
        return sites
            .filter((site) => Number(site.id) !== 0)
            .map((site) => ({ id: Number(site.id), code: site.code, name: site.name }));
    }

    /** R10: every customer group. */
    customerGroups(): Promise<CommerceCustomerGroupRow[]> {
        return this.list('groups', 'customerGroups/search');
    }

    /** In place of R12: each store view's display currency. */
    storeConfigs(): Promise<CommerceStoreConfigRow[]> {
        return this.bare('store/storeConfigs');
    }
}
