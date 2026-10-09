/**
 * Assigning products to an ERP (AB-74): the SC picks products in Commerce by category, by
 * `brand`, by SKU prefix or by a pasted SKU list, and Demo Builder writes
 * `erp_owner=<the ERP's value>` on them through Commerce's asynchronous bulk API, then runs
 * the ownership pass so each ERP holds what it now owns. Plus the attribute-set half: a value
 * for an attribute that is not in the product's attribute set is dropped by Commerce with a
 * 200, so `erp_owner` must be in every set the store's products use.
 *
 * Shared between the extension and the webviews, so it imports nothing.
 *
 * @module types/erpAssign
 */

/** Which products an assignment covers. One way at a time, as the modal offers them. */
export type ErpProductSelection =
    | { by: 'category'; categoryId: number }
    | { by: 'brand'; brand: string }
    | { by: 'skuPrefix'; prefix: string }
    | { by: 'skus'; skus: string[] };

/** One choice the modal's pickers offer, with how many products it covers. */
export interface ErpAssignChoice {
    /** The category id as a string, or the brand value. */
    value: string;
    label: string;
    count: number;
}

/** An attribute set some of the store's products use that has no `erp_owner`. */
export interface AttributeSetWithoutOwner {
    id: number;
    name: string;
    /** How many of the store's products use it. */
    products: number;
}

/** One product as the assignment's selection and preview read it. */
export interface ErpAssignProduct {
    sku: string;
    attributeSetId: number;
    categoryIds: string[];
    /** The brand as the SC reads it: a dropdown's option label, else the stored value. */
    brand?: string;
    /** Its `erp_owner` now; the empty string when it has none. */
    owner: string;
}

/** What the "Assign products" modal opens with. */
export interface ErpAssignOptions {
    erp: { id: string; name: string; listId: string };
    /**
     * The `erp_owner` value an assignment writes: the value in the ERP's own rule. Absent when
     * its rule is not `erp_owner=<value>`, and then `refusal` says why nothing can be written.
     */
    ownerValue?: string;
    refusal?: string;
    categories: ErpAssignChoice[];
    brands: ErpAssignChoice[];
    /** The sets missing `erp_owner`: their products cannot be written until it is added. */
    setsWithoutOwner: AttributeSetWithoutOwner[];
    /** When the last assignment to this ERP was made, if one can be undone. */
    lastAssignmentAt?: string;
    /** The store's enabled products, so the modal previews as the SC picks, with no round trip. */
    products: ErpAssignProduct[];
    /** Who owns each SKU today, by list id, across every ERP's rule (`ownersAcross`). */
    owners: Record<string, string[]>;
    /** Each ERP's name, by list id. */
    names: Record<string, string>;
}

/** What an assignment would do, before anything is written. */
export interface ErpAssignPreview {
    erp: { id: string; name: string; listId: string };
    /** The products the selection matches. */
    matched: number;
    /** The ones that would be written (matched, not already tagged, in a set that has erp_owner). */
    toWrite: number;
    /** A few of those, so the SC can recognise them. */
    examples: string[];
    /** Already carrying this ERP's value: nothing to write. */
    alreadyTagged: number;
    /** Products another ERP owns today that this assignment moves, by that ERP's name. */
    movedFrom: Array<{ name: string; count: number }>;
    /** Matched products whose attribute set has no `erp_owner`: not written. */
    outsideSets: { count: number; sets: AttributeSetWithoutOwner[] };
    /** Pasted SKUs Commerce has no enabled product for. */
    unknownSkus: string[];
}

/** How one Commerce bulk operation ended, once followed. */
export interface CommerceBulkOutcome {
    uuid: string;
    total: number;
    complete: number;
    /** Operations Commerce refused, with its words, by the index of the request in the call. */
    failed: Array<{ index: number; message: string }>;
    /** Still open (status 4) when the follow gave up. */
    open: number;
    /** The follow stopped at its deadline with operations still open. */
    timedOut: boolean;
}

/**
 * What an assignment recorded so it can be undone: each product's `erp_owner` BEFORE the
 * write, the empty string for a product that had none. Kept on the ERP's component record
 * until the next assignment replaces it, the undo runs, or the ERP is removed.
 */
export interface ErpAssignmentRecord {
    /** ISO date string of the write. */
    at: string;
    /** The value written. */
    value: string;
    previous: Array<{ sku: string; value: string }>;
}

/**
 * The attribute sets Demo Builder added `erp_owner` to, so the addition can be undone. Kept
 * on the ERP integration's component record until the undo runs or the integration is removed.
 */
export interface ErpOwnerSetsRecord {
    /** ISO date string of the addition. */
    at: string;
    sets: Array<{ id: number; name: string }>;
}

/** What `getErpAssignOptions` answers (Pattern B: a refusal is `success: false`). */
export type ErpAssignOptionsResult =
    | { success: true; data: ErpAssignOptions }
    | { success: false; error?: string; code?: string };

/** What `assignErpProducts` answers without `confirm` (Pattern B). */
export type ErpAssignPreviewResult =
    | { success: true; data: { preview: ErpAssignPreview; confirmed: false } }
    | { success: false; error?: string; code?: string };
