/**
 * Catalog enumeration: every `(urlKey, sku)` pair an ACCS storefront's catalog
 * holds, read from Catalog Service GraphQL with the same headers the storefront
 * sends.
 *
 * READ-ONLY. Two callers: the catalog pre-warm (`catalogPrewarmService.ts`),
 * which publishes a page for each pair, and the diagnostics sample
 * (`catalogSampleSku.ts`), which asks for one.
 *
 * @module features/eds/services/catalogEnumeration
 */

import { generateHeaders, type ConfigGeneratorParams } from './configGenerator';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';
import type { Logger } from '@/types/logger';

/**
 * Per-page result size for the catalog enumeration query. Catalog
 * Service handles up to 500 per page comfortably; 100 is a balance
 * between page count and response size.
 */
const PAGE_SIZE = 100;

/**
 * Safety cap on total SKUs pre-warmed. A typical demo catalog is
 * 5–50 SKUs; the largest POC we expect is several hundred. 1000 is
 * the soft upper bound: any storefront with a larger catalog opts
 * out of full pre-warming (smart-404 fallback handles the rest).
 */
const MAX_SKUS = 1000;

/**
 * GraphQL query for enumerating product `(sku, urlKey)` pairs from
 * Catalog Service. Uses `productSearch` which is the standard ACCS
 * Catalog Service query; both `sku` and `urlKey` come from the
 * `productView` field per Catalog Service's response shape.
 */
const ENUMERATE_QUERY = `
query GetProductsForPrewarm($pageSize: Int!, $currentPage: Int!) {
  productSearch(phrase: "", page_size: $pageSize, current_page: $currentPage) {
    items {
      productView {
        sku
        urlKey
      }
    }
    page_info {
      total_pages
      current_page
    }
  }
}`;

/**
 * One (urlKey, sku) pair from the catalog. Combined to form a path
 * `/products/<urlKey>/<sku>` to publish.
 */
export interface SkuPath {
    urlKey: string;
    sku: string;
}

/**
 * Enumerate every `(urlKey, sku)` pair in the catalog via ACCS
 * Catalog Service GraphQL. Pages through results until the catalog
 * is exhausted or the safety cap is hit.
 *
 * Throws on:
 *   - HTTP non-2xx from Catalog Service
 *   - GraphQL `errors` in the response
 *   - Unexpected response shape (missing `productSearch.items`)
 *
 * Caller treats throws as non-fatal and skips pre-warming entirely
 * for that storefront.
 */
export async function enumerateAccsCatalog(
    params: ConfigGeneratorParams,
    logger: Logger,
    maxItems: number = MAX_SKUS,
): Promise<SkuPath[]> {
    // generateHeaders() returns { all: {...}, cs: {...} }. The catalog
    // GraphQL endpoint expects both groups merged on every request —
    // `all` is the shared base (Store: storeViewCode), `cs` is the
    // Catalog Service-specific block (Magento-Customer-Group, store
    // codes). Flatten before handing to fetch().
    const configHeaders = generateHeaders(params);
    const headers: Record<string, string> = {
        ...(configHeaders.all ?? {}),
        ...(configHeaders.cs ?? {}),
        'Content-Type': 'application/json',
    };
    const endpoint = params.commerceEndpoint;
    if (!endpoint) throw new Error('catalog prewarm requires a commerceEndpoint');

    const allPaths: SkuPath[] = [];
    let currentPage = 1;
    let totalPages = 1;

    do {
        const response = await fetch(endpoint, {
            method: 'POST',
            headers,
            body: JSON.stringify({
                query: ENUMERATE_QUERY,
                variables: { pageSize: PAGE_SIZE, currentPage },
            }),
            signal: AbortSignal.timeout(TIMEOUTS.NORMAL),
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status} from ${params.commerceEndpoint}`);
        }

        const data = (await response.json()) as {
            data?: {
                productSearch?: {
                    items?: Array<{ productView?: { sku?: string; urlKey?: string } }>;
                    page_info?: { total_pages?: number; current_page?: number };
                };
            };
            errors?: Array<{ message: string }>;
        };

        if (data.errors && data.errors.length > 0) {
            throw new Error(`GraphQL errors: ${data.errors.map((e) => e.message).join('; ')}`);
        }

        const result = data.data?.productSearch;
        if (!result?.items) {
            throw new Error('Catalog response missing productSearch.items');
        }

        for (const item of result.items) {
            const view = item.productView;
            if (view?.sku && view?.urlKey) {
                allPaths.push({ sku: view.sku, urlKey: view.urlKey });
                if (allPaths.length >= maxItems) {
                    // Only the real cap is worth warning about. A caller asking
                    // for a small sample (the diagnostics probe wants one) is
                    // hitting its own limit, not a catalog that is too big.
                    if (maxItems !== MAX_SKUS) return allPaths;
                    logger.warn(
                        `[Catalog Prewarm] Hit max SKU cap (${MAX_SKUS}); remaining pages skipped — smart-404 will warm them at runtime`,
                    );
                    return allPaths;
                }
            }
        }

        totalPages = result.page_info?.total_pages ?? 1;
        currentPage += 1;
    } while (currentPage <= totalPages);

    return allPaths;
}
