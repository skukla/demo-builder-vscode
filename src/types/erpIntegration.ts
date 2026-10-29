/**
 * What the ERP integration's actions answer, as Demo Builder reads them: `erp/status`,
 * `erp/detach`, `erp/prices`, `erp/lookup` and `erp/history`. The shapes are the
 * integration's contract (commerce-erp-integration, `actions/erp/<action>/index.js`), read on
 * the dates each notes. Called through `ErpIntegrationClient`.
 *
 * @module types/erpIntegration
 */

/** What `erp/status` answers (the integration's `actions/erp/status`). */
export interface ErpIntegrationStatus {
    app: { id: string; version: string };
    erp: {
        reachable: boolean;
        ok?: boolean;
        status?: number;
        error?: string;
        [key: string]: unknown;
    };
    erpBaseUrl: string | null;
    ledger: { entries: number };
    /** Whether `erp/detach` closes off the ERPs' orders when asked (`closeOrders`, AB-16n). */
    closesOrdersOnReset?: boolean;
    /** Whether `erp/detach` records each run for `GET erp/detach?run=` to read back (AB-61). */
    detachRuns?: boolean;
    /** Whether `erp/prices` records each run for `GET erp/prices?run=` to read back. */
    priceRuns?: boolean;
}

/**
 * What `erp/detach` answers: the company writes undone and the ERP order numbers cleared, and
 * `closed`, present only when it closed off the orders the ERPs hold (AB-16n): orders
 * cancelled, orders only noted (invoiced or shipped), orders an earlier reset closed, parts
 * records removed, and each order it could not close, in words.
 */
export interface ErpDetachReport {
    reverted?: { reverted: number; failed: unknown[] };
    orders?: { cleared: number; failed: unknown[] };
    closed?: {
        cancelled: number;
        commented: number;
        alreadyClosed: number;
        partsRemoved: number;
        failed: Array<{ orderId: string; error: string }>;
    };
}

/**
 * What `erp/prices` answers (the integration's `actions/erp/prices/index.js`, read 2026-09-28):
 * the ERPs it published for and the tier prices written, removed (no longer in force) and left
 * as they were, across every company. A company it could not price is `skipped` with the
 * reason (no shared catalog, say); one whose write failed is in `failed`.
 */
export interface ErpPricesReport {
    erps: string[];
    written: number;
    removed: number;
    unchanged: number;
    skipped: Array<{ erpId: string; partnerId: string; reason: string }>;
    failed: Array<{ erpId: string; partnerId?: string; error: string }>;
}

/**
 * What `erp/lookup` answers (the integration's `lib/lookup.js`, `productLookup` and
 * `companyLookup`): one entity as both systems hold it, one row per field. A side
 * that does not have it answers `null` cells; that is the answer, not an error.
 */
export interface ErpLookup {
    kind: 'product' | 'company';
    /** The SKU or the Commerce company id asked for. */
    key: string;
    found: { commerce: boolean; erp: boolean };
    rows: Array<{ label: string; commerce: string | null; erp: string | null }>;
    /** The ERP screen's hash for the record, when the ERP has it. */
    erpHash: string | null;
}

/**
 * What `erp/history?trace=<order>` answers (the integration's `lib/order-trace.js`,
 * `buildOrderTrace`): one order's whole life across Commerce, the integration and
 * the ERP, oldest step first.
 */
export interface ErpOrderTrace {
    summary: {
        incrementId: string | null;
        commerceStatus: string | null;
        erpNumber: string | null;
        erpStatus: string | null;
        reachedErp: boolean;
    };
    steps: Array<{
        at: string;
        where: string;
        what: string;
        detail?: string;
        outcome?: string;
        tries?: number;
        retry?: unknown;
    }>;
}
