/**
 * Fstab.yaml Generator
 *
 * Single source of truth for fstab.yaml content generation.
 * Used by project creation, storefront setup, and EDS reset operations.
 *
 * fstab.yaml configures Helix 5:
 * - mountpoints: Maps URL paths to DA.live content sources
 * - folders: Routes URL prefixes to template pages (e.g., PDP routing)
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
 * //   /:
 * //     url: https://content.da.live/my-org/my-site/
 * //     type: markup
 * //
 * // folders:
 * //   /products/: /products/default
 */
export function generateFstabContent(config: FstabConfig): string {
    const { daLiveOrg, daLiveSite } = config;

    // fstab.yaml format for Helix 5
    // - mountpoints: Maps root path to DA.live content source
    // - folders: Routes /products/* URLs to /products/default template page
    //   This enables PDP (Product Detail Page) functionality
    return `mountpoints:
  /:
    url: https://content.da.live/${daLiveOrg}/${daLiveSite}/
    type: markup

folders:
  /products/: /products/default
`;
}
