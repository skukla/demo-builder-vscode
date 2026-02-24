/**
 * BrandGallery Helpers
 *
 * Utility functions for the BrandGallery component, extracted to improve
 * testability and reduce inline complexity.
 */

import type { DemoPackage } from '@/types/demoPackages';
import type { OptionalAddon } from '@/types/stacks';

/**
 * Filters stack addons using blacklist logic: show all unless explicitly excluded.
 *
 * Stacks define all possible addons; packages can exclude specific addons by
 * setting them to 'excluded'. Addons not mentioned in the package's addons map
 * pass through (they are NOT gated). If the package has no addons map, all
 * stack addons pass.
 */
export function filterAddonsByPackage(stackAddons: OptionalAddon[], pkg: DemoPackage): OptionalAddon[] {
    if (!pkg.addons) return stackAddons;
    return stackAddons.filter(addon => {
        const config = pkg.addons?.[addon.id];
        return config !== 'excluded';
    });
}

/**
 * Sorts packages alphabetically by name, with "coming-soon" packages last.
 */
export function sortPackages(packages: DemoPackage[]): DemoPackage[] {
    return [...packages].sort((a, b) => {
        const aComingSoon = a.status === 'coming-soon';
        const bComingSoon = b.status === 'coming-soon';
        if (aComingSoon !== bComingSoon) return aComingSoon ? 1 : -1;
        return a.name.localeCompare(b.name);
    });
}

/**
 * Filters packages based on a search query.
 *
 * Matches packages where the name OR description contains the search query
 * (case-insensitive). Returns all packages if the query is empty or whitespace-only.
 */
export function filterPackagesBySearchQuery(packages: DemoPackage[], searchQuery: string): DemoPackage[] {
    if (!searchQuery.trim()) {
        return packages;
    }
    const query = searchQuery.toLowerCase();
    return packages.filter(
        (p) =>
            p.name.toLowerCase().includes(query) ||
            p.description.toLowerCase().includes(query),
    );
}
