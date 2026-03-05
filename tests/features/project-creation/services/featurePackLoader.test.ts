/**
 * Feature Pack Loader Tests
 *
 * Tests for feature pack loading, filtering, and source resolution.
 * Feature packs are defined in feature-packs.json with per-package
 * availability controlled by demo-packages.json featurePacks field.
 */

import {
    getAvailableFeaturePacks,
    getNativeFeaturePacks,
    isFeaturePackAvailableForPackage,
    getFeaturePackSource,
    getFeaturePackConfigFlags,
    getFeaturePackName,
    getFeaturePack,
} from '@/features/project-creation/services/featurePackLoader';
import type { Stack } from '@/types/stacks';

/** Helper to create a minimal Stack object for testing */
function makeStack(overrides: Partial<Stack> = {}): Stack {
    return {
        id: 'eds-paas',
        name: 'Edge Delivery + PaaS',
        description: 'EDS storefront',
        icon: 'eds',
        frontend: 'eds-storefront',
        backend: 'adobe-commerce-paas',
        dependencies: [],
        features: [],
        ...overrides,
    };
}

describe('featurePackLoader', () => {
    describe('getAvailableFeaturePacks', () => {
        it('should return b2b-commerce as optional for Isle5 on EDS', () => {
            const edsStack = makeStack();
            const packs = getAvailableFeaturePacks(edsStack, 'isle5');

            expect(packs).toHaveLength(1);
            expect(packs[0].id).toBe('b2b-commerce');
        });

        it('should return b2b-commerce as optional for CitiSignal on EDS', () => {
            const edsStack = makeStack();
            const packs = getAvailableFeaturePacks(edsStack, 'citisignal');

            expect(packs).toHaveLength(1);
            expect(packs[0].id).toBe('b2b-commerce');
        });

        it('should return b2b-commerce as optional for Custom on EDS', () => {
            const edsStack = makeStack();
            const packs = getAvailableFeaturePacks(edsStack, 'custom');

            expect(packs).toHaveLength(1);
            expect(packs[0].id).toBe('b2b-commerce');
        });

        it('should not return b2b-commerce for B2B package (required, not optional)', () => {
            const edsStack = makeStack();
            const packs = getAvailableFeaturePacks(edsStack, 'b2b');

            const b2b = packs.find(p => p.id === 'b2b-commerce');
            expect(b2b).toBeUndefined();
        });

        it('should not return b2b-commerce for BuildRight (excluded)', () => {
            const edsStack = makeStack();
            const packs = getAvailableFeaturePacks(edsStack, 'buildright');

            expect(packs).toHaveLength(0);
        });

        it('should return no feature packs for headless stacks', () => {
            const headlessStack = makeStack({
                id: 'headless-paas',
                frontend: 'headless',
            });
            const packs = getAvailableFeaturePacks(headlessStack, 'isle5');

            expect(packs).toHaveLength(0);
        });

        it('should return no feature packs for unknown package', () => {
            const edsStack = makeStack();
            const packs = getAvailableFeaturePacks(edsStack, 'nonexistent');

            expect(packs).toHaveLength(0);
        });
    });

    describe('getNativeFeaturePacks', () => {
        it('should return b2b-commerce as required for B2B package', () => {
            const edsStack = makeStack();
            const natives = getNativeFeaturePacks(edsStack, 'b2b');

            expect(natives).toHaveLength(1);
            expect(natives[0].id).toBe('b2b-commerce');
        });

        it('should return no native packs for Isle5 (b2b is optional, not required)', () => {
            const edsStack = makeStack();
            const natives = getNativeFeaturePacks(edsStack, 'isle5');

            expect(natives).toHaveLength(0);
        });

        it('should return no native packs for Custom package', () => {
            const edsStack = makeStack();
            const natives = getNativeFeaturePacks(edsStack, 'custom');

            expect(natives).toHaveLength(0);
        });

        it('should return no native packs for BuildRight (excluded)', () => {
            const edsStack = makeStack();
            const natives = getNativeFeaturePacks(edsStack, 'buildright');

            expect(natives).toHaveLength(0);
        });

        it('should return no native packs for headless stacks', () => {
            const headlessStack = makeStack({
                id: 'headless-paas',
                frontend: 'headless',
            });
            const natives = getNativeFeaturePacks(headlessStack, 'b2b');

            expect(natives).toHaveLength(0);
        });
    });

    describe('isFeaturePackAvailableForPackage', () => {
        it('should return true for required packs', () => {
            expect(isFeaturePackAvailableForPackage('b2b-commerce', 'b2b')).toBe(true);
        });

        it('should return true for optional packs', () => {
            expect(isFeaturePackAvailableForPackage('b2b-commerce', 'isle5')).toBe(true);
            expect(isFeaturePackAvailableForPackage('b2b-commerce', 'citisignal')).toBe(true);
            expect(isFeaturePackAvailableForPackage('b2b-commerce', 'custom')).toBe(true);
        });

        it('should return false for excluded packs', () => {
            expect(isFeaturePackAvailableForPackage('b2b-commerce', 'buildright')).toBe(false);
        });

        it('should return false for unknown package', () => {
            expect(isFeaturePackAvailableForPackage('b2b-commerce', 'nonexistent')).toBe(false);
        });

        it('should return false for unknown pack ID', () => {
            expect(isFeaturePackAvailableForPackage('nonexistent', 'isle5')).toBe(false);
        });
    });

    describe('getFeaturePackSource', () => {
        it('should return source for b2b-commerce', () => {
            const source = getFeaturePackSource('b2b-commerce');

            expect(source).toBeDefined();
            expect(source?.owner).toBe('hlxsites');
            expect(source?.repo).toBe('aem-boilerplate-commerce');
            expect(source?.branch).toBe('b2b');
        });

        it('should return undefined for unknown pack', () => {
            const source = getFeaturePackSource('nonexistent');

            expect(source).toBeUndefined();
        });
    });

    describe('getFeaturePackConfigFlags', () => {
        it('should return config flags for b2b-commerce', () => {
            const flags = getFeaturePackConfigFlags('b2b-commerce');

            expect(flags).toBeDefined();
            expect(flags?.['commerce-b2b-enabled']).toBe(true);
            expect(flags?.['commerce-companies-enabled']).toBe(true);
        });

        it('should return undefined for unknown pack', () => {
            const flags = getFeaturePackConfigFlags('nonexistent');

            expect(flags).toBeUndefined();
        });
    });

    describe('getFeaturePackName', () => {
        it('should return display name for known pack', () => {
            expect(getFeaturePackName('b2b-commerce')).toBe('B2B Commerce');
        });

        it('should return the ID as fallback for unknown pack', () => {
            expect(getFeaturePackName('nonexistent')).toBe('nonexistent');
        });
    });

    describe('getFeaturePack', () => {
        it('should return full definition for b2b-commerce', () => {
            const pack = getFeaturePack('b2b-commerce');

            expect(pack).toBeDefined();
            expect(pack?.id).toBe('b2b-commerce');
            expect(pack?.name).toBe('B2B Commerce');
            expect(pack?.blocks?.install).toBe(true);
            expect(pack?.initializers?.install).toBe(true);
            expect(pack?.initializers?.files).toHaveLength(4);
            expect(pack?.dependencies).toBeDefined();
        });

        it('should return undefined for unknown pack', () => {
            const pack = getFeaturePack('nonexistent');

            expect(pack).toBeUndefined();
        });
    });
});
