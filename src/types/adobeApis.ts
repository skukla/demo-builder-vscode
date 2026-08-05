/**
 * Shared Adobe Console API types.
 *
 * Global (`@/types`) so both `@/core/*` (the picker) and `@/features/*` (the
 * service catalog + handlers) can share one definition without a core→feature
 * or cross-feature import.
 */

/**
 * A product family from the Console "Filter by product" grouping (Experience
 * Cloud, Adobe Experience Platform, Adobe Services, …). Carried verbatim from
 * `getServicesForOrg`'s `cloudGrouping` field through the API-access catalog
 * into the picker's product sub-headers.
 */
export interface CloudGrouping {
    /** Stable family code (e.g. "marketing_cloud", "experience_platform"). */
    code: string;
    /** Display name (e.g. "Experience Cloud"). */
    name: string;
}
