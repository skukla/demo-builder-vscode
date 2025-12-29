/**
 * BrandGallery Helpers
 *
 * Utility functions for the BrandGallery component, extracted to improve
 * testability and reduce inline complexity.
 */

import type { DemoPackage } from '@/types/demoPackages';

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
