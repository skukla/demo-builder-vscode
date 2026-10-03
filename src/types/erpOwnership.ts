/**
 * Which products an ERP owns, as the "Add another ERP" dialog, the `addErp` handler, the
 * `add_erp` tool and the ERP integration all say it (AB-64). The integration keeps it on the
 * ERP's list entry as `structure_owns` plus the one key its mode reads
 * (`structure_owns_websites`, `structure_owns_attribute`, `structure_owns_sources`).
 *
 * Shared between the extension and the webviews, so it imports nothing.
 *
 * @module types/erpOwnership
 */

/** The ways an ERP can own products (the integration's `structure_owns`). */
export type ErpOwnsMode = 'all' | 'websites' | 'attribute' | 'sources';

/** One ERP's ownership rule: the mode and the one list or attribute it reads. */
export interface ErpOwnsRule {
    mode: ErpOwnsMode;
    /** Commerce website codes, for `websites`. */
    websites?: string[];
    /** Inventory source codes, for `sources`. */
    sources?: string[];
    /** `code=value`, for `attribute`, e.g. `erp_owner=accuform`. */
    attribute?: string;
}

/** An existing ERP's rule, to show beside the new one's and to change when it still owns everything. */
export interface ErpOwnsEntry {
    /** The ERP's id in the integration's list (`erp_owner` takes this value). */
    erp: string;
    owns: ErpOwnsRule;
}

/** One product as the dialog counts it: only what the ownership predicate reads. */
export interface ErpOwnedProductRow {
    sku: string;
    websiteCodes: string[];
    sourceCodes: string[];
    /** The attributes any ERP's rule names (`erp_owner` always), by code. */
    attributes: Record<string, string>;
}

/** What the dialog needs before an add: the store's websites and sources, its products, and each ERP's rule. */
export interface ErpOwnershipOptions {
    websites: Array<{ code: string; name: string }>;
    sources: Array<{ code: string; name: string }>;
    products: ErpOwnedProductRow[];
    /** The ERPs the integration serves now, with the rule each holds. */
    erps: Array<ErpOwnsEntry & { name: string }>;
    /** The list ids the project's ERPs carry, so the new ERP's can be derived from its name. */
    takenListIds: string[];
}

/** What `getErpOwnershipOptions` answers (Pattern B: a refusal is `success: false`). */
export type ErpOwnershipOptionsResult =
    | { success: true; data: ErpOwnershipOptions }
    | { success: false; error?: string; code?: string };
