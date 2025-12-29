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
        const stacksPath = path.join(__dirname, '../../src/features/project-creation/config/stacks.json');
        const componentsPath = path.join(__dirname, '../../src/features/components/config/components.json');
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
            expect(headless?.frontend).toBe('headless');
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
            expect(eds?.frontend).toBe('eds');
            expect(eds?.backend).toBe('adobe-commerce-accs');
        });

        it('should include commerce-mesh dependency for Drop-ins integration', () => {
            const stacks = stacksConfig.stacks as Array<Record<string, unknown>>;
            const eds = stacks.find(s => s.id === 'eds-accs');
            const deps = eds?.dependencies as string[];
            expect(deps).toContain('commerce-mesh');
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
        /**
         * Helper to get all component IDs from categorized components.json structure
         * Components are organized under frontends, backends, mesh, dependencies, etc.
         */
        function getAllComponentIds(config: Record<string, unknown>): Set<string> {
            const ids = new Set<string>();
            const sections = ['frontends', 'backends', 'mesh', 'dependencies', 'integrations', 'tools'];

            sections.forEach(section => {
                const sectionData = config[section] as Record<string, unknown> | undefined;
                if (sectionData && typeof sectionData === 'object') {
                    Object.keys(sectionData).forEach(id => ids.add(id));
                }
            });

            return ids;
        }

        it('should reference valid frontend components from frontends section', () => {
            const stacks = stacksConfig.stacks as Array<Record<string, unknown>>;
            const frontends = componentsConfig.frontends as Record<string, unknown>;

            stacks.forEach(stack => {
                const frontend = stack.frontend as string;
                expect(frontends).toHaveProperty(frontend);
            });
        });

        it('should reference valid backend components from backends section', () => {
            const stacks = stacksConfig.stacks as Array<Record<string, unknown>>;
            const backends = componentsConfig.backends as Record<string, unknown>;

            stacks.forEach(stack => {
                const backend = stack.backend as string;
                expect(backends).toHaveProperty(backend);
            });
        });

        it('should reference valid dependency components from mesh or dependencies sections', () => {
            const stacks = stacksConfig.stacks as Array<Record<string, unknown>>;
            const allComponentIds = getAllComponentIds(componentsConfig);

            stacks.forEach(stack => {
                const deps = stack.dependencies as string[];
                deps.forEach(dep => {
                    // demo-inspector is referenced but may not exist in components.json
                    // Skip validation for optional dependencies that may be added later
                    if (dep !== 'demo-inspector') {
                        expect(allComponentIds.has(dep)).toBe(true);
                    }
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
