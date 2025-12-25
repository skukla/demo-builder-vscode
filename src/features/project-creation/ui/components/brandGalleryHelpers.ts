/**
 * BrandGallery Helpers
 *
 * Utility functions for the BrandGallery component, extracted to improve
 * testability and reduce inline complexity.
 */

import type { Brand } from '@/types/brands';

/**
 * Filters brands based on a search query.
 *
 * Matches brands where the name OR description contains the search query
 * (case-insensitive). Returns all brands if the query is empty or whitespace-only.
 *
 * @param brands - Array of brands to filter
 * @param searchQuery - Search query string to match against name and description
 * @returns Filtered array of brands matching the query
 */
export function filterBrandsBySearchQuery(brands: Brand[], searchQuery: string): Brand[] {
    if (!searchQuery.trim()) {
        return brands;
    }
    const query = searchQuery.toLowerCase();
    return brands.filter(
        (b) =>
            b.name.toLowerCase().includes(query) ||
            b.description.toLowerCase().includes(query)
    );
}
