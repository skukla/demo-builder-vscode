/**
 * The demo ERP's own product records, for the ownership pass (AB-70): what the ERP holds,
 * and marking one discontinued. Routes as `skukla/demo-erp` documents them in
 * `actions/products/index.js`: `GET products` answers `{ items }`, each with `sku`, `type`
 * and (on a simple product or a variant) `salesStatus`; `PATCH products/:sku` takes
 * `{ salesStatus }`, and refuses it on a configurable parent, which carries none.
 *
 * `discontinued` is the status an ERP gives a product it no longer owns: a real ERP
 * discontinues, it does not delete (contract v17), and the demo ERP has no product delete
 * for that reason. Until the ERP is deployed with that status its PATCH answers 400, which
 * the pass reports and the add stands.
 *
 * @module features/app-builder/services/erpProducts
 */

import type { AppManagementAuth } from './appManagementClient';
import { callErpApi } from './erpIntegrationClient';

/** One product as the ERP lists it, the fields the pass reads. */
export interface ErpProductRow {
    sku: string;
    type?: string;
    salesStatus?: string;
}

/** The status a product no ERP owns is given where it is held. */
export const DISCONTINUED = 'discontinued';

/** The products an ERP holds; throws in the ERP's words when it does not answer. */
export async function listErpProducts(
    deployedUrls: Record<string, string> | undefined,
    auth: AppManagementAuth,
    fetchImpl: typeof fetch = globalThis.fetch,
): Promise<ErpProductRow[]> {
    const answer = await callErpApi(deployedUrls, auth, 'GET', 'products', undefined, fetchImpl);
    if ('refusal' in answer) throw new Error(answer.refusal);
    if (!answer.ok) throw new Error(`The ERP's products answered ${answer.status}: ${answer.detail}`);
    const items = (answer.body as { items?: unknown }).items;
    if (!Array.isArray(items)) throw new Error("The ERP's products answered without items.");
    return items.flatMap((item): ErpProductRow[] => {
        const row = item as Partial<ErpProductRow>;
        return typeof row.sku === 'string' && row.sku
            ? [{ sku: row.sku, type: row.type, salesStatus: row.salesStatus }]
            : [];
    });
}

/** Mark one product discontinued in the ERP; throws in the ERP's words when it refuses. */
export async function discontinueErpProduct(
    deployedUrls: Record<string, string> | undefined,
    auth: AppManagementAuth,
    sku: string,
    fetchImpl: typeof fetch = globalThis.fetch,
): Promise<void> {
    const answer = await callErpApi(
        deployedUrls,
        auth,
        'PATCH',
        `products/${encodeURIComponent(sku)}`,
        { salesStatus: DISCONTINUED },
        fetchImpl,
    );
    if ('refusal' in answer) throw new Error(answer.refusal);
    if (!answer.ok) throw new Error(`The ERP answered ${answer.status}: ${answer.detail}`);
}
