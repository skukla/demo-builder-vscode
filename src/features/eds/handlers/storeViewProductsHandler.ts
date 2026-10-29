/**
 * `check-store-view-products` — does a guest see any products in the store view
 * the SC just picked? (EDS-46)
 *
 * The store pickers (wizard Business Structure, Configure) send it once a
 * website, store and store view are chosen. It RETURNS the answer (Pattern B);
 * nothing is pushed.
 *
 * ACCS only. Anything it cannot check — another backend, an endpoint that is not
 * https, a code that could not be a store code — answers `unknown`, which the
 * pickers render as nothing. The check is anonymous, so no sign-in is needed.
 *
 * @module features/eds/handlers/storeViewProductsHandler
 */

import { probeStoreViewProducts } from '../services/storeViewProducts';
import { validateURL } from '@/core/validation/URLValidator';
import type { StoreViewProducts } from '@/types/commerceStore';
import type { HandlerContext } from '@/types/handlers';
import type {
    CheckStoreViewProductsRequest,
    CheckStoreViewProductsResponse,
} from '@/types/webviewRequests';

/**
 * A Commerce store, website or store view code: letters, digits and underscores
 * (Commerce's own rule). Checked because the codes become request headers.
 */
const STORE_CODE = /^[A-Za-z0-9_]+$/;

/** Whether the request is one this check can honestly answer. */
function isCheckable(payload: CheckStoreViewProductsRequest | undefined): boolean {
    if (payload?.backendType !== 'accs') return false;
    const codes = [payload.websiteCode, payload.storeCode, payload.storeViewCode];
    if (!codes.every((code) => typeof code === 'string' && STORE_CODE.test(code))) return false;
    try {
        validateURL(payload.endpoint, ['https']);
        return true;
    } catch {
        return false;
    }
}

function answer(verdict: StoreViewProducts): CheckStoreViewProductsResponse {
    return { success: true, data: { verdict } };
}

/**
 * Run the store-view product check for the codes the SC picked.
 *
 * @param context - handler context (for the logger)
 * @param payload - the backend, endpoint and three codes
 * @returns the verdict; `unknown` when the request is not one this can check
 */
export async function handleCheckStoreViewProducts(
    context: HandlerContext,
    payload?: CheckStoreViewProductsRequest,
): Promise<CheckStoreViewProductsResponse> {
    if (!payload || !isCheckable(payload)) return answer('unknown');

    const verdict = await probeStoreViewProducts(
        payload.endpoint,
        {
            websiteCode: payload.websiteCode,
            storeCode: payload.storeCode,
            storeViewCode: payload.storeViewCode,
        },
        context.logger,
    );
    context.logger.debug(
        `[Store View Products] ${payload.websiteCode} / ${payload.storeCode} / ` +
            `${payload.storeViewCode}: ${verdict}`,
    );
    return answer(verdict);
}
