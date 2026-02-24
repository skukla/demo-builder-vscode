/**
 * Block Library Loader Tests
 *
 * Tests for block library loading, filtering, and source resolution.
 * Libraries are defined in block-libraries.json and filtered by
 * stack type and package exclusions.
 */

import {
    getAvailableBlockLibraries,
    getDefaultBlockLibraryIds,
    getBlockLibrarySource,
    getBlockLibraryName,
} from '@/features/project-creation/services/blockLibraryLoader';
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

describe('blockLibraryLoader', () => {
    describe('getAvailableBlockLibraries', () => {
        it('should return libraries for EDS stacks', () => {
            const edsStack = makeStack({ frontend: 'eds-storefront' });
            const libs = getAvailableBlockLibraries(edsStack, 'custom');

            expect(libs.length).toBeGreaterThan(0);
            libs.forEach(lib => {
                expect(lib.stackTypes).toContain('eds-storefront');
            });
        });

        it('should return no libraries for headless stacks', () => {
            const headlessStack = makeStack({
                id: 'headless-paas',
                frontend: 'headless',
            });
            const libs = getAvailableBlockLibraries(headlessStack, 'citisignal');

            expect(libs).toHaveLength(0);
        });

        it('should exclude libraries for the current package (CitiSignal blocks hidden from CitiSignal)', () => {
            const edsStack = makeStack();
            const libs = getAvailableBlockLibraries(edsStack, 'citisignal');

            const citisignalLib = libs.find(l => l.id === 'citisignal-blocks');
            expect(citisignalLib).toBeUndefined();
        });

        it('should include CitiSignal blocks for non-CitiSignal packages', () => {
            const edsStack = makeStack();
            const libs = getAvailableBlockLibraries(edsStack, 'custom');

            const citisignalLib = libs.find(l => l.id === 'citisignal-blocks');
            expect(citisignalLib).toBeDefined();
            expect(citisignalLib?.type).toBe('storefront');
        });

        it('should exclude BuildRight blocks for BuildRight package', () => {
            const edsStack = makeStack();
            const libs = getAvailableBlockLibraries(edsStack, 'buildright');

            const buildrightLib = libs.find(l => l.id === 'buildright-blocks');
            expect(buildrightLib).toBeUndefined();
        });

        it('should include standalone libraries (isle5) for all packages', () => {
            const edsStack = makeStack();

            for (const pkg of ['citisignal', 'buildright', 'custom']) {
                const libs = getAvailableBlockLibraries(edsStack, pkg);
                const isle5 = libs.find(l => l.id === 'isle5');
                expect(isle5).toBeDefined();
                expect(isle5?.type).toBe('standalone');
            }
        });

        it('should return all 3 libraries for Custom package on EDS', () => {
            const edsStack = makeStack();
            const libs = getAvailableBlockLibraries(edsStack, 'custom');

            // Custom sees: isle5, citisignal-blocks, buildright-blocks
            expect(libs).toHaveLength(3);
        });

        it('should return 2 libraries for CitiSignal on EDS (excludes own blocks)', () => {
            const edsStack = makeStack();
            const libs = getAvailableBlockLibraries(edsStack, 'citisignal');

            // CitiSignal sees: isle5, buildright-blocks (not citisignal-blocks)
            expect(libs).toHaveLength(2);
        });
    });

    describe('getDefaultBlockLibraryIds', () => {
        it('should return isle5 as default for EDS stacks', () => {
            const edsStack = makeStack();
            const defaults = getDefaultBlockLibraryIds(edsStack, 'custom');

            expect(defaults).toContain('isle5');
        });

        it('should not include storefront libraries as defaults', () => {
            const edsStack = makeStack();
            const defaults = getDefaultBlockLibraryIds(edsStack, 'custom');

            expect(defaults).not.toContain('citisignal-blocks');
            expect(defaults).not.toContain('buildright-blocks');
        });

        it('should return empty array for headless stacks', () => {
            const headlessStack = makeStack({
                id: 'headless-paas',
                frontend: 'headless',
            });
            const defaults = getDefaultBlockLibraryIds(headlessStack, 'citisignal');

            expect(defaults).toHaveLength(0);
        });
    });

    describe('getBlockLibrarySource', () => {
        it('should return source for isle5', () => {
            const source = getBlockLibrarySource('isle5');

            expect(source).toBeDefined();
            expect(source?.owner).toBe('skukla');
            expect(source?.repo).toBe('isle5');
            expect(source?.branch).toBe('main');
        });

        it('should return source for citisignal-blocks', () => {
            const source = getBlockLibrarySource('citisignal-blocks');

            expect(source).toBeDefined();
            expect(source?.owner).toBe('skukla');
            expect(source?.repo).toBe('citisignal-eds-boilerplate');
        });

        it('should return source for buildright-blocks', () => {
            const source = getBlockLibrarySource('buildright-blocks');

            expect(source).toBeDefined();
            expect(source?.owner).toBe('skukla');
            expect(source?.repo).toBe('buildright-eds');
        });

        it('should return undefined for unknown library', () => {
            const source = getBlockLibrarySource('nonexistent');

            expect(source).toBeUndefined();
        });
    });

    describe('getBlockLibraryName', () => {
        it('should return display name for known library', () => {
            expect(getBlockLibraryName('isle5')).toBe('Commerce Block Collection');
            expect(getBlockLibraryName('citisignal-blocks')).toBe('CitiSignal Blocks');
            expect(getBlockLibraryName('buildright-blocks')).toBe('BuildRight Blocks');
        });

        it('should return the ID as fallback for unknown library', () => {
            expect(getBlockLibraryName('nonexistent')).toBe('nonexistent');
        });
    });
});
