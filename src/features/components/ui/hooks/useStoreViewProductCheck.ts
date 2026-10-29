/**
 * Should the store pickers warn that guests will see no products? (EDS-46)
 *
 * Once an ACCS endpoint and all three codes (website, store, store view) are set,
 * asks the host to run one anonymous Catalog Service search for that store view
 * (`check-store-view-products`). Warns only on a real "nothing there" answer —
 * no products, or no search index. While asking, or when the check cannot answer,
 * it says nothing: the warning is a claim, and "could not check" is not one.
 *
 * Answers are cached per endpoint + codes for the webview's lifetime, in module
 * scope rather than a ref, so flipping the pickers back — or a row remounting
 * when the SC moves between steps — never asks the same question twice. Store
 * contents do not change while a wizard step is open.
 *
 * @module features/components/ui/hooks/useStoreViewProductCheck
 */

import { useEffect, useState } from 'react';
import { webviewClient } from '@/core/ui/utils/WebviewClient';
import { warnsOfNoProducts, type StoreViewProducts } from '@/types/commerceStore';
import type {
    CheckStoreViewProductsRequest,
    CheckStoreViewProductsResponse,
} from '@/types/webviewRequests';

/** Answers received, by endpoint + codes. */
const answers = new Map<string, StoreViewProducts>();
/**
 * Questions asked and not yet answered. A row that remounts mid-check waits on
 * the same request rather than asking again — or, worse, never hearing back.
 */
const asking = new Map<string, Promise<void>>();

function keyFor(request: CheckStoreViewProductsRequest): string {
    return [request.endpoint, request.websiteCode, request.storeCode, request.storeViewCode].join('\n');
}

/** Ask the host once per key; resolves when the answer is in the cache. */
function ask(request: CheckStoreViewProductsRequest): Promise<void> {
    const key = keyFor(request);
    const inFlight = asking.get(key) ?? fetchAnswer(key, request);
    asking.set(key, inFlight);
    return inFlight;
}

/** Ask the host, remember the answer. A failed request is remembered as `unknown`. */
async function fetchAnswer(key: string, request: CheckStoreViewProductsRequest): Promise<void> {
    try {
        const response = await webviewClient.request<CheckStoreViewProductsResponse>(
            'check-store-view-products',
            request,
        );
        answers.set(key, response?.data?.verdict ?? 'unknown');
    } catch {
        answers.set(key, 'unknown');
    } finally {
        asking.delete(key);
    }
}

/**
 * Whether to warn that the chosen ACCS store view shows guests no products.
 *
 * @param endpoint - the ACCS GraphQL endpoint; undefined (PaaS, or not entered yet) asks nothing
 * @param websiteCode - the chosen website code
 * @param storeCode - the chosen store code
 * @param storeViewCode - the chosen store view code
 * @returns true only when the check answered `none` or `no-index`
 */
export function useStoreViewProductCheck(
    endpoint: string | undefined,
    websiteCode: string,
    storeCode: string,
    storeViewCode: string,
): boolean {
    // Bumped when an answer lands, to re-render; the answer itself is read from the cache.
    const [, setAnswered] = useState(0);
    const complete = Boolean(endpoint && websiteCode && storeCode && storeViewCode);
    const key = complete
        ? keyFor({ backendType: 'accs', endpoint: endpoint ?? '', websiteCode, storeCode, storeViewCode })
        : undefined;

    useEffect(() => {
        if (!endpoint || !key || answers.has(key)) return;
        let mounted = true;
        void ask({ backendType: 'accs', endpoint, websiteCode, storeCode, storeViewCode }).then(() => {
            if (mounted) setAnswered((n) => n + 1);
        });
        return () => {
            mounted = false;
        };
    }, [key, endpoint, websiteCode, storeCode, storeViewCode]);

    return key !== undefined && warnsOfNoProducts(answers.get(key));
}
