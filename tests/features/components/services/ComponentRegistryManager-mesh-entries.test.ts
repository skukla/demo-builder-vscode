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
            expect(headlessMesh.source?.url).toBe('https://github.com/skukla/headless-commerce-mesh');
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

    describe('stack routing', () => {
        it('eds-paas stack should require eds-commerce-mesh', () => {
            const stack = componentsJson.stacks['eds-paas'];

            expect(stack).toBeDefined();
            expect(stack.requiredComponents).toContain('eds-commerce-mesh');
            expect(stack.requiredComponents).not.toContain('commerce-mesh');
            expect(stack.requiredComponents).not.toContain('headless-commerce-mesh');
        });

        it('eds-accs stack should require no mesh (ACCS has built-in catalog)', () => {
            const stack = componentsJson.stacks['eds-accs'];

            expect(stack).toBeDefined();
            expect(stack.requiredComponents).toEqual([]);
        });

        it('headless-paas stack should require headless-commerce-mesh', () => {
            const stack = componentsJson.stacks['headless-paas'];

            expect(stack).toBeDefined();
            expect(stack.requiredComponents).toContain('headless-commerce-mesh');
            expect(stack.requiredComponents).not.toContain('commerce-mesh');
            expect(stack.requiredComponents).not.toContain('eds-commerce-mesh');
        });
    });

    describe('frontend dependencies', () => {
        it('headless frontend should depend on headless-commerce-mesh', () => {
            const headless = componentsJson.frontends?.headless;

            expect(headless).toBeDefined();
            expect(headless.dependencies?.required).toContain('headless-commerce-mesh');
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
        it('should have no references to old "commerce-mesh" in stacks', () => {
            const stacks = Object.values(componentsJson.stacks || {}) as Array<{
                requiredComponents?: string[];
                optionalComponents?: string[];
            }>;

            for (const stack of stacks) {
                const allComponents = [
                    ...(stack.requiredComponents || []),
                    ...(stack.optionalComponents || []),
                ];

                expect(allComponents).not.toContain('commerce-mesh');
            }
        });

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
