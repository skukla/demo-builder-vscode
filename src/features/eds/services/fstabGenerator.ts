/**
 * Fstab.yaml Generator
 *
 * Single source of truth for fstab.yaml content generation.
 * Used by project creation, storefront setup, and EDS reset operations.
 *
 * fstab.yaml configures Helix 5:
 * - mountpoints: Maps URL paths to DA.live content sources
 *
 * ## Why fstab.yaml is still written (audit A1, 2026-05-18)
 *
 * Modern Helix content-source registration happens via the Configuration Service
 * (`PUT /config/{org}/sites/{site}.json` with a `content.source` block). At first
 * glance fstab.yaml looks legacy. However, the Helix Admin `DELETE /live` endpoint
 * uses fstab.yaml as a "source exists" guard. Project cleanup (helixService.ts)
 * relies on this: the DA.live Bearer token bypass is the ONLY auth that succeeds
 * when fstab declares a content source — GitHub token and API key both return 403
 * "delete not allowed while source exists" in that scenario.
 *
 * Removing fstab.yaml today would break the unpublish/cleanup flow. Removal is
 * gated on Adobe officially deprecating the fstab-based guard (no announcement
 * at time of writing).
 *
 * Note: Folder mapping (`/products/ -> /products/default` for PDP routing) is
 * deprecated by Adobe (see aem.live/developer/byom). It was never written to
 * fstab.yaml; the legacy `folders:` section is not processed by the Helix 5
 * pipeline. CitiSignal handles `/products/{sku}` via client-side routing.
 */

/**
 * Configuration for fstab.yaml generation
 */
export interface FstabConfig {
    /** DA.live organization name */
    daLiveOrg: string;
    /** DA.live site name */
    daLiveSite: string;
}

/** Validate that an org or site name is safe to embed in a URL path (no newlines, spaces, or colons). */
function validatePathSegment(value: string, field: string): void {
    if (/[\n\r\s:]/.test(value)) {
        throw new Error(`Invalid fstab config: ${field} contains characters not allowed in a URL path segment`);
    }
}

/**
 * Generate fstab.yaml content for Helix 5
 *
 * This is the single source of truth for fstab.yaml format.
 * All code that generates fstab.yaml should use this function.
 *
 * @param config - DA.live organization and site configuration
 * @returns fstab.yaml content string
 *
 * @example
 * const content = generateFstabContent({
 *     daLiveOrg: 'my-org',
 *     daLiveSite: 'my-site',
 * });
 * // Returns:
 * // mountpoints:
 * //   /: https://content.da.live/my-org/my-site/
 */
export function generateFstabContent(config: FstabConfig): string {
    const { daLiveOrg, daLiveSite } = config;

    validatePathSegment(daLiveOrg, 'daLiveOrg');
    validatePathSegment(daLiveSite, 'daLiveSite');

    // Simple string format — the standard fstab for DA.live content sources.
    // The Helix admin recognizes content.da.live URLs natively (sourceLocation: "da:...").
    // The nested `url:` + `type: markup` format is for external BYOM markup services only;
    // using it for DA.live causes the admin to treat the source as generic BYOM, which
    // requires Config Service to resolve and returns "invalid fstab" if that registration
    // is absent during a fresh POST preview call.
    return `mountpoints:
  /: https://content.da.live/${daLiveOrg}/${daLiveSite}/
`;
}
