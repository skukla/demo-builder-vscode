/**
 * Template Defaults Tests
 *
 * Tests for applying demo template defaults to wizard state.
 * Follows TDD methodology - these tests are written BEFORE implementation.
 */

import {
    getTemplateById,
    applyTemplateDefaults,
} from '@/features/project-creation/ui/helpers/templateDefaults';
import type { DemoTemplate } from '@/types/templates';
import type { WizardState, ComponentSelection } from '@/types/webview';

// Test fixtures
const mockTemplates: DemoTemplate[] = [
    {
        id: 'citisignal',
        name: 'CitiSignal Storefront',
        description: 'Next.js headless storefront with Adobe Commerce API Mesh integration',
        defaults: {
            frontend: 'citisignal-nextjs',
            backend: 'adobe-commerce-paas',
            dependencies: ['commerce-mesh', 'demo-inspector'],
            configDefaults: {
                ADOBE_COMMERCE_WEBSITE_CODE: 'citisignal',
                ADOBE_COMMERCE_STORE_CODE: 'citisignal_store',
                ADOBE_COMMERCE_STORE_VIEW_CODE: 'citisignal_us',
            },
        },
    },
    {
        id: 'blank',
        name: 'Blank Project',
        description: 'Empty project with no default components',
        defaults: {},
    },
    {
        id: 'full-stack',
        name: 'Full Stack Demo',
        description: 'Complete demo with all integrations',
        defaults: {
            frontend: 'citisignal-nextjs',
            backend: 'adobe-commerce-paas',
            dependencies: ['commerce-mesh'],
            integrations: ['live-search', 'catalog-service'],
            appBuilder: ['product-recommendations'],
        },
    },
];

const createBaseState = (): WizardState => ({
    currentStep: 'welcome',
    projectName: 'test-project',
    projectTemplate: 'citisignal',
    adobeAuth: {
        isAuthenticated: false,
        isChecking: false,
    },
});

describe('templateDefaults', () => {
    describe('getTemplateById', () => {
        it('should return template when ID matches', () => {
            // Given: A list of templates and an existing template ID
            const templateId = 'citisignal';

            // When: Looking up the template by ID
            const result = getTemplateById(templateId, mockTemplates);

            // Then: Should return the matching template
            expect(result).toBeDefined();
            expect(result?.id).toBe('citisignal');
            expect(result?.name).toBe('CitiSignal Storefront');
        });

        it('should return undefined when ID not found', () => {
            // Given: A list of templates and a non-existent template ID
            const templateId = 'non-existent';

            // When: Looking up the template by ID
            const result = getTemplateById(templateId, mockTemplates);

            // Then: Should return undefined
            expect(result).toBeUndefined();
        });

        it('should return undefined when templates array is empty', () => {
            // Given: An empty templates array
            const templateId = 'citisignal';
            const emptyTemplates: DemoTemplate[] = [];

            // When: Looking up the template by ID
            const result = getTemplateById(templateId, emptyTemplates);

            // Then: Should return undefined
            expect(result).toBeUndefined();
        });
    });

    describe('applyTemplateDefaults', () => {
        it('should apply backend default from template', () => {
            // Given: A state with a selected template that has a backend default
            const state: WizardState = {
                ...createBaseState(),
                selectedTemplate: 'citisignal',
            };

            // When: Applying template defaults
            const result = applyTemplateDefaults(state, mockTemplates);

            // Then: Should have backend populated from template
            expect(result.components?.backend).toBe('adobe-commerce-paas');
        });

        it('should apply frontend default from template', () => {
            // Given: A state with a selected template that has a frontend default
            const state: WizardState = {
                ...createBaseState(),
                selectedTemplate: 'citisignal',
            };

            // When: Applying template defaults
            const result = applyTemplateDefaults(state, mockTemplates);

            // Then: Should have frontend populated from template
            expect(result.components?.frontend).toBe('citisignal-nextjs');
        });

        it('should apply dependencies as array from template', () => {
            // Given: A state with a selected template that has dependencies
            const state: WizardState = {
                ...createBaseState(),
                selectedTemplate: 'citisignal',
            };

            // When: Applying template defaults
            const result = applyTemplateDefaults(state, mockTemplates);

            // Then: Should have dependencies populated from template
            expect(result.components?.dependencies).toEqual(['commerce-mesh', 'demo-inspector']);
        });

        it('should return unchanged state when no template selected', () => {
            // Given: A state without selectedTemplate
            const state: WizardState = {
                ...createBaseState(),
                components: {
                    frontend: 'existing-frontend',
                    backend: 'existing-backend',
                },
            };

            // When: Applying template defaults
            const result = applyTemplateDefaults(state, mockTemplates);

            // Then: Should return state unchanged
            expect(result).toEqual(state);
            expect(result.components?.frontend).toBe('existing-frontend');
            expect(result.components?.backend).toBe('existing-backend');
        });

        it('should return unchanged state when template not found', () => {
            // Given: A state with a non-existent template ID
            const state: WizardState = {
                ...createBaseState(),
                selectedTemplate: 'non-existent-template',
                components: {
                    frontend: 'existing-frontend',
                },
            };

            // When: Applying template defaults
            const result = applyTemplateDefaults(state, mockTemplates);

            // Then: Should return state unchanged
            expect(result).toEqual(state);
            expect(result.components?.frontend).toBe('existing-frontend');
        });

        it('should handle empty dependencies array in template', () => {
            // Given: A state with a selected template that has empty defaults
            const state: WizardState = {
                ...createBaseState(),
                selectedTemplate: 'blank',
            };

            // When: Applying template defaults
            const result = applyTemplateDefaults(state, mockTemplates);

            // Then: Should have empty/undefined dependencies
            expect(result.components?.dependencies ?? []).toEqual([]);
        });

        it('should apply integrations from template', () => {
            // Given: A state with a template that has integrations
            const state: WizardState = {
                ...createBaseState(),
                selectedTemplate: 'full-stack',
            };

            // When: Applying template defaults
            const result = applyTemplateDefaults(state, mockTemplates);

            // Then: Should have integrations populated
            expect(result.components?.integrations).toEqual(['live-search', 'catalog-service']);
        });

        it('should apply appBuilder apps from template', () => {
            // Given: A state with a template that has appBuilder defaults
            const state: WizardState = {
                ...createBaseState(),
                selectedTemplate: 'full-stack',
            };

            // When: Applying template defaults
            const result = applyTemplateDefaults(state, mockTemplates);

            // Then: Should have appBuilderApps populated
            expect(result.components?.appBuilderApps).toEqual(['product-recommendations']);
        });

        it('should preserve non-component state properties', () => {
            // Given: A state with various properties set
            const state: WizardState = {
                ...createBaseState(),
                selectedTemplate: 'citisignal',
                projectName: 'my-project',
                currentStep: 'component-selection',
                adobeAuth: {
                    isAuthenticated: true,
                    isChecking: false,
                    email: 'user@example.com',
                },
            };

            // When: Applying template defaults
            const result = applyTemplateDefaults(state, mockTemplates);

            // Then: Should preserve all non-component state
            expect(result.projectName).toBe('my-project');
            expect(result.currentStep).toBe('component-selection');
            expect(result.adobeAuth.isAuthenticated).toBe(true);
            expect(result.adobeAuth.email).toBe('user@example.com');
            expect(result.selectedTemplate).toBe('citisignal');
        });

        it('should apply configDefaults to componentConfigs', () => {
            // Given: A state with a selected template that has configDefaults
            const state: WizardState = {
                ...createBaseState(),
                selectedTemplate: 'citisignal',
            };

            // When: Applying template defaults
            const result = applyTemplateDefaults(state, mockTemplates);

            // Then: Should have componentConfigs populated under frontend component ID
            expect(result.componentConfigs).toBeDefined();
            expect(result.componentConfigs?.['citisignal-nextjs']).toBeDefined();
            expect(result.componentConfigs?.['citisignal-nextjs']?.ADOBE_COMMERCE_WEBSITE_CODE).toBe('citisignal');
            expect(result.componentConfigs?.['citisignal-nextjs']?.ADOBE_COMMERCE_STORE_CODE).toBe('citisignal_store');
            expect(result.componentConfigs?.['citisignal-nextjs']?.ADOBE_COMMERCE_STORE_VIEW_CODE).toBe('citisignal_us');
        });

        it('should not set componentConfigs when template has no configDefaults', () => {
            // Given: A state with a template without configDefaults
            const state: WizardState = {
                ...createBaseState(),
                selectedTemplate: 'full-stack',
            };

            // When: Applying template defaults
            const result = applyTemplateDefaults(state, mockTemplates);

            // Then: componentConfigs should remain undefined
            expect(result.componentConfigs).toBeUndefined();
        });

        it('should merge configDefaults with existing componentConfigs', () => {
            // Given: A state with existing componentConfigs
            const state: WizardState = {
                ...createBaseState(),
                selectedTemplate: 'citisignal',
                componentConfigs: {
                    'citisignal-nextjs': {
                        EXISTING_VAR: 'existing-value',
                    },
                    'other-component': {
                        OTHER_VAR: 'other-value',
                    },
                },
            };

            // When: Applying template defaults
            const result = applyTemplateDefaults(state, mockTemplates);

            // Then: Should merge with existing configs
            expect(result.componentConfigs?.['citisignal-nextjs']?.EXISTING_VAR).toBe('existing-value');
            expect(result.componentConfigs?.['citisignal-nextjs']?.ADOBE_COMMERCE_WEBSITE_CODE).toBe('citisignal');
            expect(result.componentConfigs?.['other-component']?.OTHER_VAR).toBe('other-value');
        });
    });
});
