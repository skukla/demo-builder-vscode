/**
 * Core Constants Tests
 *
 * Tests for COMPONENT_IDS constant object that provides
 * type-safe access to component identifiers matching templates/components.json.
 */

import { COMPONENT_IDS, ComponentId } from '@/core/constants';

describe('COMPONENT_IDS', () => {
    describe('export', () => {
        it('should be exported from constants module', () => {
            expect(COMPONENT_IDS).toBeDefined();
            expect(typeof COMPONENT_IDS).toBe('object');
        });
    });

    describe('component ID values', () => {
        it('should have COMMERCE_MESH equal to "commerce-mesh"', () => {
            expect(COMPONENT_IDS.COMMERCE_MESH).toBe('commerce-mesh');
        });

        it('should have EDS_STOREFRONT equal to "eds-storefront"', () => {
            expect(COMPONENT_IDS.EDS_STOREFRONT).toBe('eds-storefront');
        });

        it('should have DEMO_INSPECTOR equal to "demo-inspector"', () => {
            expect(COMPONENT_IDS.DEMO_INSPECTOR).toBe('demo-inspector');
        });

        it('should have EDS_COMMERCE_MESH equal to "eds-commerce-mesh"', () => {
            expect(COMPONENT_IDS.EDS_COMMERCE_MESH).toBe('eds-commerce-mesh');
        });

        it('should have HEADLESS_COMMERCE_MESH equal to "headless-commerce-mesh"', () => {
            expect(COMPONENT_IDS.HEADLESS_COMMERCE_MESH).toBe('headless-commerce-mesh');
        });
    });

    describe('immutability (readonly)', () => {
        it('should be readonly (const assertion)', () => {
            // TypeScript enforces this at compile time with "as const"
            // At runtime, we verify by checking the object structure
            expect(Object.keys(COMPONENT_IDS)).toEqual([
                'COMMERCE_MESH',
                'EDS_STOREFRONT',
                'DEMO_INSPECTOR',
                'EDS_COMMERCE_MESH',
                'HEADLESS_COMMERCE_MESH',
            ]);
        });

        it('should have exactly 5 component IDs', () => {
            expect(Object.keys(COMPONENT_IDS).length).toBe(5);
        });
    });

    describe('ComponentId type', () => {
        it('should allow valid component ID values', () => {
            // Type check: these should compile without errors
            const validIds: ComponentId[] = [
                'commerce-mesh',
                'eds-storefront',
                'demo-inspector',
                'eds-commerce-mesh',
                'headless-commerce-mesh',
            ];

            // Runtime verification
            validIds.forEach(id => {
                expect(Object.values(COMPONENT_IDS)).toContain(id);
            });
        });

        it('should provide type-safe access via COMPONENT_IDS keys', () => {
            // Type inference verification: each value should be assignable to ComponentId
            const commerceMesh: ComponentId = COMPONENT_IDS.COMMERCE_MESH;
            const edsStorefront: ComponentId = COMPONENT_IDS.EDS_STOREFRONT;
            const demoInspector: ComponentId = COMPONENT_IDS.DEMO_INSPECTOR;
            const edsCommerceMesh: ComponentId = COMPONENT_IDS.EDS_COMMERCE_MESH;
            const headlessCommerceMesh: ComponentId = COMPONENT_IDS.HEADLESS_COMMERCE_MESH;

            expect(commerceMesh).toBe('commerce-mesh');
            expect(edsStorefront).toBe('eds-storefront');
            expect(demoInspector).toBe('demo-inspector');
            expect(edsCommerceMesh).toBe('eds-commerce-mesh');
            expect(headlessCommerceMesh).toBe('headless-commerce-mesh');
        });
    });
});
