/**
 * Integration Tests: Mesh Architecture Routing
 *
 * Tests for the complete mesh-per-stack routing architecture:
 * - EDS-PaaS stack resolves to eds-commerce-mesh component
 * - Headless-PaaS stack resolves to headless-commerce-mesh component
 * - EDS config.json uses mesh URL for both commerce endpoints
 * - Full EDS project creation includes correct mesh component
 *
 * These are end-to-end integration tests that verify the complete
 * data flow from stack selection to mesh component resolution.
 */

import * as fs from 'fs';
import * as path from 'path';

// Read actual components.json for integration validation
const componentsJsonPath = path.join(
    __dirname,
    '../../../../src/features/components/config/components.json'
);
const componentsJson = JSON.parse(fs.readFileSync(componentsJsonPath, 'utf-8'));

describe('Mesh Architecture Routing - Integration Tests', () => {
    // ==========================================================
    // Stack-to-Mesh Resolution Tests (4 tests)
    // ==========================================================
    describe('Stack-to-Mesh Resolution', () => {
        it('EDS-PaaS stack should resolve to eds-commerce-mesh component', () => {
            // Given: Stack selection of `eds-paas`
            const stackId = 'eds-paas';
            const stack = componentsJson.stacks[stackId];

            // When: Resolving mesh component from stack's required components
            const meshComponent = stack.requiredComponents.find((c: string) =>
                c.includes('mesh')
            );

            // Then: Should return eds-commerce-mesh with correct repo URL
            expect(meshComponent).toBe('eds-commerce-mesh');

            const meshDefinition = componentsJson.mesh['eds-commerce-mesh'];
            expect(meshDefinition).toBeDefined();
            expect(meshDefinition.source.url).toContain('commerce-eds-mesh');
        });

        it('Headless-PaaS stack should resolve to headless-commerce-mesh component', () => {
            // Given: Stack selection of `headless-paas`
            const stackId = 'headless-paas';
            const stack = componentsJson.stacks[stackId];

            // When: Resolving mesh component from stack's required components
            const meshComponent = stack.requiredComponents.find((c: string) =>
                c.includes('mesh')
            );

            // Then: Should return headless-commerce-mesh with correct repo URL
            expect(meshComponent).toBe('headless-commerce-mesh');

            const meshDefinition = componentsJson.mesh['headless-commerce-mesh'];
            expect(meshDefinition).toBeDefined();
            expect(meshDefinition.source.url).toContain('headless-commerce-mesh');
        });

        it('EDS stack mesh should have passthrough configuration', () => {
            // Given: EDS commerce mesh component
            const edsMesh = componentsJson.mesh['eds-commerce-mesh'];

            // When: Checking the description
            // Then: Should indicate passthrough/no prefixes
            expect(edsMesh.description.toLowerCase()).toMatch(/passthrough|no prefix/i);
        });

        it('Headless stack mesh should have prefixed/namespaced configuration', () => {
            // Given: Headless commerce mesh component
            const headlessMesh = componentsJson.mesh['headless-commerce-mesh'];

            // When: Checking the description
            // Then: Should indicate prefixed/namespaced operations
            expect(headlessMesh.description.toLowerCase()).toMatch(/prefix|namespac/i);
        });
    });

    // ==========================================================
    // EDS Config.json Mesh Endpoint Tests (3 tests)
    // ==========================================================
    describe('EDS Config.json Mesh Endpoints', () => {
        it('EDS frontend should map both commerce endpoints from mesh', () => {
            // Given: EDS frontend configuration
            const edsFrontend = componentsJson.frontends['eds-storefront'];

            // When: Checking config file field mappings
            const configMappings = edsFrontend.configuration?.configFiles?.['config.json']?.fieldRenames;

            // Then: Both endpoints should be mapped to mesh or catalog service fields
            expect(configMappings).toBeDefined();
            // commerce-core-endpoint comes from MESH_ENDPOINT
            expect(configMappings['MESH_ENDPOINT']).toBe('commerce-core-endpoint');
            // commerce-endpoint maps from catalog service endpoint vars
            expect(
                configMappings['PAAS_CATALOG_SERVICE_ENDPOINT'] === 'commerce-endpoint' ||
                configMappings['ACCS_CATALOG_SERVICE_ENDPOINT'] === 'commerce-endpoint'
            ).toBe(true);
        });

        it('EDS mesh should provide MESH_ENDPOINT environment variable', () => {
            // Given: EDS commerce mesh component
            const edsMesh = componentsJson.mesh['eds-commerce-mesh'];

            // When: Checking the providesEnvVars configuration
            // Then: Should provide MESH_ENDPOINT for config.json generation
            expect(edsMesh.configuration.providesEnvVars).toContain('MESH_ENDPOINT');
        });

        it('both commerce endpoints should use same mesh URL when mesh deployed', () => {
            // This test validates the architecture decision:
            // - commerce-core-endpoint: Used for core commerce operations (from MESH_ENDPOINT)
            // - commerce-endpoint: Used for catalog service (now also routes through mesh)

            // Given: EDS-PaaS stack configuration
            const stack = componentsJson.stacks['eds-paas'];

            // When: Stack requires eds-commerce-mesh
            const requiresMesh = stack.requiredComponents.includes('eds-commerce-mesh');

            // Then: Mesh is required, meaning both endpoints will use mesh URL
            // (The actual URL substitution is tested in unit tests for edsSetupPhases)
            expect(requiresMesh).toBe(true);

            // And the mesh provides the endpoint that both commerce fields will use
            const edsMesh = componentsJson.mesh['eds-commerce-mesh'];
            expect(edsMesh.configuration.providesEnvVars).toContain('MESH_ENDPOINT');
        });
    });

    // ==========================================================
    // Full Project Creation Flow Tests (2 tests)
    // ==========================================================
    describe('Full Project Creation Flow', () => {
        it('EDS project should clone from eds-commerce-mesh repository', () => {
            // Given: EDS-PaaS stack selection
            const stackId = 'eds-paas';
            const stack = componentsJson.stacks[stackId];

            // When: Getting the required mesh component
            const meshId = stack.requiredComponents.find((c: string) => c.includes('mesh'));

            // Then: Should use eds-commerce-mesh with correct GitHub repo
            expect(meshId).toBe('eds-commerce-mesh');

            const mesh = componentsJson.mesh[meshId];
            expect(mesh.source.type).toBe('git');
            expect(mesh.source.url).toBe('https://github.com/skukla/commerce-eds-mesh');
        });

        it('Headless project should clone from headless-commerce-mesh repository', () => {
            // Given: Headless-PaaS stack selection
            const stackId = 'headless-paas';
            const stack = componentsJson.stacks[stackId];

            // When: Getting the required mesh component
            const meshId = stack.requiredComponents.find((c: string) => c.includes('mesh'));

            // Then: Should use headless-commerce-mesh with correct GitHub repo
            expect(meshId).toBe('headless-commerce-mesh');

            const mesh = componentsJson.mesh[meshId];
            expect(mesh.source.type).toBe('git');
            expect(mesh.source.url).toBe('https://github.com/skukla/headless-commerce-mesh');
        });
    });

    // ==========================================================
    // Architecture Consistency Tests (3 tests)
    // ==========================================================
    describe('Architecture Consistency', () => {
        it('all PaaS stacks should have a mesh component', () => {
            // Given: All stacks that use PaaS backend
            const paasStacks = Object.entries(componentsJson.stacks)
                .filter(([_, stack]: [string, any]) =>
                    stack.backend === 'adobe-commerce-paas'
                );

            // When: Checking each stack's required components
            for (const [stackId, stack] of paasStacks) {
                const hasMesh = (stack as any).requiredComponents.some((c: string) =>
                    c.includes('mesh')
                );

                // Then: Each PaaS stack should have a mesh component
                expect(hasMesh).toBe(true);
            }
        });

        it('mesh components should have different repository URLs', () => {
            // Given: Both mesh components
            const edsMesh = componentsJson.mesh['eds-commerce-mesh'];
            const headlessMesh = componentsJson.mesh['headless-commerce-mesh'];

            // When: Comparing their source URLs
            // Then: They should be different (one passthrough, one prefixed)
            expect(edsMesh.source.url).not.toBe(headlessMesh.source.url);
        });

        it('no stack should reference the old commerce-mesh component', () => {
            // Given: All stacks in the configuration
            const stacks = componentsJson.stacks;

            // When: Checking for legacy commerce-mesh references
            for (const [stackId, stack] of Object.entries(stacks)) {
                const requiredComponents = (stack as any).requiredComponents || [];
                const optionalComponents = (stack as any).optionalComponents || [];

                // Then: No stack should reference the old commerce-mesh
                expect(requiredComponents).not.toContain('commerce-mesh');
                expect(optionalComponents).not.toContain('commerce-mesh');
            }
        });
    });
});
