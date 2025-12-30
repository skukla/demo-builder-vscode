import { getPluginNodeVersions, NodeVersionMapping } from '@/features/prerequisites/handlers/shared';

/**
 * Prerequisites Handlers - Plugin Node Version Filtering Test Suite
 *
 * Tests the getPluginNodeVersions utility function.
 * This function filters Node versions based on which components require a plugin.
 *
 * Total tests: 11
 */

describe('Prerequisites Handlers - getPluginNodeVersions', () => {
    describe('core functionality', () => {
        it('should return Node versions for components in requiredFor array', () => {
            // Given: A mapping with one component and a requiredFor list containing that component
            const mapping: NodeVersionMapping = { '18': 'eds', '20': 'commerce-paas' };
            const requiredFor = ['eds'];

            // When: Getting plugin Node versions
            const result = getPluginNodeVersions(mapping, requiredFor);

            // Then: Should return only the Node version for the matching component
            expect(result).toEqual(['18']);
        });

        it('should return multiple Node versions when multiple components match', () => {
            // Given: A mapping with multiple components that are in the requiredFor list
            const mapping: NodeVersionMapping = { '18': 'eds', '20': 'commerce-paas', '24': 'headless' };
            const requiredFor = ['eds', 'commerce-paas'];

            // When: Getting plugin Node versions
            const result = getPluginNodeVersions(mapping, requiredFor);

            // Then: Should return Node versions for all matching components
            expect(result).toEqual(['18', '20']);
        });

        it('should return empty array when no components match requiredFor', () => {
            // Given: A mapping where no components match the requiredFor list
            const mapping: NodeVersionMapping = { '18': 'eds', '20': 'commerce-paas' };
            const requiredFor = ['non-existent'];

            // When: Getting plugin Node versions
            const result = getPluginNodeVersions(mapping, requiredFor);

            // Then: Should return an empty array
            expect(result).toEqual([]);
        });
    });

    describe('dependency handling', () => {
        it('should return empty when dependency not directly in mapping', () => {
            // Given: A dependency that is in requiredFor but not in the nodeVersionMapping
            const mapping: NodeVersionMapping = { '20': 'commerce-paas' };
            const requiredFor = ['commerce-mesh'];
            const dependencies = ['commerce-mesh'];

            // When: Getting plugin Node versions
            const result = getPluginNodeVersions(mapping, requiredFor, dependencies);

            // Then: Should return empty because the dependency isn't mapped to a Node version
            expect(result).toEqual([]);
        });

        it('should find Node version for dependencies that exist in mapping', () => {
            // Given: A dependency that exists in both requiredFor and nodeVersionMapping
            const mapping: NodeVersionMapping = { '18': 'eds', '20': 'commerce-mesh' };
            const requiredFor = ['commerce-mesh'];
            const dependencies = ['commerce-mesh'];

            // When: Getting plugin Node versions
            const result = getPluginNodeVersions(mapping, requiredFor, dependencies);

            // Then: Should return the Node version for the dependency
            expect(result).toEqual(['20']);
        });

        it('should combine direct and dependency matches without duplicates', () => {
            // Given: A component that appears in both nodeVersionMapping and dependencies
            const mapping: NodeVersionMapping = { '20': 'commerce-paas' };
            const requiredFor = ['commerce-paas'];
            const dependencies = ['commerce-paas'];

            // When: Getting plugin Node versions
            const result = getPluginNodeVersions(mapping, requiredFor, dependencies);

            // Then: Should return the version only once (no duplicates)
            expect(result).toEqual(['20']);
        });
    });

    describe('edge cases', () => {
        it('should handle empty nodeVersionMapping gracefully', () => {
            // Given: An empty nodeVersionMapping
            const mapping: NodeVersionMapping = {};
            const requiredFor = ['eds'];

            // When: Getting plugin Node versions
            const result = getPluginNodeVersions(mapping, requiredFor);

            // Then: Should return an empty array
            expect(result).toEqual([]);
        });

        it('should handle empty requiredFor array', () => {
            // Given: An empty requiredFor array
            const mapping: NodeVersionMapping = { '18': 'eds' };
            const requiredFor: string[] = [];

            // When: Getting plugin Node versions
            const result = getPluginNodeVersions(mapping, requiredFor);

            // Then: Should return an empty array (no components require the plugin)
            expect(result).toEqual([]);
        });

        it('should handle undefined dependencies parameter', () => {
            // Given: A valid mapping and requiredFor, but undefined dependencies
            const mapping: NodeVersionMapping = { '18': 'eds' };
            const requiredFor = ['eds'];

            // When: Getting plugin Node versions with undefined dependencies
            const result = getPluginNodeVersions(mapping, requiredFor, undefined);

            // Then: Should still work correctly with direct matches
            expect(result).toEqual(['18']);
        });

        it('should handle empty dependencies array', () => {
            // Given: A valid mapping and requiredFor, but empty dependencies array
            const mapping: NodeVersionMapping = { '18': 'eds' };
            const requiredFor = ['eds'];

            // When: Getting plugin Node versions with empty dependencies
            const result = getPluginNodeVersions(mapping, requiredFor, []);

            // Then: Should still work correctly with direct matches
            expect(result).toEqual(['18']);
        });

        it('should not return duplicate versions', () => {
            // Given: A scenario where both direct match and dependency would find same version
            const mapping: NodeVersionMapping = { '20': 'commerce-paas' };
            const requiredFor = ['commerce-paas'];
            const dependencies = ['commerce-paas'];

            // When: Getting plugin Node versions
            const result = getPluginNodeVersions(mapping, requiredFor, dependencies);

            // Then: Should return the version only once
            expect(result).toEqual(['20']);
            expect(result.length).toBe(1);
        });
    });
});
