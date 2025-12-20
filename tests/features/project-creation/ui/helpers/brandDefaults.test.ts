/**
 * Brand Defaults Tests
 *
 * Tests for applying brand configuration defaults to wizard state.
 * Follows TDD methodology - these tests are written BEFORE implementation.
 */

import { applyBrandDefaults } from '@/features/project-creation/ui/helpers/brandDefaults';
import type { Brand } from '@/types/brands';
import type { WizardState } from '@/types/webview';

// Test fixtures matching templates/brands.json
const citisignalBrand: Brand = {
    id: 'citisignal',
    name: 'CitiSignal',
    description: 'Telecommunications demo with CitiSignal branding',
    icon: 'citisignal',
    featured: true,
    configDefaults: {
        ADOBE_COMMERCE_WEBSITE_CODE: 'citisignal',
        ADOBE_COMMERCE_STORE_CODE: 'citisignal_store',
        ADOBE_COMMERCE_STORE_VIEW_CODE: 'citisignal_us',
    },
    contentSources: {
        eds: 'main--accs-citisignal--demo-system-stores.aem.live',
    },
};

const defaultBrand: Brand = {
    id: 'default',
    name: 'Default',
    description: 'Generic storefront with default content',
    icon: 'default',
    configDefaults: {},
    contentSources: {
        eds: 'main--boilerplate--adobe-commerce.aem.live',
    },
};

const createBaseState = (): WizardState => ({
    currentStep: 'welcome',
    projectName: 'test-project',
    projectTemplate: 'citisignal',
    adobeAuth: {
        isAuthenticated: false,
        isChecking: false,
    },
});

describe('brandDefaults', () => {
    describe('applyBrandDefaults', () => {
        it('should apply brand configDefaults to componentConfigs under frontend ID', () => {
            // Given: A state with a frontend component selected
            const state: WizardState = {
                ...createBaseState(),
                components: {
                    frontend: 'citisignal-nextjs',
                    backend: 'adobe-commerce-paas',
                },
            };

            // When: Applying brand defaults
            const result = applyBrandDefaults(state, citisignalBrand);

            // Then: Should have componentConfigs populated under frontend component ID
            expect(result.componentConfigs).toBeDefined();
            expect(result.componentConfigs?.['citisignal-nextjs']).toBeDefined();

            // And: Should have all config defaults from brand
            expect(result.componentConfigs?.['citisignal-nextjs']?.ADOBE_COMMERCE_WEBSITE_CODE).toBe('citisignal');
            expect(result.componentConfigs?.['citisignal-nextjs']?.ADOBE_COMMERCE_STORE_CODE).toBe('citisignal_store');
            expect(result.componentConfigs?.['citisignal-nextjs']?.ADOBE_COMMERCE_STORE_VIEW_CODE).toBe('citisignal_us');
        });

        it('should merge with existing componentConfigs', () => {
            // Given: A state with existing componentConfigs
            const state: WizardState = {
                ...createBaseState(),
                components: {
                    frontend: 'citisignal-nextjs',
                    backend: 'adobe-commerce-paas',
                },
                componentConfigs: {
                    'citisignal-nextjs': {
                        EXISTING_VAR: 'existing-value',
                    },
                    'other-component': {
                        OTHER_VAR: 'other-value',
                    },
                },
            };

            // When: Applying brand defaults
            const result = applyBrandDefaults(state, citisignalBrand);

            // Then: Should merge with existing frontend config
            expect(result.componentConfigs?.['citisignal-nextjs']?.EXISTING_VAR).toBe('existing-value');
            expect(result.componentConfigs?.['citisignal-nextjs']?.ADOBE_COMMERCE_WEBSITE_CODE).toBe('citisignal');

            // And: Should preserve other component configs
            expect(result.componentConfigs?.['other-component']?.OTHER_VAR).toBe('other-value');
        });

        it('should return unchanged state if no frontend selected', () => {
            // Given: A state without a frontend component selected
            const state: WizardState = {
                ...createBaseState(),
                components: {
                    backend: 'adobe-commerce-paas',
                },
            };

            // When: Applying brand defaults
            const result = applyBrandDefaults(state, citisignalBrand);

            // Then: Should return state unchanged
            expect(result).toEqual(state);
            expect(result.componentConfigs).toBeUndefined();
        });

        it('should return unchanged state if configDefaults is empty', () => {
            // Given: A state with frontend selected but brand has empty configDefaults
            const state: WizardState = {
                ...createBaseState(),
                components: {
                    frontend: 'citisignal-nextjs',
                    backend: 'adobe-commerce-paas',
                },
            };

            // When: Applying brand defaults with default brand (empty configDefaults)
            const result = applyBrandDefaults(state, defaultBrand);

            // Then: Should return state unchanged
            expect(result).toEqual(state);
        });

        it('should return unchanged state if components is undefined', () => {
            // Given: A state without components defined
            const state: WizardState = {
                ...createBaseState(),
            };

            // When: Applying brand defaults
            const result = applyBrandDefaults(state, citisignalBrand);

            // Then: Should return state unchanged
            expect(result).toEqual(state);
        });

        it('should preserve non-component state properties', () => {
            // Given: A state with various properties
            const state: WizardState = {
                ...createBaseState(),
                projectName: 'my-project',
                currentStep: 'component-selection',
                selectedBrand: 'citisignal',
                selectedStack: 'headless',
                components: {
                    frontend: 'citisignal-nextjs',
                },
                adobeAuth: {
                    isAuthenticated: true,
                    isChecking: false,
                    email: 'user@example.com',
                },
            };

            // When: Applying brand defaults
            const result = applyBrandDefaults(state, citisignalBrand);

            // Then: Should preserve all non-component state
            expect(result.projectName).toBe('my-project');
            expect(result.currentStep).toBe('component-selection');
            expect(result.selectedBrand).toBe('citisignal');
            expect(result.selectedStack).toBe('headless');
            expect(result.adobeAuth.isAuthenticated).toBe(true);
            expect(result.adobeAuth.email).toBe('user@example.com');
        });

        it('should override existing values with brand defaults', () => {
            // Given: A state with existing componentConfig that conflicts with brand defaults
            const state: WizardState = {
                ...createBaseState(),
                components: {
                    frontend: 'citisignal-nextjs',
                },
                componentConfigs: {
                    'citisignal-nextjs': {
                        ADOBE_COMMERCE_WEBSITE_CODE: 'old-value',
                    },
                },
            };

            // When: Applying brand defaults
            const result = applyBrandDefaults(state, citisignalBrand);

            // Then: Brand defaults should override existing values
            expect(result.componentConfigs?.['citisignal-nextjs']?.ADOBE_COMMERCE_WEBSITE_CODE).toBe('citisignal');
        });

        it('should handle frontend with empty string (falsy but defined)', () => {
            // Given: A state where frontend is empty string
            const state: WizardState = {
                ...createBaseState(),
                components: {
                    frontend: '',
                    backend: 'adobe-commerce-paas',
                },
            };

            // When: Applying brand defaults
            const result = applyBrandDefaults(state, citisignalBrand);

            // Then: Should return state unchanged (empty string is falsy)
            expect(result).toEqual(state);
        });
    });
});
