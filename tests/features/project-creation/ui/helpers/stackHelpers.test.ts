/**
 * Stack Helpers Tests
 *
 * Tests for deriving component selections from stacks and getting content sources.
 * Follows TDD methodology - these tests are written BEFORE implementation.
 */

import {
    deriveComponentsFromStack,
    getContentSourceForBrand,
} from '@/features/project-creation/ui/helpers/stackHelpers';
import type { Stack } from '@/types/stacks';
import type { Brand } from '@/types/brands';
import type { ComponentSelection } from '@/types/webview';

// Test fixtures matching templates/stacks.json
const headlessStack: Stack = {
    id: 'headless',
    name: 'Headless',
    description: 'NextJS storefront with API Mesh and Commerce PaaS',
    icon: 'nextjs',
    frontend: 'citisignal-nextjs',
    backend: 'adobe-commerce-paas',
    dependencies: ['commerce-mesh', 'demo-inspector'],
    features: ['Server-side rendering', 'API Mesh integration', 'Full customization'],
};

const edgeDeliveryStack: Stack = {
    id: 'edge-delivery',
    name: 'Edge Delivery',
    description: 'EDS storefront with Commerce Drop-ins and ACCS',
    icon: 'eds',
    frontend: 'eds-storefront',
    backend: 'adobe-commerce-accs',
    dependencies: ['demo-inspector'],
    features: ['Ultra-fast delivery', 'DA.live content', 'Commerce Drop-ins'],
    requiresGitHub: true,
    requiresDaLive: true,
};

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

describe('stackHelpers', () => {
    describe('deriveComponentsFromStack', () => {
        it('should derive components from headless stack', () => {
            // Given: A headless stack with frontend, backend, and dependencies
            const stack = headlessStack;

            // When: Deriving components from the stack
            const result = deriveComponentsFromStack(stack);

            // Then: Should have correct frontend
            expect(result.frontend).toBe('citisignal-nextjs');

            // And: Should have correct backend
            expect(result.backend).toBe('adobe-commerce-paas');

            // And: Should include commerce-mesh in dependencies
            expect(result.dependencies).toContain('commerce-mesh');
            expect(result.dependencies).toContain('demo-inspector');
        });

        it('should derive components from edge-delivery stack', () => {
            // Given: An edge delivery stack with frontend, backend, and dependencies
            const stack = edgeDeliveryStack;

            // When: Deriving components from the stack
            const result = deriveComponentsFromStack(stack);

            // Then: Should have correct frontend
            expect(result.frontend).toBe('eds-storefront');

            // And: Should have correct backend
            expect(result.backend).toBe('adobe-commerce-accs');

            // And: Should NOT include commerce-mesh (EDS doesn't use it)
            expect(result.dependencies).not.toContain('commerce-mesh');

            // And: Should include demo-inspector
            expect(result.dependencies).toContain('demo-inspector');
        });

        it('should initialize empty arrays for integrations and appBuilderApps', () => {
            // Given: A stack
            const stack = headlessStack;

            // When: Deriving components from the stack
            const result = deriveComponentsFromStack(stack);

            // Then: Should have empty integrations array
            expect(result.integrations).toEqual([]);

            // And: Should have empty appBuilderApps array
            expect(result.appBuilderApps).toEqual([]);
        });

        it('should handle stack with empty dependencies', () => {
            // Given: A stack with no dependencies
            const stackWithNoDeps: Stack = {
                id: 'minimal',
                name: 'Minimal',
                description: 'Minimal stack',
                frontend: 'minimal-frontend',
                backend: 'minimal-backend',
                dependencies: [],
            };

            // When: Deriving components from the stack
            const result = deriveComponentsFromStack(stackWithNoDeps);

            // Then: Should have empty dependencies array
            expect(result.dependencies).toEqual([]);
        });

        it('should return a ComponentSelection structure', () => {
            // Given: Any stack
            const stack = headlessStack;

            // When: Deriving components from the stack
            const result = deriveComponentsFromStack(stack);

            // Then: Result should have all ComponentSelection properties
            expect(result).toHaveProperty('frontend');
            expect(result).toHaveProperty('backend');
            expect(result).toHaveProperty('dependencies');
            expect(result).toHaveProperty('integrations');
            expect(result).toHaveProperty('appBuilderApps');
        });
    });

    describe('getContentSourceForBrand', () => {
        it('should return EDS content source for edge-delivery stack', () => {
            // Given: A brand with EDS content source and edge-delivery stack
            const brand = citisignalBrand;
            const stackId = 'edge-delivery';

            // When: Getting content source for the brand
            const result = getContentSourceForBrand(brand, stackId);

            // Then: Should return the EDS content source URL
            expect(result).toBe('main--accs-citisignal--demo-system-stores.aem.live');
        });

        it('should return undefined for headless stack', () => {
            // Given: A brand with content sources and headless stack
            const brand = citisignalBrand;
            const stackId = 'headless';

            // When: Getting content source for the brand
            const result = getContentSourceForBrand(brand, stackId);

            // Then: Should return undefined (headless doesn't use EDS content)
            expect(result).toBeUndefined();
        });

        it('should return EDS content source for default brand', () => {
            // Given: Default brand with EDS content source
            const brand = defaultBrand;
            const stackId = 'edge-delivery';

            // When: Getting content source for the brand
            const result = getContentSourceForBrand(brand, stackId);

            // Then: Should return the default EDS content source URL
            expect(result).toBe('main--boilerplate--adobe-commerce.aem.live');
        });

        it('should return undefined when brand has no EDS content source', () => {
            // Given: A brand without EDS content source
            const brandWithoutEds: Brand = {
                id: 'no-eds',
                name: 'No EDS',
                description: 'Brand without EDS content',
                configDefaults: {},
                contentSources: {},
            };
            const stackId = 'edge-delivery';

            // When: Getting content source for the brand
            const result = getContentSourceForBrand(brandWithoutEds, stackId);

            // Then: Should return undefined
            expect(result).toBeUndefined();
        });

        it('should return undefined for unknown stack ID', () => {
            // Given: A brand and unknown stack ID
            const brand = citisignalBrand;
            const stackId = 'unknown-stack';

            // When: Getting content source for the brand
            const result = getContentSourceForBrand(brand, stackId);

            // Then: Should return undefined
            expect(result).toBeUndefined();
        });
    });
});
