/**
 * Commerce Store Structure Types
 *
 * Types for auto-discovering Commerce store hierarchy (websites, store groups,
 * store views) from the REST API. Used by the store discovery service to
 * populate dropdowns in place of manual text entry.
 *
 * @module types/commerceStore
 */

// ==========================================================
// Commerce REST API Response Types
// ==========================================================

/**
 * Commerce website — top-level entity that owns payment, shipping, tax, and pricing config.
 * Maps to REST API: GET /V1/store/websites
 */
export interface CommerceWebsite {
    /** Unique website ID */
    id: number;

    /** Website code used in storefront configuration (e.g., 'base', 'citisignal') */
    code: string;

    /** Human-readable website name */
    name: string;
}

/**
 * Commerce store group — intermediate entity that owns root category.
 * Maps to REST API: GET /V1/store/storeGroups
 *
 * Property names match the Commerce REST API response format (snake_case).
 */
export interface CommerceStoreGroup {
    /** Unique store group ID */
    id: number;

    /** Store group code (e.g., 'citisignal_store') */
    code: string;

    /** Human-readable store group name */
    name: string;

    /** Parent website ID — used for cascading filters */
    website_id: number;

    /** Root category ID assigned to this store group */
    root_category_id: number;
}

/**
 * Commerce store view — leaf entity representing a language/locale.
 * Maps to REST API: GET /V1/store/storeViews
 *
 * Property names match the Commerce REST API response format (snake_case).
 */
export interface CommerceStoreView {
    /** Unique store view ID */
    id: number;

    /** Store view code used in storefront configuration (e.g., 'citisignal_us') */
    code: string;

    /** Human-readable store view name */
    name: string;

    /** Parent store group ID — used for cascading filters */
    store_group_id: number;

    /** Grandparent website ID — denormalized for convenience */
    website_id: number;

    /** Whether this store view is active */
    is_active: boolean;
}

// ==========================================================
// Aggregated Structure
// ==========================================================

/**
 * Complete Commerce store hierarchy fetched from REST API.
 * Contains all websites, store groups, and store views.
 */
export interface CommerceStoreStructure {
    /** All websites in the Commerce instance */
    websites: CommerceWebsite[];

    /** All store groups across all websites */
    storeGroups: CommerceStoreGroup[];

    /** All store views across all store groups */
    storeViews: CommerceStoreView[];
}

// ==========================================================
// Discovery Service Types
// ==========================================================

/**
 * Parameters for store discovery — dispatches to PaaS or ACCS path.
 */
export interface StoreDiscoveryParams {
    /** Commerce backend type determines auth strategy */
    backendType: 'paas' | 'accs';

    /** Base URL for the Commerce instance (e.g., 'https://mystore.com') */
    baseUrl: string;

    /** PaaS only: admin username for token authentication */
    username?: string;

    /** PaaS only: admin password for token authentication */
    password?: string;

    /** ACCS only: IMS access token */
    imsToken?: string;

    /** ACCS only: API client ID (x-api-key header) */
    clientId?: string;

    /** ACCS only: IMS organization ID (x-gw-ims-org-id header) */
    orgId?: string;

    /** ACCS only: tenant ID extracted from ACCS GraphQL endpoint */
    tenantId?: string;
}

/**
 * Discriminated union result from store discovery.
 * Success contains the full hierarchy; failure contains an error message.
 */
export type StoreDiscoveryResult =
    | { success: true; data: CommerceStoreStructure }
    | { success: false; error: string };
