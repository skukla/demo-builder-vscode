/**
 * Which products an ERP owns, as the "Add another ERP" dialog, the `addErp` handler, the
 * `add_erp` tool and the ERP integration all say it (AB-64). The integration keeps it on the
 * ERP's list entry as `structure_owns` plus the one key its mode reads
 * (`structure_owns_websites`, `structure_owns_attribute`).
 *
 * The "by inventory source" mode was deleted on 2026-10-09 (owner, AB-70): a product stocked
 * in two named sources was owned by two ERPs and nothing resolved it, and per website tells
 * every story it could.
 *
 * Shared between the extension and the webviews, so it imports nothing.
 *
 * @module types/erpOwnership
 */

/** The ways an ERP can own products (the integration's `structure_owns`). */
export type ErpOwnsMode = 'all' | 'websites' | 'attribute';

/** One ERP's ownership rule: the mode and the one list or attribute it reads. */
export interface ErpOwnsRule {
    mode: ErpOwnsMode;
    /** Commerce website codes, for `websites`. */
    websites?: string[];
    /** `code=value`, for `attribute`, e.g. `erp_owner=accuform`. */
    attribute?: string;
}

/** One ERP's rule by its list id: as read beside the new one's, and as saved when the add narrows it (AB-72). */
export interface ErpOwnsEntry {
    /** The ERP's id in the integration's list (`erp_owner` takes this value). */
    erp: string;
    owns: ErpOwnsRule;
}

/** One product as the dialog counts it: only what the ownership predicate reads. */
export interface ErpOwnedProductRow {
    sku: string;
    websiteCodes: string[];
    /** The attributes any ERP's rule names (`erp_owner` always), by code. */
    attributes: Record<string, string>;
}

/** What the dialog needs before an add: the store's websites, its products, and each ERP's rule. */
export interface ErpOwnershipOptions {
    websites: Array<{ code: string; name: string }>;
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

/** One ERP as it will stand once the new one is added (AB-75). */
export interface ErpAddPreviewRow {
    /** The list id. */
    erp: string;
    name: string;
    /** The products it will own, across every ERP's rule. */
    count: number;
    /** Its rule in words, as it stands beside the others. */
    describe: string;
    /** Up to three of its SKUs. */
    examples: string[];
    /** The ERP being added. */
    isNew: boolean;
    /** Its rule is narrowed by the add (a catch-all beside a new website rule, AB-72). */
    narrowed: boolean;
}

/** What every ERP will own once the new one is added: what the dialog and `add_erp` preview. */
export interface ErpAddPreview {
    erps: ErpAddPreviewRow[];
    /** Products no ERP will own. */
    nobody: { count: number; examples: string[] };
    /** Products two or more rules will both claim; their orders are refused. */
    overlap: { count: number; examples: string[] };
}
