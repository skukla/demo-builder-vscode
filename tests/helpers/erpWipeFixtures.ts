/**
 * The ERP integration's answers a wipe reads ("One action, ERP included", datapack-engine step 10),
 * typed to the extension's own types so a shape cannot be invented here.
 *
 * - `JUSTRITE_SETTINGS`: `GET erp/settings?websites=` as JustRite's integration answered it on
 *   scratch-1028's instance (2026-10-30, read through `get_erp_settings`): `orders_send: true` and
 *   `structure_owns: "all"` for every website. Only those two fields are copied; the website keys
 *   are the sandbox's (`commerceWipeFixtures.ts`).
 * - `STATUS_BY_STORE` / `STATUS_BEFORE`: `GET erp/status`, with and without `closesOrdersByStore`
 *   (the integration's `actions/erp/status`, a2556c2); the rest is the type's minimum.
 * - `STORE_CLOSE`: what `POST erp/close-orders` answers, in the shape the integration's own box test
 *   pins (`test/box/close-store-orders.test.js`, 1f6de21): `touched[].orderId` is the order NUMBER,
 *   `erpRemoved` keyed by the ERP's list id (`justrite`, as JustRite's manifest lists its ERP). The
 *   counts are for the test store's two orders; no deployment has answered it yet.
 */

import type { ResolvedErpSettings } from '@/features/app-builder/services/erpFill';
import type { ErpIntegrationStatus, ErpStoreCloseReport } from '@/types/erpIntegration';

const SENDS = { orders_send: true, structure_owns: 'all' };

export const JUSTRITE_SETTINGS: ResolvedErpSettings = {
    default: SENDS,
    websites: { base: SENDS, justrite: SENDS, bodea: { ...SENDS, orders_send: false }, justrite_test_website: SENDS },
};

const STATUS: ErpIntegrationStatus = {
    app: { id: 'commerce-erp-integration', version: '1.0.0' },
    erp: { reachable: true, ok: true },
    erpBaseUrl: null,
    ledger: { entries: 0 },
    closesOrdersOnReset: true,
    detachRuns: true,
};

/** A deployment with the store-scoped close. */
export const STATUS_BY_STORE: ErpIntegrationStatus = { ...STATUS, closesOrdersByStore: true };

/** One from before it: closes orders only on a whole reset. */
export const STATUS_BEFORE: ErpIntegrationStatus = STATUS;

/** The close of the test store's two orders: one canceled, one refunded with its return closed. */
export const STORE_CLOSE: ErpStoreCloseReport = {
    scope: { stores: ['justrite_test_store'], websites: [], storeViewIds: [6] },
    closed: { cancelled: 1, refunded: 1, commented: 0, alreadyClosed: 0, returnsClosed: 1, partsRemoved: 2, failed: [] },
    touched: [
        { orderId: '000000701', outcome: 'cancelled' },
        { orderId: '000000704', outcome: 'refunded' },
    ],
    orders: { cleared: 2, failed: [] },
    holds: { released: 0, failed: [] },
    erpRemoved: {
        justrite: {
            notFound: [],
            removed: { creditMemos: 0, events: 4, invoices: 1, payments: 0, returnOrders: 0, salesOrders: 2, shipments: 1 },
        },
    },
};
