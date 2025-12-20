/**
 * Stacks Configuration Tests
 *
 * TDD: Tests written FIRST to define behavior before implementation.
 *
 * This test suite validates the stacks.json configuration file
 * which defines frontend + backend architecture combinations (Headless, Edge Delivery).
 */

import * as fs from 'fs';
import * as path from 'path';

describe('stacks.json', () => {
    let stacksConfig: Record<string, unknown>;
    let componentsConfig: Record<string, unknown>;

    beforeAll(() => {
        const stacksPath = path.join(__dirname, '../../templates/stacks.json');
        const componentsPath = path.join(__dirname, '../../templates/components.json');
        stacksConfig = JSON.parse(fs.readFileSync(stacksPath, 'utf-8'));
        componentsConfig = JSON.parse(fs.readFileSync(componentsPath, 'utf-8'));
    });

    describe('structure validation', () => {
        it('should have required version field', () => {
            expect(stacksConfig.version).toBeDefined();
            expect(typeof stacksConfig.version).toBe('string');
        });

        it('should have stacks array with at least 2 stacks', () => {
            const stacks = stacksConfig.stacks as Array<Record<string, unknown>>;
            expect(Array.isArray(stacks)).toBe(true);
            expect(stacks.length).toBeGreaterThanOrEqual(2);
        });

        it('should have $schema reference', () => {
            expect(stacksConfig.$schema).toBe('./stacks.schema.json');
        });
    });

    describe('headless-paas stack', () => {
        it('should exist', () => {
            const stacks = stacksConfig.stacks as Array<Record<string, unknown>>;
            const headless = stacks.find(s => s.id === 'headless-paas');
            expect(headless).toBeDefined();
        });

        it('should use NextJS frontend and PaaS backend', () => {
            const stacks = stacksConfig.stacks as Array<Record<string, unknown>>;
            const headless = stacks.find(s => s.id === 'headless-paas');
            expect(headless?.frontend).toBe('citisignal-nextjs');
            expect(headless?.backend).toBe('adobe-commerce-paas');
        });

        it('should include commerce-mesh dependency', () => {
            const stacks = stacksConfig.stacks as Array<Record<string, unknown>>;
            const headless = stacks.find(s => s.id === 'headless-paas');
            const deps = headless?.dependencies as string[];
            expect(deps).toContain('commerce-mesh');
        });

        it('should have features array', () => {
            const stacks = stacksConfig.stacks as Array<Record<string, unknown>>;
            const headless = stacks.find(s => s.id === 'headless-paas');
            expect(Array.isArray(headless?.features)).toBe(true);
            expect((headless?.features as string[]).length).toBeGreaterThan(0);
        });

        it('should have name and description', () => {
            const stacks = stacksConfig.stacks as Array<Record<string, unknown>>;
            const headless = stacks.find(s => s.id === 'headless-paas');
            expect(headless?.name).toBe('Headless + PaaS');
            expect(headless?.description).toBeDefined();
        });
    });

    describe('eds-accs stack', () => {
        it('should exist', () => {
            const stacks = stacksConfig.stacks as Array<Record<string, unknown>>;
            const eds = stacks.find(s => s.id === 'eds-accs');
            expect(eds).toBeDefined();
        });

        it('should use EDS frontend and ACCS backend', () => {
            const stacks = stacksConfig.stacks as Array<Record<string, unknown>>;
            const eds = stacks.find(s => s.id === 'eds-accs');
            expect(eds?.frontend).toBe('eds-citisignal-storefront');
            expect(eds?.backend).toBe('adobe-commerce-accs');
        });

        it('should NOT include commerce-mesh dependency', () => {
            const stacks = stacksConfig.stacks as Array<Record<string, unknown>>;
            const eds = stacks.find(s => s.id === 'eds-accs');
            const deps = eds?.dependencies as string[];
            expect(deps).not.toContain('commerce-mesh');
        });

        it('should require GitHub OAuth', () => {
            const stacks = stacksConfig.stacks as Array<Record<string, unknown>>;
            const eds = stacks.find(s => s.id === 'eds-accs');
            expect(eds?.requiresGitHub).toBe(true);
        });

        it('should require DA.live access', () => {
            const stacks = stacksConfig.stacks as Array<Record<string, unknown>>;
            const eds = stacks.find(s => s.id === 'eds-accs');
            expect(eds?.requiresDaLive).toBe(true);
        });

        it('should have features array', () => {
            const stacks = stacksConfig.stacks as Array<Record<string, unknown>>;
            const eds = stacks.find(s => s.id === 'eds-accs');
            expect(Array.isArray(eds?.features)).toBe(true);
            expect((eds?.features as string[]).length).toBeGreaterThan(0);
        });
    });

    describe('component references', () => {
        it('should reference valid frontend components (except eds-citisignal-storefront which is added later)', () => {
            const stacks = stacksConfig.stacks as Array<Record<string, unknown>>;
            const components = componentsConfig.components as Record<string, unknown>;

            stacks.forEach(stack => {
                const frontend = stack.frontend as string;
                // eds-citisignal-storefront will be added in Step 4, skip validation for now
                if (frontend !== 'eds-citisignal-storefront') {
                    expect(components).toHaveProperty(frontend);
                }
            });
        });

        it('should reference valid backend components', () => {
            const stacks = stacksConfig.stacks as Array<Record<string, unknown>>;
            const components = componentsConfig.components as Record<string, unknown>;

            stacks.forEach(stack => {
                const backend = stack.backend as string;
                expect(components).toHaveProperty(backend);
            });
        });

        it('should reference valid dependency components (except those added later)', () => {
            const stacks = stacksConfig.stacks as Array<Record<string, unknown>>;
            const components = componentsConfig.components as Record<string, unknown>;

            stacks.forEach(stack => {
                const deps = stack.dependencies as string[];
                deps.forEach(dep => {
                    // demo-inspector is a valid component
                    expect(components).toHaveProperty(dep);
                });
            });
        });
    });

    describe('all stacks', () => {
        it('should have unique IDs', () => {
            const stacks = stacksConfig.stacks as Array<Record<string, unknown>>;
            const ids = stacks.map(s => s.id);
            const uniqueIds = new Set(ids);
            expect(uniqueIds.size).toBe(ids.length);
        });

        it('should all have required fields (id, name, description, frontend, backend, dependencies)', () => {
            const stacks = stacksConfig.stacks as Array<Record<string, unknown>>;
            stacks.forEach(stack => {
                expect(stack.id).toBeDefined();
                expect(stack.name).toBeDefined();
                expect(stack.description).toBeDefined();
                expect(stack.frontend).toBeDefined();
                expect(stack.backend).toBeDefined();
                expect(stack.dependencies).toBeDefined();
                expect(Array.isArray(stack.dependencies)).toBe(true);
            });
        });
    });
});
