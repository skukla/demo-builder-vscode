/**
 * Template Loader Tests
 *
 * Tests for loading and validating demo templates from templates.json.
 * Updated to validate the new vertical stack architecture:
 * - stack: Reference to stacks.json
 * - brand: Reference to brands.json
 * - source: Git configuration for cloning
 */

import { loadDemoTemplates, validateTemplate } from '@/features/project-creation/ui/helpers/templateLoader';
import type { DemoTemplate, TemplateValidationResult } from '@/types/templates';

describe('templateLoader', () => {
    describe('loadDemoTemplates', () => {
        it('should load templates from templates.json', async () => {
            // Given: The template loader is called
            // When: Loading templates
            const templates = await loadDemoTemplates();

            // Then: Should return an array of templates
            expect(templates).toBeDefined();
            expect(Array.isArray(templates)).toBe(true);
        });

        it('should return at least one template', async () => {
            // Given: The templates file exists with at least one template
            // When: Loading templates
            const templates = await loadDemoTemplates();

            // Then: Should have at least one template
            expect(templates.length).toBeGreaterThanOrEqual(1);
        });

        it('should have a CitiSignal template defined', async () => {
            // Given: The initial template configuration includes CitiSignal
            // When: Loading templates
            const templates = await loadDemoTemplates();

            // Then: Should have a CitiSignal template
            const citisignalTemplate = templates.find(t => t.id.includes('citisignal'));
            expect(citisignalTemplate).toBeDefined();
            expect(citisignalTemplate?.name).toContain('CitiSignal');
        });

        it('should ensure each template has required properties', async () => {
            // Given: Templates are loaded from the JSON file
            // When: Checking each template
            const templates = await loadDemoTemplates();

            // Then: Each template should have required properties
            templates.forEach((template) => {
                expect(template.id).toBeDefined();
                expect(typeof template.id).toBe('string');
                expect(template.id.length).toBeGreaterThan(0);

                expect(template.name).toBeDefined();
                expect(typeof template.name).toBe('string');
                expect(template.name.length).toBeGreaterThan(0);

                expect(template.description).toBeDefined();
                expect(typeof template.description).toBe('string');

                // New structure: stack, brand, source
                expect(template.stack).toBeDefined();
                expect(typeof template.stack).toBe('string');

                expect(template.brand).toBeDefined();
                expect(typeof template.brand).toBe('string');

                expect(template.source).toBeDefined();
                expect(typeof template.source).toBe('object');
            });
        });

        it('should ensure template source has required git properties', async () => {
            // Given: Templates are loaded with proper source configuration
            // When: Checking template source structure
            const templates = await loadDemoTemplates();

            // Then: Each template's source should have required git properties
            templates.forEach(template => {
                const source = template.source;
                expect(source).toBeDefined();

                if (source) {
                    expect(source.type).toBe('git');
                    expect(typeof source.url).toBe('string');
                    expect(source.url.length).toBeGreaterThan(0);
                    expect(typeof source.branch).toBe('string');
                    expect(source.branch.length).toBeGreaterThan(0);

                    // gitOptions should be present and have proper structure
                    if (source.gitOptions) {
                        expect(typeof source.gitOptions.shallow).toBe('boolean');
                        expect(typeof source.gitOptions.recursive).toBe('boolean');
                    }
                }
            });
        });

        it('should properly structure submodules when present', async () => {
            // Given: Templates may have submodules defined
            // When: Loading templates
            const templates = await loadDemoTemplates();

            // Then: Submodules should be properly structured
            templates.forEach(template => {
                if (template.submodules) {
                    Object.entries(template.submodules).forEach(([key, submodule]) => {
                        expect(typeof key).toBe('string');
                        expect(typeof submodule.path).toBe('string');
                        expect(typeof submodule.repository).toBe('string');
                    });
                }
            });
        });
    });

    describe('validateTemplate', () => {
        it('should return valid for template with all required fields', () => {
            // Given: A valid template with all required fields (new structure)
            const validTemplate: DemoTemplate = {
                id: 'test-template',
                name: 'Test Template',
                description: 'A test template for validation',
                stack: 'headless-paas',
                brand: 'citisignal',
                source: {
                    type: 'git',
                    url: 'https://github.com/test/repo',
                    branch: 'main',
                    gitOptions: {
                        shallow: true,
                        recursive: false,
                    },
                },
            };

            // When: Validating the template
            const result = validateTemplate(validTemplate);

            // Then: Should return valid
            expect(result.valid).toBe(true);
            expect(result.errors).toHaveLength(0);
        });

        it('should return invalid for template missing id', () => {
            // Given: A template without an id
            const invalidTemplate = {
                name: 'Missing ID Template',
                description: 'This template has no ID',
                stack: 'headless-paas',
                brand: 'citisignal',
                source: {
                    type: 'git',
                    url: 'https://github.com/test/repo',
                    branch: 'main',
                },
            } as DemoTemplate;

            // When: Validating the template
            const result = validateTemplate(invalidTemplate);

            // Then: Should return invalid with error about missing id
            expect(result.valid).toBe(false);
            expect(result.errors).toContain('Template must have an id');
        });

        it('should return invalid for template missing name', () => {
            // Given: A template without a name
            const invalidTemplate = {
                id: 'no-name',
                description: 'This template has no name',
                stack: 'headless-paas',
                brand: 'citisignal',
                source: {
                    type: 'git',
                    url: 'https://github.com/test/repo',
                    branch: 'main',
                },
            } as DemoTemplate;

            // When: Validating the template
            const result = validateTemplate(invalidTemplate);

            // Then: Should return invalid with error about missing name
            expect(result.valid).toBe(false);
            expect(result.errors).toContain('Template must have a name');
        });

        it('should return invalid for template missing description', () => {
            // Given: A template without a description
            const invalidTemplate = {
                id: 'no-desc',
                name: 'No Description Template',
                stack: 'headless-paas',
                brand: 'citisignal',
                source: {
                    type: 'git',
                    url: 'https://github.com/test/repo',
                    branch: 'main',
                },
            } as DemoTemplate;

            // When: Validating the template
            const result = validateTemplate(invalidTemplate);

            // Then: Should return invalid with error about missing description
            expect(result.valid).toBe(false);
            expect(result.errors).toContain('Template must have a description');
        });

        it('should return invalid for template missing stack', () => {
            // Given: A template without a stack
            const invalidTemplate = {
                id: 'no-stack',
                name: 'No Stack Template',
                description: 'This template has no stack',
                brand: 'citisignal',
                source: {
                    type: 'git',
                    url: 'https://github.com/test/repo',
                    branch: 'main',
                },
            } as DemoTemplate;

            // When: Validating the template
            const result = validateTemplate(invalidTemplate);

            // Then: Should return invalid with error about missing stack
            expect(result.valid).toBe(false);
            expect(result.errors).toContain('Template must have a stack');
        });

        it('should return invalid for template missing brand', () => {
            // Given: A template without a brand
            const invalidTemplate = {
                id: 'no-brand',
                name: 'No Brand Template',
                description: 'This template has no brand',
                stack: 'headless-paas',
                source: {
                    type: 'git',
                    url: 'https://github.com/test/repo',
                    branch: 'main',
                },
            } as DemoTemplate;

            // When: Validating the template
            const result = validateTemplate(invalidTemplate);

            // Then: Should return invalid with error about missing brand
            expect(result.valid).toBe(false);
            expect(result.errors).toContain('Template must have a brand');
        });

        it('should return invalid for template missing source', () => {
            // Given: A template without a source
            const invalidTemplate = {
                id: 'no-source',
                name: 'No Source Template',
                description: 'This template has no source',
                stack: 'headless-paas',
                brand: 'citisignal',
            } as DemoTemplate;

            // When: Validating the template
            const result = validateTemplate(invalidTemplate);

            // Then: Should return invalid with error about missing source
            expect(result.valid).toBe(false);
            expect(result.errors).toContain('Template must have a source');
        });

        it('should detect unknown stack reference when knownStacks provided', () => {
            // Given: A template referencing a non-existent stack
            const invalidTemplate: DemoTemplate = {
                id: 'unknown-stack',
                name: 'Unknown Stack Template',
                description: 'References unknown stack',
                stack: 'non-existent-stack',
                brand: 'citisignal',
                source: {
                    type: 'git',
                    url: 'https://github.com/test/repo',
                    branch: 'main',
                },
            };

            // When: Validating the template with known stacks
            const knownStacks = ['headless-paas', 'headless-accs', 'eds-paas', 'eds-accs'];
            const result = validateTemplate(invalidTemplate, { knownStacks });

            // Then: Should return invalid with error about unknown stack
            expect(result.valid).toBe(false);
            expect(result.errors.some(e => e.includes('non-existent-stack'))).toBe(true);
        });

        it('should detect unknown brand reference when knownBrands provided', () => {
            // Given: A template referencing a non-existent brand
            const invalidTemplate: DemoTemplate = {
                id: 'unknown-brand',
                name: 'Unknown Brand Template',
                description: 'References unknown brand',
                stack: 'headless-paas',
                brand: 'non-existent-brand',
                source: {
                    type: 'git',
                    url: 'https://github.com/test/repo',
                    branch: 'main',
                },
            };

            // When: Validating the template with known brands
            const knownBrands = ['default', 'citisignal', 'buildright'];
            const result = validateTemplate(invalidTemplate, { knownBrands });

            // Then: Should return invalid with error about unknown brand
            expect(result.valid).toBe(false);
            expect(result.errors.some(e => e.includes('non-existent-brand'))).toBe(true);
        });

        it('should collect multiple errors when validation fails', () => {
            // Given: A template with multiple issues
            const invalidTemplate = {
                id: '', // Empty ID
                name: '', // Empty name
            } as DemoTemplate;

            // When: Validating the template
            const result = validateTemplate(invalidTemplate);

            // Then: Should collect multiple errors
            expect(result.valid).toBe(false);
            expect(result.errors.length).toBeGreaterThanOrEqual(2);
        });

        it('should pass validation when knownStacks/knownBrands not provided', () => {
            // Given: A valid template without cross-reference validation
            const validTemplate: DemoTemplate = {
                id: 'test-template',
                name: 'Test Template',
                description: 'A test template',
                stack: 'any-stack',
                brand: 'any-brand',
                source: {
                    type: 'git',
                    url: 'https://github.com/test/repo',
                    branch: 'main',
                },
            };

            // When: Validating without knownStacks/knownBrands (skip cross-reference validation)
            const result = validateTemplate(validTemplate);

            // Then: Should pass since cross-reference validation is skipped
            expect(result.valid).toBe(true);
            expect(result.errors).toHaveLength(0);
        });

        it('should validate both stack and brand references together', () => {
            // Given: A template with unknown stack AND unknown brand
            const invalidTemplate: DemoTemplate = {
                id: 'double-unknown',
                name: 'Double Unknown Template',
                description: 'References unknown stack and brand',
                stack: 'fake-stack',
                brand: 'fake-brand',
                source: {
                    type: 'git',
                    url: 'https://github.com/test/repo',
                    branch: 'main',
                },
            };

            // When: Validating with both known stacks and brands
            const result = validateTemplate(invalidTemplate, {
                knownStacks: ['headless-paas', 'eds-paas'],
                knownBrands: ['citisignal', 'buildright'],
            });

            // Then: Should return both errors
            expect(result.valid).toBe(false);
            expect(result.errors.some(e => e.includes('fake-stack'))).toBe(true);
            expect(result.errors.some(e => e.includes('fake-brand'))).toBe(true);
        });
    });
});
