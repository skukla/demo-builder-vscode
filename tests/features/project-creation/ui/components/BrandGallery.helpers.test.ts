/**
 * BrandGallery Helper Tests
 *
 * Tests for filterBrandsBySearchQuery helper that extracts the brand filtering logic
 * from the BrandGallery component's useMemo.
 *
 * Follows TDD methodology - tests written BEFORE implementation.
 */

import { filterBrandsBySearchQuery } from '@/features/project-creation/ui/components/brandGalleryHelpers';
import type { Brand } from '@/types/brands';

describe('brandGalleryHelpers', () => {
    // Test fixtures - realistic brand data
    const mockBrands: Brand[] = [
        {
            id: 'citisignal',
            name: 'CitiSignal',
            description: 'Digital signage solution for urban displays',
        },
        {
            id: 'outdoors',
            name: 'Luma Outdoors',
            description: 'Adventure and camping equipment store',
        },
        {
            id: 'electronics',
            name: 'Tech Haven',
            description: 'Consumer electronics and gadgets retailer',
        },
    ];

    describe('filterBrandsBySearchQuery', () => {
        describe('empty or whitespace query', () => {
            it('should return all brands when search query is empty', () => {
                // Given: An empty search query
                const searchQuery = '';

                // When: Filtering brands
                const result = filterBrandsBySearchQuery(mockBrands, searchQuery);

                // Then: Should return all brands unchanged
                expect(result).toEqual(mockBrands);
                expect(result).toHaveLength(3);
            });

            it('should return all brands when search query is only whitespace', () => {
                // Given: A whitespace-only search query
                const searchQuery = '   ';

                // When: Filtering brands
                const result = filterBrandsBySearchQuery(mockBrands, searchQuery);

                // Then: Should return all brands unchanged
                expect(result).toEqual(mockBrands);
                expect(result).toHaveLength(3);
            });

            it('should return all brands when search query is tabs and newlines', () => {
                // Given: Tabs and newlines only
                const searchQuery = '\t\n  \t';

                // When: Filtering brands
                const result = filterBrandsBySearchQuery(mockBrands, searchQuery);

                // Then: Should return all brands unchanged
                expect(result).toEqual(mockBrands);
            });
        });

        describe('name matching', () => {
            it('should filter brands by name (case-insensitive)', () => {
                // Given: A query matching a brand name
                const searchQuery = 'citisignal';

                // When: Filtering brands
                const result = filterBrandsBySearchQuery(mockBrands, searchQuery);

                // Then: Should return only the matching brand
                expect(result).toHaveLength(1);
                expect(result[0].id).toBe('citisignal');
            });

            it('should filter brands by name with mixed case', () => {
                // Given: A mixed-case query
                const searchQuery = 'LUMA';

                // When: Filtering brands
                const result = filterBrandsBySearchQuery(mockBrands, searchQuery);

                // Then: Should find the brand regardless of case
                expect(result).toHaveLength(1);
                expect(result[0].id).toBe('outdoors');
            });

            it('should match partial name', () => {
                // Given: A partial name query
                const searchQuery = 'tech';

                // When: Filtering brands
                const result = filterBrandsBySearchQuery(mockBrands, searchQuery);

                // Then: Should return brands with partial name match
                expect(result).toHaveLength(1);
                expect(result[0].id).toBe('electronics');
            });
        });

        describe('description matching', () => {
            it('should filter brands by description (case-insensitive)', () => {
                // Given: A query matching a brand description
                const searchQuery = 'signage';

                // When: Filtering brands
                const result = filterBrandsBySearchQuery(mockBrands, searchQuery);

                // Then: Should return brand with matching description
                expect(result).toHaveLength(1);
                expect(result[0].id).toBe('citisignal');
            });

            it('should match partial description', () => {
                // Given: A partial description query
                const searchQuery = 'equipment';

                // When: Filtering brands
                const result = filterBrandsBySearchQuery(mockBrands, searchQuery);

                // Then: Should return brand with partial description match
                expect(result).toHaveLength(1);
                expect(result[0].id).toBe('outdoors');
            });
        });

        describe('combined name and description matching', () => {
            it('should match if query appears in either name or description', () => {
                // Given: A query that matches description of multiple brands
                const searchQuery = 'store';

                // When: Filtering brands
                const result = filterBrandsBySearchQuery(mockBrands, searchQuery);

                // Then: Should return brands where description contains 'store'
                expect(result).toHaveLength(1);
                expect(result[0].id).toBe('outdoors');
            });

            it('should match brands where query appears in name but not description', () => {
                // Given: A query only in name
                const searchQuery = 'haven';

                // When: Filtering brands
                const result = filterBrandsBySearchQuery(mockBrands, searchQuery);

                // Then: Should match by name
                expect(result).toHaveLength(1);
                expect(result[0].id).toBe('electronics');
            });
        });

        describe('no matches', () => {
            it('should return empty array when no brands match', () => {
                // Given: A query that matches nothing
                const searchQuery = 'nonexistent';

                // When: Filtering brands
                const result = filterBrandsBySearchQuery(mockBrands, searchQuery);

                // Then: Should return empty array
                expect(result).toEqual([]);
                expect(result).toHaveLength(0);
            });
        });

        describe('edge cases', () => {
            it('should return empty array when brands array is empty', () => {
                // Given: An empty brands array
                const emptyBrands: Brand[] = [];
                const searchQuery = 'anything';

                // When: Filtering brands
                const result = filterBrandsBySearchQuery(emptyBrands, searchQuery);

                // Then: Should return empty array
                expect(result).toEqual([]);
            });

            it('should handle special characters in search query', () => {
                // Given: A query with special regex characters
                const searchQuery = 'tech.haven';

                // When: Filtering brands
                const result = filterBrandsBySearchQuery(mockBrands, searchQuery);

                // Then: Should treat as literal characters, no match expected
                expect(result).toEqual([]);
            });

            it('should preserve original array order in results', () => {
                // Given: A broad query matching multiple brands
                const brandList: Brand[] = [
                    { id: 'a', name: 'Alpha Tech', description: 'First' },
                    { id: 'b', name: 'Beta Tech', description: 'Second' },
                    { id: 'c', name: 'Gamma Tech', description: 'Third' },
                ];
                const searchQuery = 'tech';

                // When: Filtering brands
                const result = filterBrandsBySearchQuery(brandList, searchQuery);

                // Then: Should preserve original order
                expect(result).toHaveLength(3);
                expect(result[0].id).toBe('a');
                expect(result[1].id).toBe('b');
                expect(result[2].id).toBe('c');
            });

            it('should not modify the original brands array', () => {
                // Given: A brands array
                const originalBrands = [...mockBrands];
                const searchQuery = 'citi';

                // When: Filtering brands
                filterBrandsBySearchQuery(mockBrands, searchQuery);

                // Then: Original array should be unchanged
                expect(mockBrands).toEqual(originalBrands);
            });
        });
    });
});
