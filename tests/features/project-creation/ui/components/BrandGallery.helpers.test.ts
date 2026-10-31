/**
 * BrandGallery Helper Tests
 *
 * Tests for brandGalleryHelpers utility functions:
 * - sortPackages: Alphabetical sort with coming-soon packages last
 * - filterPackagesBySearchQuery: Case-insensitive name/description search
 *
 * Follows TDD methodology - tests written BEFORE implementation.
 */

import {
    filterPackagesBySearchQuery,
    sortPackages,
} from '@/features/project-creation/ui/components/brandGalleryHelpers';
import type { DemoPackage } from '@/types/demoPackages';

describe('brandGalleryHelpers', () => {
    // Test fixtures - realistic package data
    const mockPackages: DemoPackage[] = [
        {
            id: 'citisignal',
            name: 'CitiSignal',
            description: 'Digital signage solution for urban displays',
            configDefaults: {},
            storefronts: {},
        },
        {
            id: 'outdoors',
            name: 'Luma Outdoors',
            description: 'Adventure and camping equipment store',
            configDefaults: {},
            storefronts: {},
        },
        {
            id: 'electronics',
            name: 'Tech Haven',
            description: 'Consumer electronics and gadgets retailer',
            configDefaults: {},
            storefronts: {},
        },
    ];

    describe('filterPackagesBySearchQuery', () => {
        describe('empty or whitespace query', () => {
            it('should return all packages when search query is empty', () => {
                // Given: An empty search query
                const searchQuery = '';

                // When: Filtering packages
                const result = filterPackagesBySearchQuery(mockPackages, searchQuery);

                // Then: Should return all packages unchanged
                expect(result).toEqual(mockPackages);
                expect(result).toHaveLength(3);
            });

            it('should return all packages when search query is only whitespace', () => {
                // Given: A whitespace-only search query
                const searchQuery = '   ';

                // When: Filtering packages
                const result = filterPackagesBySearchQuery(mockPackages, searchQuery);

                // Then: Should return all packages unchanged
                expect(result).toEqual(mockPackages);
                expect(result).toHaveLength(3);
            });

            it('should return all packages when search query is tabs and newlines', () => {
                // Given: Tabs and newlines only
                const searchQuery = '\t\n  \t';

                // When: Filtering packages
                const result = filterPackagesBySearchQuery(mockPackages, searchQuery);

                // Then: Should return all packages unchanged
                expect(result).toEqual(mockPackages);
            });
        });

        describe('name matching', () => {
            it('should filter packages by name (case-insensitive)', () => {
                // Given: A query matching a package name
                const searchQuery = 'citisignal';

                // When: Filtering packages
                const result = filterPackagesBySearchQuery(mockPackages, searchQuery);

                // Then: Should return only the matching package
                expect(result).toHaveLength(1);
                expect(result[0].id).toBe('citisignal');
            });

            it('should filter packages by name with mixed case', () => {
                // Given: A mixed-case query
                const searchQuery = 'LUMA';

                // When: Filtering packages
                const result = filterPackagesBySearchQuery(mockPackages, searchQuery);

                // Then: Should find the package regardless of case
                expect(result).toHaveLength(1);
                expect(result[0].id).toBe('outdoors');
            });

            it('should match partial name', () => {
                // Given: A partial name query
                const searchQuery = 'tech';

                // When: Filtering packages
                const result = filterPackagesBySearchQuery(mockPackages, searchQuery);

                // Then: Should return packages with partial name match
                expect(result).toHaveLength(1);
                expect(result[0].id).toBe('electronics');
            });
        });

        describe('description matching', () => {
            it('should filter packages by description (case-insensitive)', () => {
                // Given: A query matching a package description
                const searchQuery = 'signage';

                // When: Filtering packages
                const result = filterPackagesBySearchQuery(mockPackages, searchQuery);

                // Then: Should return package with matching description
                expect(result).toHaveLength(1);
                expect(result[0].id).toBe('citisignal');
            });

            it('should match partial description', () => {
                // Given: A partial description query
                const searchQuery = 'equipment';

                // When: Filtering packages
                const result = filterPackagesBySearchQuery(mockPackages, searchQuery);

                // Then: Should return package with partial description match
                expect(result).toHaveLength(1);
                expect(result[0].id).toBe('outdoors');
            });
        });

        describe('combined name and description matching', () => {
            it('should match if query appears in either name or description', () => {
                // Given: A query that matches description of multiple packages
                const searchQuery = 'store';

                // When: Filtering packages
                const result = filterPackagesBySearchQuery(mockPackages, searchQuery);

                // Then: Should return packages where description contains 'store'
                expect(result).toHaveLength(1);
                expect(result[0].id).toBe('outdoors');
            });

            it('should match packages where query appears in name but not description', () => {
                // Given: A query only in name
                const searchQuery = 'haven';

                // When: Filtering packages
                const result = filterPackagesBySearchQuery(mockPackages, searchQuery);

                // Then: Should match by name
                expect(result).toHaveLength(1);
                expect(result[0].id).toBe('electronics');
            });
        });

        describe('no matches', () => {
            it('should return empty array when no packages match', () => {
                // Given: A query that matches nothing
                const searchQuery = 'nonexistent';

                // When: Filtering packages
                const result = filterPackagesBySearchQuery(mockPackages, searchQuery);

                // Then: Should return empty array
                expect(result).toStrictEqual([]);
                expect(result).toHaveLength(0);
            });
        });

        describe('edge cases', () => {
            it('should return empty array when packages array is empty', () => {
                // Given: An empty packages array
                const emptyPackages: DemoPackage[] = [];
                const searchQuery = 'anything';

                // When: Filtering packages
                const result = filterPackagesBySearchQuery(emptyPackages, searchQuery);

                // Then: Should return empty array
                expect(result).toStrictEqual([]);
            });

            it('should handle special characters in search query', () => {
                // Given: A query with special regex characters
                const searchQuery = 'tech.haven';

                // When: Filtering packages
                const result = filterPackagesBySearchQuery(mockPackages, searchQuery);

                // Then: Should treat as literal characters, no match expected
                expect(result).toStrictEqual([]);
            });

            it('should preserve original array order in results', () => {
                // Given: A broad query matching multiple packages
                const packageList: DemoPackage[] = [
                    { id: 'a', name: 'Alpha Tech', description: 'First', configDefaults: {}, storefronts: {} },
                    { id: 'b', name: 'Beta Tech', description: 'Second', configDefaults: {}, storefronts: {} },
                    { id: 'c', name: 'Gamma Tech', description: 'Third', configDefaults: {}, storefronts: {} },
                ];
                const searchQuery = 'tech';

                // When: Filtering packages
                const result = filterPackagesBySearchQuery(packageList, searchQuery);

                // Then: Should preserve original order
                expect(result).toHaveLength(3);
                expect(result[0].id).toBe('a');
                expect(result[1].id).toBe('b');
                expect(result[2].id).toBe('c');
            });

            it('should not modify the original packages array', () => {
                // Given: A packages array
                const originalPackages = [...mockPackages];
                const searchQuery = 'citi';

                // When: Filtering packages
                filterPackagesBySearchQuery(mockPackages, searchQuery);

                // Then: Original array should be unchanged
                expect(mockPackages).toEqual(originalPackages);
            });
        });
    });

    describe('sortPackages', () => {
        it('should preserve input order for active packages', () => {
            // Given: Packages in a specific order (matching JSON config order)
            const packages: DemoPackage[] = [
                { id: 'c', name: 'Zebra Co', description: '', configDefaults: {}, storefronts: {} },
                { id: 'a', name: 'Alpha Inc', description: '', configDefaults: {}, storefronts: {} },
                { id: 'b', name: 'Middle Corp', description: '', configDefaults: {}, storefronts: {} },
            ];

            // When: Sorting packages
            const result = sortPackages(packages);

            // Then: Original order preserved (not alphabetical)
            expect(result.map(p => p.name)).toEqual(['Zebra Co', 'Alpha Inc', 'Middle Corp']);
        });

        it('should place coming-soon packages after active packages', () => {
            // Given: A mix of active and coming-soon packages
            const packages: DemoPackage[] = [
                { id: 'cs', name: 'Alpha', description: '', status: 'coming-soon', configDefaults: {}, storefronts: {} },
                { id: 'active', name: 'Beta', description: '', configDefaults: {}, storefronts: {} },
            ];

            // When: Sorting packages
            const result = sortPackages(packages);

            // Then: Active (Beta) comes first, coming-soon (Alpha) comes last
            expect(result[0].id).toBe('active');
            expect(result[1].id).toBe('cs');
        });

        it('should preserve relative order among coming-soon packages', () => {
            // Given: Multiple coming-soon packages in a specific order
            const packages: DemoPackage[] = [
                { id: 'active1', name: 'Active', description: '', configDefaults: {}, storefronts: {} },
                { id: 'cs2', name: 'Zebra Soon', description: '', status: 'coming-soon', configDefaults: {}, storefronts: {} },
                { id: 'cs1', name: 'Alpha Soon', description: '', status: 'coming-soon', configDefaults: {}, storefronts: {} },
            ];

            // When: Sorting packages
            const result = sortPackages(packages);

            // Then: Active first, then coming-soon in original relative order
            expect(result.map(p => p.id)).toEqual(['active1', 'cs2', 'cs1']);
        });

        it('should return empty array for empty input', () => {
            // Given: No packages
            const result = sortPackages([]);

            // Then: Empty result
            expect(result).toStrictEqual([]);
        });

        it('should not mutate the original array', () => {
            // Given: A packages array
            const packages: DemoPackage[] = [
                { id: 'b', name: 'Beta', description: '', configDefaults: {}, storefronts: {} },
                { id: 'a', name: 'Alpha', description: '', configDefaults: {}, storefronts: {} },
            ];
            const originalOrder = packages.map(p => p.id);

            // When: Sorting
            sortPackages(packages);

            // Then: Original array unchanged
            expect(packages.map(p => p.id)).toEqual(originalOrder);
        });
    });
});
