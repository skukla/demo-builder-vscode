/**
 * BrandGallery Helper Tests
 *
 * Tests for filterPackagesBySearchQuery helper that extracts the package filtering logic
 * from the BrandGallery component's useMemo.
 *
 * Follows TDD methodology - tests written BEFORE implementation.
 */

import { filterPackagesBySearchQuery, filterAddonsByPackage } from '@/features/project-creation/ui/components/brandGalleryHelpers';
import type { DemoPackage } from '@/types/demoPackages';
import type { OptionalAddon } from '@/types/stacks';

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
                expect(result).toEqual([]);
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
                expect(result).toEqual([]);
            });

            it('should handle special characters in search query', () => {
                // Given: A query with special regex characters
                const searchQuery = 'tech.haven';

                // When: Filtering packages
                const result = filterPackagesBySearchQuery(mockPackages, searchQuery);

                // Then: Should treat as literal characters, no match expected
                expect(result).toEqual([]);
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

    describe('filterAddonsByPackage', () => {
        const stackAddons: OptionalAddon[] = [
            { id: 'demo-inspector' },
            { id: 'adobe-commerce-aco' },
        ];

        it('should return only addons declared in the package', () => {
            // Given: A package that only declares demo-inspector
            const pkg: DemoPackage = {
                id: 'citisignal',
                name: 'CitiSignal',
                description: 'Telecom demo',
                configDefaults: {},
                storefronts: {},
                addons: { 'demo-inspector': 'optional' },
            };

            // When: Filtering stack addons by package
            const result = filterAddonsByPackage(stackAddons, pkg);

            // Then: Only demo-inspector returned, ACO excluded
            expect(result).toHaveLength(1);
            expect(result[0].id).toBe('demo-inspector');
        });

        it('should return all addons when package declares all of them', () => {
            // Given: A package that declares both addons
            const pkg: DemoPackage = {
                id: 'buildright',
                name: 'BuildRight',
                description: 'Hardware demo',
                configDefaults: {},
                storefronts: {},
                addons: { 'demo-inspector': 'optional', 'adobe-commerce-aco': 'required' },
            };

            // When: Filtering stack addons by package
            const result = filterAddonsByPackage(stackAddons, pkg);

            // Then: Both addons returned
            expect(result).toHaveLength(2);
            expect(result.map(a => a.id)).toEqual(['demo-inspector', 'adobe-commerce-aco']);
        });

        it('should return all stack addons when package has no addons map', () => {
            // Given: A package without an addons field
            const pkg: DemoPackage = {
                id: 'generic',
                name: 'Generic',
                description: 'No addons specified',
                configDefaults: {},
                storefronts: {},
            };

            // When: Filtering stack addons by package
            const result = filterAddonsByPackage(stackAddons, pkg);

            // Then: All stack addons returned (no restriction)
            expect(result).toHaveLength(2);
        });

        it('should return empty array when stack has no addons', () => {
            // Given: No stack addons
            const pkg: DemoPackage = {
                id: 'citisignal',
                name: 'CitiSignal',
                description: 'Telecom',
                configDefaults: {},
                storefronts: {},
                addons: { 'demo-inspector': 'optional' },
            };

            // When: Filtering empty addons
            const result = filterAddonsByPackage([], pkg);

            // Then: Empty result
            expect(result).toHaveLength(0);
        });
    });
});
