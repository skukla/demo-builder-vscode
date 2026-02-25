/**
 * Block Library Loader Tests
 *
 * Tests for block library loading, filtering, and source resolution.
 * Libraries are defined in block-libraries.json and filtered by
 * stack type and package exclusions.
 *
 * Includes config sync tests that verify block-libraries.json stays
 * aligned with the VS Code settings schema in package.json.
 */

import * as fs from 'fs';
import * as path from 'path';
import {
    getAvailableBlockLibraries,
    getNativeBlockLibraries,
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

        it('should not include native libraries in available list (CitiSignal blocks native to CitiSignal)', () => {
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

        it('should not include native libraries in available list (BuildRight blocks native to BuildRight)', () => {
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

        it('should not include pinned libraries for other packages', () => {
            const edsStack = makeStack();
            const libs = getAvailableBlockLibraries(edsStack, 'custom');

            // BuildRight blocks are pinned to buildright only
            const buildrightLib = libs.find(l => l.id === 'buildright-blocks');
            expect(buildrightLib).toBeUndefined();
        });

        it('should return 2 libraries for Custom package on EDS', () => {
            const edsStack = makeStack();
            const libs = getAvailableBlockLibraries(edsStack, 'custom');

            // Custom sees: citisignal-blocks, isle5 (not buildright-blocks — pinned to buildright)
            expect(libs).toHaveLength(2);
        });

        it('should return 1 library for CitiSignal on EDS', () => {
            const edsStack = makeStack();
            const libs = getAvailableBlockLibraries(edsStack, 'citisignal');

            // CitiSignal sees: isle5 (not citisignal-blocks — native, not buildright-blocks — pinned)
            expect(libs).toHaveLength(1);
            expect(libs[0].id).toBe('isle5');
        });
    });

    describe('getNativeBlockLibraries', () => {
        it('should return citisignal-blocks as native for CitiSignal package', () => {
            const edsStack = makeStack();
            const natives = getNativeBlockLibraries(edsStack, 'citisignal');

            expect(natives).toHaveLength(1);
            expect(natives[0].id).toBe('citisignal-blocks');
        });

        it('should return buildright-blocks as native for BuildRight package', () => {
            const edsStack = makeStack();
            const natives = getNativeBlockLibraries(edsStack, 'buildright');

            expect(natives).toHaveLength(1);
            expect(natives[0].id).toBe('buildright-blocks');
        });

        it('should return no native libraries for Custom package', () => {
            const edsStack = makeStack();
            const natives = getNativeBlockLibraries(edsStack, 'custom');

            expect(natives).toHaveLength(0);
        });

        it('should return no native libraries for headless stacks', () => {
            const headlessStack = makeStack({
                id: 'headless-paas',
                frontend: 'headless',
            });
            const natives = getNativeBlockLibraries(headlessStack, 'citisignal');

            expect(natives).toHaveLength(0);
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

        it('should use userDefaults when provided instead of config defaults', () => {
            const edsStack = makeStack();
            const userDefaults = ['citisignal-blocks'];
            const defaults = getDefaultBlockLibraryIds(edsStack, 'custom', userDefaults);

            expect(defaults).not.toContain('isle5');
            expect(defaults).toContain('citisignal-blocks');
        });

        it('should filter out native libraries even with userDefaults', () => {
            const edsStack = makeStack();
            const userDefaults = ['isle5', 'citisignal-blocks'];
            // CitiSignal package should not see citisignal-blocks even if userDefaults includes it
            const defaults = getDefaultBlockLibraryIds(edsStack, 'citisignal', userDefaults);

            expect(defaults).toContain('isle5');
            expect(defaults).not.toContain('citisignal-blocks');
        });

        it('should fall back to config defaults when userDefaults is undefined', () => {
            const edsStack = makeStack();
            const defaults = getDefaultBlockLibraryIds(edsStack, 'custom', undefined);

            // Same as without userDefaults — isle5 has default: true in config
            expect(defaults).toContain('isle5');
            expect(defaults).not.toContain('citisignal-blocks');
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
            expect(getBlockLibraryName('isle5')).toBe('Garner Block Collection');
            expect(getBlockLibraryName('citisignal-blocks')).toBe('Demo Team Block Collection');
            expect(getBlockLibraryName('buildright-blocks')).toBe('BuildRight Blocks');
        });

        it('should return the ID as fallback for unknown library', () => {
            expect(getBlockLibraryName('nonexistent')).toBe('nonexistent');
        });
    });

    describe('config sync: block-libraries.json ↔ package.json', () => {
        // Load both config files once for this describe block
        const projectRoot = path.resolve(__dirname, '../../../../');
        const packageJson = JSON.parse(
            fs.readFileSync(path.join(projectRoot, 'package.json'), 'utf-8'),
        );
        const blockLibrariesJson = JSON.parse(
            fs.readFileSync(
                path.join(projectRoot, 'src/features/project-creation/config/block-libraries.json'),
                'utf-8',
            ),
        );

        // Extract the settings schema from package.json
        const blockLibSection = packageJson.contributes.configuration.find(
            (s: { title: string }) => s.title === 'Block Libraries',
        );
        const settingSchema = blockLibSection?.properties?.['demoBuilder.blockLibraries.defaults'];
        const enumValues: string[] = settingSchema?.items?.enum ?? [];
        const enumDescriptions: string[] = settingSchema?.items?.enumDescriptions ?? [];
        const defaultValue: string[] = settingSchema?.default ?? [];

        // Extract library data from block-libraries.json
        const libraries: Array<{ id: string; name: string; description: string; default?: boolean }> =
            blockLibrariesJson.libraries;
        const libraryIds = libraries.map((l: { id: string }) => l.id);

        it('should have the same library IDs in both files', () => {
            expect(enumValues).toEqual(libraryIds);
        });

        it('should have one enumDescription per library', () => {
            expect(enumDescriptions).toHaveLength(libraries.length);
        });

        it('should include each library name in its enumDescription', () => {
            libraries.forEach((lib, i) => {
                expect(enumDescriptions[i]).toContain(lib.name);
            });
        });

        it('should have default array matching libraries with default: true', () => {
            const expectedDefaults = libraries
                .filter((l: { default?: boolean }) => l.default)
                .map((l: { id: string }) => l.id);
            expect(defaultValue).toEqual(expectedDefaults);
        });

        it('should have demoBuilder.blockLibraries.custom setting in package.json', () => {
            const customSetting = blockLibSection?.properties?.['demoBuilder.blockLibraries.custom'];
            expect(customSetting).toBeDefined();
            expect(customSetting.type).toBe('array');
            expect(customSetting.default).toEqual([]);
        });
    });
});
