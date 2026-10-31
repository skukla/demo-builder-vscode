/**
 * An Adobe Commerce Optimizer (ACO) instance, as a project names it (PL-60).
 *
 * The SC picks the instance (tenant id, region, sandbox or production), the catalog view and the
 * locale; a price book is optional (owner, 2026-10-31, P2). Every URL derives from the instance:
 * `https://{region}[-sandbox].api.commerce.adobe.com/{tenantId}` (Adobe's Data Ingestion API
 * "Base URL", developer.adobe.com/commerce/services/optimizer/data-ingestion/using-the-api/, read
 * 2026-10-31). Nothing here is a credential: the ingestion credential lives in SecretStorage.
 *
 * @module types/aco
 */

/** Where an ACO instance runs: sandbox instances carry `-sandbox` in their host. */
export type AcoEnvironment = 'sandbox' | 'production';

/** One ACO instance. */
export interface AcoInstance {
    /** The instance's id, the path segment after the host. */
    tenantId: string;
    /** The cloud region, e.g. `na1` (sandboxes exist only there). */
    region: string;
    environment: AcoEnvironment;
}

/** What the storefront needs besides the instance: the catalog view, its locale, a price book. */
export interface AcoStorefrontSettings extends AcoInstance {
    /** The catalog view the storefront reads (made in ACO's own screens; no API creates one). */
    catalogViewId: string;
    /** The catalog source locale, e.g. `en-US`. */
    locale: string;
    /** A price book to ask for; absent, the view's default is used. */
    priceBookId?: string;
}

/** The ingestion credential: an OAuth server-to-server client from the project's workspace. */
export interface AcoCredential {
    clientId: string;
    clientSecret: string;
}
