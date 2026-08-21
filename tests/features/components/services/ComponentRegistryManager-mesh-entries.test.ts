/**
 * ComponentRegistryManager Mesh Entries Tests
 *
 * These tests validate that the components.json file correctly defines:
 * - Two separate mesh entries (EDS passthrough vs Headless prefixed)
 * - Correct GitHub repository URLs for each mesh
 * - Correct stack routing (EDS stacks use EDS mesh, Headless stacks use Headless mesh)
 * - Frontend dependencies reference correct mesh component
 */

import * as fs from 'fs';
import * as path from 'path';

// Read actual components.json for structural validation
const componentsJsonPath = path.join(
    __dirname,
    '../../../../src/features/components/config/components.json'
);
const componentsJson = JSON.parse(fs.readFileSync(componentsJsonPath, 'utf-8'));

describe('ComponentRegistryManager - Mesh Entries', () => {
    describe('mesh section structure', () => {
        it('should have both EDS and Headless mesh entries', () => {
            const meshKeys = Object.keys(componentsJson.mesh || {});

            expect(meshKeys).toContain('eds-commerce-mesh');
            expect(meshKeys).toContain('headless-commerce-mesh');
        });

        it('should NOT have the old commerce-mesh entry', () => {
            const meshKeys = Object.keys(componentsJson.mesh || {});

            expect(meshKeys).not.toContain('commerce-mesh');
        });

        it('EDS mesh should point to commerce-eds-mesh repository', () => {
            const edsMesh = componentsJson.mesh['eds-commerce-mesh'];

            expect(edsMesh).toBeDefined();
            expect(edsMesh.source?.url).toBe('https://github.com/skukla/commerce-eds-mesh');
        });

        it('Headless mesh should point to headless-commerce-mesh repository', () => {
            const headlessMesh = componentsJson.mesh['headless-commerce-mesh'];

            expect(headlessMesh).toBeDefined();
            expect(headlessMesh.source?.url).toBe(
                'https://github.com/skukla/headless-commerce-mesh'
            );
        });

        it('EDS mesh should have passthrough description mentioning EDS/dropins', () => {
            const edsMesh = componentsJson.mesh['eds-commerce-mesh'];

            expect(edsMesh.description).toMatch(/EDS|passthrough|dropin/i);
        });

        it('Headless mesh should have description mentioning prefixed/namespaced operations', () => {
            const headlessMesh = componentsJson.mesh['headless-commerce-mesh'];

            expect(headlessMesh.description).toMatch(/prefix|namespac|Next\.js/i);
        });
    });

    // No 'stack routing' describe any more: it pinned the components.json
    // `stacks` SECTION, which was a dead duplicate of stacks.json (zero
    // readers) deleted 2026-08-21. The live guarantees — mesh optional per
    // architecture, dependencies empty — are pinned against stacks.json in
    // tests/templates/stacks.test.ts, and the no-legacy-commerce-mesh sweep
    // lives in tests/integration/features/mesh/meshArchitectureRouting.test.ts.

    describe('frontend dependencies', () => {
        it('headless frontend should have empty required dependencies (mesh now optional)', () => {
            const headless = componentsJson.frontends?.headless;

            expect(headless).toBeDefined();
            expect(headless.dependencies?.required).toEqual([]);
            expect(headless.dependencies?.required).not.toContain('commerce-mesh');
        });

        it('eds-storefront frontend should not require mesh in its dependencies', () => {
            const eds = componentsJson.frontends?.['eds-storefront'];

            expect(eds).toBeDefined();
            // EDS mesh requirement comes from stack, not frontend dependency
            expect(eds.dependencies?.required || []).not.toContain('commerce-mesh');
        });
    });

    describe('no legacy references', () => {
        it('should have no references to old "commerce-mesh" in frontend dependencies', () => {
            const frontends = Object.values(componentsJson.frontends || {}) as Array<{
                dependencies?: { required?: string[]; optional?: string[] };
            }>;

            for (const frontend of frontends) {
                const allDeps = [
                    ...(frontend.dependencies?.required || []),
                    ...(frontend.dependencies?.optional || []),
                ];

                expect(allDeps).not.toContain('commerce-mesh');
            }
        });
    });
});
