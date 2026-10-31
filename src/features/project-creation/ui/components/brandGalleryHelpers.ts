/**
 * BrandGallery Helpers
 *
 * Utility functions for the BrandGallery component, extracted to improve
 * testability and reduce inline complexity.
 */

import type { DemoPackage } from '@/types/demoPackages';

/**
 * Sorts packages preserving JSON config order, with "coming-soon" packages last.
 */
export function sortPackages(packages: DemoPackage[]): DemoPackage[] {
    return [...packages].sort((a, b) => {
        const aComingSoon = a.status === 'coming-soon';
        const bComingSoon = b.status === 'coming-soon';
        if (aComingSoon !== bComingSoon) return aComingSoon ? 1 : -1;
        return 0;
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
