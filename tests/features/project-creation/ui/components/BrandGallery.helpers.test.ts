/**
 * BrandGallery Helper Tests
 *
 * Tests for brandGalleryHelpers utility functions:
 * - filterAddonsByPackage: Blacklist filtering (show all unless explicitly excluded)
 * - sortPackages: Alphabetical sort with coming-soon packages last
 * - filterPackagesBySearchQuery: Case-insensitive name/description search
 *
 * Follows TDD methodology - tests written BEFORE implementation.
 */

import {
    filterPackagesBySearchQuery,
    filterAddonsByPackage,
    sortPackages,
} from '@/features/project-creation/ui/components/brandGalleryHelpers';
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

    describe('filterAddonsByPackage (blacklist logic)', () => {
        const stackAddons: OptionalAddon[] = [
            { id: 'commerce-block-collection' },
            { id: 'demo-inspector' },
            { id: 'adobe-commerce-aco' },
        ];

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

            // Then: All stack addons pass through (no restrictions)
            expect(result).toHaveLength(3);
            expect(result.map(a => a.id)).toEqual([
                'commerce-block-collection',
                'demo-inspector',
                'adobe-commerce-aco',
            ]);
        });

        it('should filter out addons explicitly set to excluded', () => {
            // Given: A package that excludes one addon
            const pkg: DemoPackage = {
                id: 'citisignal',
                name: 'CitiSignal',
                description: 'Telecom demo',
                configDefaults: {},
                storefronts: {},
                addons: { 'adobe-commerce-aco': 'excluded' },
            };

            // When: Filtering stack addons by package
            const result = filterAddonsByPackage(stackAddons, pkg);

            // Then: Excluded addon is removed, others pass through
            expect(result).toHaveLength(2);
            expect(result.map(a => a.id)).toEqual([
                'commerce-block-collection',
                'demo-inspector',
            ]);
        });

        it('should pass through addons marked as required', () => {
            // Given: A package with a required addon
            const pkg: DemoPackage = {
                id: 'buildright',
                name: 'BuildRight',
                description: 'Hardware demo',
                configDefaults: {},
                storefronts: {},
                addons: { 'demo-inspector': 'required' },
            };

            // When: Filtering stack addons by package
            const result = filterAddonsByPackage(stackAddons, pkg);

            // Then: Required addon passes through along with unmentioned addons
            expect(result.map(a => a.id)).toContain('demo-inspector');
        });

        it('should pass through addons marked as optional', () => {
            // Given: A package with an optional addon
            const pkg: DemoPackage = {
                id: 'citisignal',
                name: 'CitiSignal',
                description: 'Telecom demo',
                configDefaults: {},
                storefronts: {},
                addons: { 'commerce-block-collection': 'optional' },
            };

            // When: Filtering stack addons by package
            const result = filterAddonsByPackage(stackAddons, pkg);

            // Then: Optional addon passes through
            expect(result.map(a => a.id)).toContain('commerce-block-collection');
        });

        it('should pass through addons NOT mentioned in the package addons map', () => {
            // Given: A package that only mentions one addon, leaving others unmentioned
            // This is the KEY behavioral change from whitelist to blacklist
            const pkg: DemoPackage = {
                id: 'buildright',
                name: 'BuildRight',
                description: 'Hardware demo',
                configDefaults: {},
                storefronts: {},
                addons: { 'demo-inspector': 'optional' },
            };

            // When: Filtering stack addons by package
            const result = filterAddonsByPackage(stackAddons, pkg);

            // Then: Unmentioned addons ALSO pass through (blacklist, not whitelist)
            expect(result).toHaveLength(3);
            expect(result.map(a => a.id)).toContain('commerce-block-collection');
            expect(result.map(a => a.id)).toContain('adobe-commerce-aco');
        });

        it('should correctly filter a mix of excluded and non-excluded addons', () => {
            // Given: A package with a mix of excluded, required, optional, and unmentioned
            const pkg: DemoPackage = {
                id: 'mixed',
                name: 'Mixed Brand',
                description: 'Mixed config',
                configDefaults: {},
                storefronts: {},
                addons: {
                    'commerce-block-collection': 'required',
                    'demo-inspector': 'excluded',
                    // adobe-commerce-aco not mentioned
                },
            };

            // When: Filtering stack addons by package
            const result = filterAddonsByPackage(stackAddons, pkg);

            // Then: Only excluded addon removed; required and unmentioned pass
            expect(result).toHaveLength(2);
            expect(result.map(a => a.id)).toEqual([
                'commerce-block-collection',
                'adobe-commerce-aco',
            ]);
        });

        it('should return empty array when stack has no addons', () => {
            // Given: No stack addons available
            const pkg: DemoPackage = {
                id: 'citisignal',
                name: 'CitiSignal',
                description: 'Telecom',
                configDefaults: {},
                storefronts: {},
                addons: { 'demo-inspector': 'optional' },
            };

            // When: Filtering empty stack addons
            const result = filterAddonsByPackage([], pkg);

            // Then: Empty result regardless of package config
            expect(result).toHaveLength(0);
        });

        it('should return empty array when all addons are excluded', () => {
            // Given: A package that excludes every stack addon
            const pkg: DemoPackage = {
                id: 'minimal',
                name: 'Minimal',
                description: 'No addons wanted',
                configDefaults: {},
                storefronts: {},
                addons: {
                    'commerce-block-collection': 'excluded',
                    'demo-inspector': 'excluded',
                    'adobe-commerce-aco': 'excluded',
                },
            };

            // When: Filtering stack addons by package
            const result = filterAddonsByPackage(stackAddons, pkg);

            // Then: All excluded, nothing passes through
            expect(result).toHaveLength(0);
        });
    });

    describe('sortPackages', () => {
        it('should sort packages alphabetically by name', () => {
            // Given: Unsorted packages
            const packages: DemoPackage[] = [
                { id: 'c', name: 'Zebra Co', description: '', configDefaults: {}, storefronts: {} },
                { id: 'a', name: 'Alpha Inc', description: '', configDefaults: {}, storefronts: {} },
                { id: 'b', name: 'Middle Corp', description: '', configDefaults: {}, storefronts: {} },
            ];

            // When: Sorting packages
            const result = sortPackages(packages);

            // Then: Sorted alphabetically by name
            expect(result.map(p => p.name)).toEqual(['Alpha Inc', 'Middle Corp', 'Zebra Co']);
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

        it('should return empty array for empty input', () => {
            // Given: No packages
            const result = sortPackages([]);

            // Then: Empty result
            expect(result).toEqual([]);
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
