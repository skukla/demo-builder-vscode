/**
 * Fstab.yaml Generator
 *
 * Single source of truth for fstab.yaml content generation.
 * Used by project creation, storefront setup, and EDS reset operations.
 *
 * fstab.yaml configures Helix 5:
 * - mountpoints: Maps URL paths to DA.live content sources
 *
 * Note: Folder mapping (e.g., /products/ -> /products/default for PDP routing)
 * is configured via the AEM Configuration Service API, not fstab.yaml.
 * The Helix 5 pipeline does not process the fstab.yaml folders section.
 * See configurationService.ts for folder mapping implementation.
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
