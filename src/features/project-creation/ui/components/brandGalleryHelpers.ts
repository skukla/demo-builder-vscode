/**
 * BrandGallery Helpers
 *
 * Utility functions for the BrandGallery component, extracted to improve
 * testability and reduce inline complexity.
 */

import type { DemoPackage } from '@/types/demoPackages';
import type { OptionalAddon } from '@/types/stacks';

/**
 * Filters packages based on a search query.
 *
 * Matches packages where the name OR description contains the search query
 * (case-insensitive). Returns all packages if the query is empty or whitespace-only.
 *
 * @param packages - Array of packages to filter
 * @param searchQuery - Search query string to match against name and description
 * @returns Filtered array of packages matching the query
 */
/**
 * Filters stack addons to only those declared in the package's addons map.
 *
 * Stacks define all possible addons; packages restrict which are available
 * for a given brand. If the package has no addons map, all stack addons pass.
 */
export function filterAddonsByPackage(stackAddons: OptionalAddon[], pkg: DemoPackage): OptionalAddon[] {
    if (!pkg.addons) return stackAddons;
    return stackAddons.filter(addon => addon.id in pkg.addons!);
}

export function filterPackagesBySearchQuery(packages: DemoPackage[], searchQuery: string): DemoPackage[] {
    if (!searchQuery.trim()) {
        return packages;
    }
    const query = searchQuery.toLowerCase();
    return packages.filter(
        (p) =>
            p.name.toLowerCase().includes(query) ||
            p.description.toLowerCase().includes(query)
    );
}
