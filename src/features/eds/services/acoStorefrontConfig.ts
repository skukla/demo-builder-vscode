/**
 * What an ACO storefront's config.json says (PL-60): the catalog read from the project's Adobe
 * Commerce Optimizer instance, carts and orders still from its Commerce backend.
 *
 * The shape is Adobe's documented one (`.rptc/research/aco-support/research.md` §1, read 2026-10-04
 * from the Commerce Storefront configuration reference and the ACO storefront setup page):
 * - `commerce-endpoint` is the instance's Merchandising API, `…/{tenantId}/graphql`;
 *   `commerce-core-endpoint` stays the Commerce GraphQL the project already uses (cart, sign-in);
 * - headers sit under `cs` only: `AC-View-ID` (required), `AC-Source-Locale`, and
 *   `AC-Price-Book-ID` only when one is set; no `all.Store`, no `Magento-*`, no `x-api-key`
 *   (the Merchandising API needs no credential);
 * - the analytics block is ACO's: `environment-id` is the tenant, `view-id` the catalog view,
 *   with the currency codes and the store URL, and no store or website ids.
 *
 * Not emitted, and why: `AC-Environment-Id` (a local storefront sends it; no Adobe page lists it,
 * research §1 UNVERIFIED) and `AC-Catalog-View-Access-Token` (only a private view needs one, and it
 * must be minted server-side, never written into config).
 *
 * @module features/eds/services/acoStorefrontConfig
 */

import { acoGraphqlUrl } from '@/features/components/services/acoSettings';
import type { AcoStorefrontSettings } from '@/types/aco';

/** The `cs` headers an ACO storefront sends. */
export function acoHeaders(aco: AcoStorefrontSettings): { cs: Record<string, string> } {
    return {
        cs: {
            'AC-View-ID': aco.catalogViewId,
            'AC-Source-Locale': aco.locale,
            ...(aco.priceBookId ? { 'AC-Price-Book-ID': aco.priceBookId } : {}),
        },
    };
}

/** The ACO analytics block, keeping the currency and store URL the template already gives. */
export function acoAnalytics(aco: AcoStorefrontSettings, template: Record<string, unknown> | undefined): Record<string, unknown> {
    const currency = typeof template?.['base-currency-code'] === 'string' ? template['base-currency-code'] : 'USD';
    return {
        'environment-id': aco.tenantId,
        'view-id': aco.catalogViewId,
        'base-currency-code': currency,
        'store-view-currency-code': currency,
        ...(typeof template?.['store-url'] === 'string' ? { 'store-url': template['store-url'] } : {}),
    };
}

/**
 * Turn a generated `public.default` block into an ACO storefront's: the catalog endpoint, the
 * headers and the analytics block. Changes the block in place.
 *
 * @param block - `config.public.default`, after the template's placeholders are filled
 * @param commerceEndpoint - the project's Commerce GraphQL (mesh or direct), which carts still use
 */
export function applyAcoStorefront(block: Record<string, unknown>, aco: AcoStorefrontSettings, commerceEndpoint: string): void {
    block['commerce-core-endpoint'] = commerceEndpoint;
    block['commerce-endpoint'] = acoGraphqlUrl(aco);
    block.headers = acoHeaders(aco);
    block.analytics = acoAnalytics(aco, block.analytics as Record<string, unknown> | undefined);
}
