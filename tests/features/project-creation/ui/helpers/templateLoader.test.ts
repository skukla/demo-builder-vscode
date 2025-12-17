/**
 * Template Loader Tests
 *
 * Tests for loading and validating demo templates from demo-templates.json.
 * Follows TDD methodology - these tests are written BEFORE implementation.
 */

import { loadDemoTemplates, validateTemplate } from '@/features/project-creation/ui/helpers/templateLoader';
import type { DemoTemplate, TemplateValidationResult } from '@/types/templates';

describe('templateLoader', () => {
    describe('loadDemoTemplates', () => {
        it('should load templates from demo-templates.json', async () => {
            // Given: The template loader is called
            // When: Loading templates
            const templates = await loadDemoTemplates();

            // Then: Should return an array of templates
            expect(templates).toBeDefined();
            expect(Array.isArray(templates)).toBe(true);
        });

        it('should return at least one template', async () => {
            // Given: The templates file exists with at least CitiSignal template
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
            const citisignalTemplate = templates.find(t => t.id === 'citisignal');
            expect(citisignalTemplate).toBeDefined();
            expect(citisignalTemplate?.name).toContain('CitiSignal');
        });

        it('should ensure each template has required properties', async () => {
            // Given: Templates are loaded from the JSON file
            // When: Checking each template
            const templates = await loadDemoTemplates();

            // Then: Each template should have required properties
            templates.forEach((template, index) => {
                expect(template.id).toBeDefined();
                expect(typeof template.id).toBe('string');
                expect(template.id.length).toBeGreaterThan(0);

                expect(template.name).toBeDefined();
                expect(typeof template.name).toBe('string');
                expect(template.name.length).toBeGreaterThan(0);

                expect(template.description).toBeDefined();
                expect(typeof template.description).toBe('string');

                expect(template.defaults).toBeDefined();
                expect(typeof template.defaults).toBe('object');
            });
        });

        it('should ensure template defaults contain component selections', async () => {
            // Given: Templates are loaded with proper defaults
            // When: Checking template defaults structure
            const templates = await loadDemoTemplates();

            // Then: Each template's defaults should have component selection properties
            templates.forEach(template => {
                const defaults = template.defaults;

                // Frontend should be defined (optional but expected for most templates)
                if (defaults.frontend) {
                    expect(typeof defaults.frontend).toBe('string');
                }

                // Backend should be defined (optional but expected)
                if (defaults.backend) {
                    expect(typeof defaults.backend).toBe('string');
                }

                // Dependencies should be an array if present
                if (defaults.dependencies) {
                    expect(Array.isArray(defaults.dependencies)).toBe(true);
                }
            });
        });
    });

    describe('validateTemplate', () => {
        it('should return valid for template with all required fields', () => {
            // Given: A valid template with all required fields
            const validTemplate: DemoTemplate = {
                id: 'test-template',
                name: 'Test Template',
                description: 'A test template for validation',
                defaults: {
                    frontend: 'citisignal-nextjs',
                    backend: 'adobe-commerce-paas',
                    dependencies: ['commerce-mesh'],
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
                defaults: {
                    frontend: 'citisignal-nextjs',
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
                defaults: {},
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
                defaults: {},
            } as DemoTemplate;

            // When: Validating the template
            const result = validateTemplate(invalidTemplate);

            // Then: Should return invalid with error about missing description
            expect(result.valid).toBe(false);
            expect(result.errors).toContain('Template must have a description');
        });

        it('should return invalid for template missing defaults', () => {
            // Given: A template without defaults
            const invalidTemplate = {
                id: 'no-defaults',
                name: 'No Defaults Template',
                description: 'This template has no defaults',
            } as DemoTemplate;

            // When: Validating the template
            const result = validateTemplate(invalidTemplate);

            // Then: Should return invalid with error about missing defaults
            expect(result.valid).toBe(false);
            expect(result.errors).toContain('Template must have defaults');
        });

        it('should detect unknown component references in frontend', () => {
            // Given: A template referencing a non-existent frontend component
            const invalidTemplate: DemoTemplate = {
                id: 'unknown-frontend',
                name: 'Unknown Frontend Template',
                description: 'References unknown frontend',
                defaults: {
                    frontend: 'non-existent-frontend',
                    backend: 'adobe-commerce-paas',
                },
            };

            // When: Validating the template with known components
            const knownComponents = [
                'citisignal-nextjs',
                'adobe-commerce-paas',
                'adobe-commerce-accs',
                'commerce-mesh',
                'demo-inspector',
                'catalog-service',
                'live-search',
            ];
            const result = validateTemplate(invalidTemplate, knownComponents);

            // Then: Should return invalid with error about unknown component
            expect(result.valid).toBe(false);
            expect(result.errors.some(e => e.includes('non-existent-frontend'))).toBe(true);
        });

        it('should detect unknown component references in backend', () => {
            // Given: A template referencing a non-existent backend component
            const invalidTemplate: DemoTemplate = {
                id: 'unknown-backend',
                name: 'Unknown Backend Template',
                description: 'References unknown backend',
                defaults: {
                    frontend: 'citisignal-nextjs',
                    backend: 'fake-backend',
                },
            };

            // When: Validating the template with known components
            const knownComponents = [
                'citisignal-nextjs',
                'adobe-commerce-paas',
                'adobe-commerce-accs',
                'commerce-mesh',
            ];
            const result = validateTemplate(invalidTemplate, knownComponents);

            // Then: Should return invalid with error about unknown component
            expect(result.valid).toBe(false);
            expect(result.errors.some(e => e.includes('fake-backend'))).toBe(true);
        });

        it('should detect unknown component references in dependencies', () => {
            // Given: A template referencing a non-existent dependency
            const invalidTemplate: DemoTemplate = {
                id: 'unknown-dep',
                name: 'Unknown Dependency Template',
                description: 'References unknown dependency',
                defaults: {
                    frontend: 'citisignal-nextjs',
                    backend: 'adobe-commerce-paas',
                    dependencies: ['commerce-mesh', 'non-existent-dependency'],
                },
            };

            // When: Validating the template with known components
            const knownComponents = [
                'citisignal-nextjs',
                'adobe-commerce-paas',
                'commerce-mesh',
            ];
            const result = validateTemplate(invalidTemplate, knownComponents);

            // Then: Should return invalid with error about unknown component
            expect(result.valid).toBe(false);
            expect(result.errors.some(e => e.includes('non-existent-dependency'))).toBe(true);
        });

        it('should collect multiple errors when validation fails', () => {
            // Given: A template with multiple issues
            const invalidTemplate = {
                id: '', // Empty ID
                name: '', // Empty name
                defaults: {},
            } as DemoTemplate;

            // When: Validating the template
            const result = validateTemplate(invalidTemplate);

            // Then: Should collect multiple errors
            expect(result.valid).toBe(false);
            expect(result.errors.length).toBeGreaterThanOrEqual(2);
        });

        it('should pass validation when knownComponents is not provided', () => {
            // Given: A valid template without component validation
            const validTemplate: DemoTemplate = {
                id: 'test-template',
                name: 'Test Template',
                description: 'A test template',
                defaults: {
                    frontend: 'any-frontend',
                    backend: 'any-backend',
                },
            };

            // When: Validating without knownComponents (skip component validation)
            const result = validateTemplate(validTemplate);

            // Then: Should pass since component validation is skipped
            expect(result.valid).toBe(true);
            expect(result.errors).toHaveLength(0);
        });
    });
});
