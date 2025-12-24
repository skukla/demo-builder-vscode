/**
 * Templates Configuration Tests
 *
 * TDD: Tests written FIRST to define behavior before implementation.
 *
 * This test suite validates the templates.json configuration file
 * which defines pre-configured demo templates combining stacks and brands.
 *
 * Key validations:
 * - Structure validation (required fields, types)
 * - Cross-reference validation (stack IDs exist in stacks.json)
 * - Cross-reference validation (brand IDs exist in brands.json)
 * - Git source validation (valid URLs, branches, gitOptions)
 * - Submodules validation (valid path and repository)
 */

import * as fs from 'fs';
import * as path from 'path';

describe('templates.json', () => {
    let templatesConfig: Record<string, unknown>;
    let stacksConfig: Record<string, unknown>;
    let brandsConfig: Record<string, unknown>;

    beforeAll(() => {
        const templatesPath = path.join(__dirname, '../../templates/templates.json');
        const stacksPath = path.join(__dirname, '../../templates/stacks.json');
        const brandsPath = path.join(__dirname, '../../templates/brands.json');

        templatesConfig = JSON.parse(fs.readFileSync(templatesPath, 'utf-8'));
        stacksConfig = JSON.parse(fs.readFileSync(stacksPath, 'utf-8'));
        brandsConfig = JSON.parse(fs.readFileSync(brandsPath, 'utf-8'));
    });

    describe('structure validation', () => {
        it('should have $schema reference', () => {
            expect(templatesConfig.$schema).toBe('./templates.schema.json');
        });

        it('should have required version field', () => {
            expect(templatesConfig.version).toBeDefined();
            expect(typeof templatesConfig.version).toBe('string');
        });

        it('should have templates array with at least 1 template', () => {
            const templates = templatesConfig.templates as Array<Record<string, unknown>>;
            expect(Array.isArray(templates)).toBe(true);
            expect(templates.length).toBeGreaterThanOrEqual(1);
        });

        it('should have unique IDs', () => {
            const templates = templatesConfig.templates as Array<Record<string, unknown>>;
            const ids = templates.map(t => t.id);
            const uniqueIds = new Set(ids);
            expect(uniqueIds.size).toBe(ids.length);
        });
    });

    describe('all templates', () => {
        it('should have required fields (id, name, description, stack, brand, source)', () => {
            const templates = templatesConfig.templates as Array<Record<string, unknown>>;
            templates.forEach(template => {
                expect(template.id).toBeDefined();
                expect(template.name).toBeDefined();
                expect(template.description).toBeDefined();
                expect(template.stack).toBeDefined();
                expect(template.brand).toBeDefined();
                expect(template.source).toBeDefined();
            });
        });
    });

    describe('cross-reference validation', () => {
        it('should reference valid stacks from stacks.json', () => {
            const templates = templatesConfig.templates as Array<Record<string, unknown>>;
            const stacks = stacksConfig.stacks as Array<Record<string, unknown>>;
            const validStackIds = new Set(stacks.map(s => s.id));

            templates.forEach(template => {
                const stackId = template.stack as string;
                expect(validStackIds.has(stackId)).toBe(true);
            });
        });

        it('should reference valid brands from brands.json', () => {
            const templates = templatesConfig.templates as Array<Record<string, unknown>>;
            const brands = brandsConfig.brands as Array<Record<string, unknown>>;
            const validBrandIds = new Set(brands.map(b => b.id));

            templates.forEach(template => {
                const brandId = template.brand as string;
                expect(validBrandIds.has(brandId)).toBe(true);
            });
        });
    });

    describe('git source validation', () => {
        it('should have source.type equal to "git"', () => {
            const templates = templatesConfig.templates as Array<Record<string, unknown>>;
            templates.forEach(template => {
                const source = template.source as Record<string, unknown>;
                expect(source.type).toBe('git');
            });
        });

        it('should have valid GitHub URL in source.url', () => {
            const templates = templatesConfig.templates as Array<Record<string, unknown>>;
            templates.forEach(template => {
                const source = template.source as Record<string, unknown>;
                const url = source.url as string;
                expect(url).toMatch(/^https:\/\/github\.com\//);
            });
        });

        it('should have source.branch defined', () => {
            const templates = templatesConfig.templates as Array<Record<string, unknown>>;
            templates.forEach(template => {
                const source = template.source as Record<string, unknown>;
                expect(source.branch).toBeDefined();
                expect(typeof source.branch).toBe('string');
                expect((source.branch as string).length).toBeGreaterThan(0);
            });
        });

        it('should have gitOptions with shallow and recursive booleans', () => {
            const templates = templatesConfig.templates as Array<Record<string, unknown>>;
            templates.forEach(template => {
                const source = template.source as Record<string, unknown>;
                const gitOptions = source.gitOptions as Record<string, unknown>;
                expect(gitOptions).toBeDefined();
                expect(typeof gitOptions.shallow).toBe('boolean');
                expect(typeof gitOptions.recursive).toBe('boolean');
            });
        });
    });

    describe('featured templates', () => {
        it('should have at least one featured template', () => {
            const templates = templatesConfig.templates as Array<Record<string, unknown>>;
            const featuredTemplates = templates.filter(t => t.featured === true);
            expect(featuredTemplates.length).toBeGreaterThanOrEqual(1);
        });

        it('should have boolean featured field when present', () => {
            const templates = templatesConfig.templates as Array<Record<string, unknown>>;
            templates.forEach(template => {
                if (template.featured !== undefined) {
                    expect(typeof template.featured).toBe('boolean');
                }
            });
        });
    });

    describe('citisignal-headless template', () => {
        it('should exist', () => {
            const templates = templatesConfig.templates as Array<Record<string, unknown>>;
            const citisignalHeadless = templates.find(t => t.id === 'citisignal-headless');
            expect(citisignalHeadless).toBeDefined();
        });

        it('should have correct stack and brand', () => {
            const templates = templatesConfig.templates as Array<Record<string, unknown>>;
            const citisignalHeadless = templates.find(t => t.id === 'citisignal-headless');
            expect(citisignalHeadless?.stack).toBe('headless-paas');
            expect(citisignalHeadless?.brand).toBe('citisignal');
        });

        it('should be featured', () => {
            const templates = templatesConfig.templates as Array<Record<string, unknown>>;
            const citisignalHeadless = templates.find(t => t.id === 'citisignal-headless');
            expect(citisignalHeadless?.featured).toBe(true);
        });

        it('should have submodules defined', () => {
            const templates = templatesConfig.templates as Array<Record<string, unknown>>;
            const citisignalHeadless = templates.find(t => t.id === 'citisignal-headless');
            expect(citisignalHeadless?.submodules).toBeDefined();

            const submodules = citisignalHeadless?.submodules as Record<string, Record<string, string>>;
            expect(submodules['demo-inspector']).toBeDefined();
            expect(submodules['demo-inspector'].path).toBe('src/demo-inspector');
            expect(submodules['demo-inspector'].repository).toBe('skukla/demo-inspector');
        });
    });

    describe('submodules validation', () => {
        it('should have valid path and repository for all submodules', () => {
            const templates = templatesConfig.templates as Array<Record<string, unknown>>;

            templates.forEach(template => {
                if (template.submodules) {
                    const submodules = template.submodules as Record<string, Record<string, string>>;
                    Object.entries(submodules).forEach(([name, config]) => {
                        expect(config.path).toBeDefined();
                        expect(typeof config.path).toBe('string');
                        expect(config.repository).toBeDefined();
                        expect(typeof config.repository).toBe('string');
                    });
                }
            });
        });
    });
});
