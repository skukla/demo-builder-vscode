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
    /**
     * Whether `erp/close-orders` exists: the orders of some stores only closed, each ERP that held
     * one removing its documents for them (the demo-data wipe's close; integration a2556c2).
     * Also says that action records its runs for `GET erp/close-orders?run=`.
     */
    closesOrdersByStore?: boolean;
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
        /** Refunded with an offline credit memo (the one reset rule, integration 0a10b95); absent from a deployment before it. */
        refunded?: number;
        commented: number;
        alreadyClosed: number;
        /** Returns set Closed (the one reset rule); absent from a deployment before it. */
        returnsClosed?: number;
        partsRemoved: number;
        failed: Array<{ orderId: string; error: string }>;
    };
}

/** How the store close ended one order (`touched[].outcome`). */
export type ErpStoreCloseOutcome = 'cancelled' | 'refunded' | 'refundedOpen' | 'commented' | 'alreadyClosed' | 'failed';

/** One ERP's removal of the closed orders' documents (`admin/remove-orders`, demo-erp contract 23). */
export type ErpOrdersRemoved =
    | { removed: Partial<Record<'salesOrders' | 'shipments' | 'invoices' | 'creditMemos' | 'returnOrders' | 'payments' | 'events', number>>; notFound: string[] }
    | 'unsupported'
    | { failed: string };

/**
 * What `POST erp/close-orders` answers (commerce-erp-integration `actions/erp/close-orders`,
 * `lib/close-store-orders.js`, read at 1f6de21; the shape its box test pins,
 * `test/box/close-store-orders.test.js`). `touched[].orderId` is the order NUMBER
 * (`increment_id`); `erpRemoved` is keyed by the ERP's list id.
 */
export interface ErpStoreCloseReport {
    scope: { stores: string[]; websites: string[]; storeViewIds: number[] };
    closed: {
        cancelled: number;
        refunded: number;
        commented: number;
        alreadyClosed: number;
        returnsClosed: number;
        partsRemoved: number;
        failed: Array<{ orderId: string; error: string }>;
    };
    touched: Array<{ orderId: string; outcome: ErpStoreCloseOutcome }>;
    orders: { cleared: number; failed: unknown[] };
    holds: { released: number; failed: unknown[] };
    erpRemoved: Record<string, ErpOrdersRemoved>;
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
