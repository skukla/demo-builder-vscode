/**
 * Tests for mesh requirement resolution logic.
 *
 * Covers getResolvedMeshRequirement: storefront-level override,
 * package-level fallback, and the three-state requiresMesh values.
 */

import { packageFixture, storefrontFixture } from './demoPackageLoader.testUtils';

import {
    getResolvedMeshRequirement,
    isMeshNeededByPackage,
} from '@/features/components/services/demoPackageLoader';
import type { DemoPackage } from '@/types/demoPackages';

describe('getResolvedMeshRequirement', () => {
    const basePkg = packageFixture('test-pkg', {
        'eds-accs': storefrontFixture('EDS ACCS'),
        'headless-paas': storefrontFixture('Headless PaaS', { requiresMesh: true }),
    });

    it('should return package-level requiresMesh when storefront has no override', () => {
        const pkg = { ...basePkg, requiresMesh: false as const };
        expect(getResolvedMeshRequirement(pkg, 'eds-accs')).toBe(false);
    });

    it('should return storefront-level override when defined', () => {
        const pkg = { ...basePkg, requiresMesh: false as const };
        expect(getResolvedMeshRequirement(pkg, 'headless-paas')).toBe(true);
    });

    it('should return "optional" from package level', () => {
        const pkg = { ...basePkg, requiresMesh: 'optional' as const };
        expect(getResolvedMeshRequirement(pkg, 'eds-accs')).toBe('optional');
    });

    it('should return "optional" from storefront level override', () => {
        const pkg = {
            ...basePkg,
            requiresMesh: false as const,
            storefronts: {
                ...basePkg.storefronts,
                'eds-accs': {
                    ...basePkg.storefronts!['eds-accs'],
                    requiresMesh: 'optional' as const,
                },
            },
        } as unknown as DemoPackage;
        expect(getResolvedMeshRequirement(pkg, 'eds-accs')).toBe('optional');
    });

    it('should return undefined when package is undefined', () => {
        expect(getResolvedMeshRequirement(undefined, 'eds-accs')).toBeUndefined();
    });

    it('should return package-level value when stackId has no matching storefront', () => {
        const pkg = { ...basePkg, requiresMesh: 'optional' as const };
        expect(getResolvedMeshRequirement(pkg, 'nonexistent-stack')).toBe('optional');
    });

    it('should return undefined when package has no requiresMesh', () => {
        const pkg = { ...basePkg };
        delete pkg.requiresMesh;
        expect(getResolvedMeshRequirement(pkg, 'eds-accs')).toBeUndefined();
    });

    // demo-packages.json is read through a cast, so `storefronts` being required
    // on the type is a claim about the file, not a guarantee. A package whose
    // entry omits it must still resolve its package-level requirement rather
    // than throwing inside the wizard's mesh decision.
    it('falls back to the package level when the package declares no storefronts', () => {
        const pkg = { id: 'no-storefronts', requiresMesh: true } as unknown as DemoPackage;
        expect(getResolvedMeshRequirement(pkg, 'eds-accs')).toBe(true);
    });

    it('should prefer storefront false over package true', () => {
        const pkg = {
            ...basePkg,
            requiresMesh: true as const,
            storefronts: {
                ...basePkg.storefronts,
                'eds-accs': {
                    ...basePkg.storefronts!['eds-accs'],
                    requiresMesh: false as const,
                },
            },
        } as unknown as DemoPackage;
        expect(getResolvedMeshRequirement(pkg, 'eds-accs')).toBe(false);
    });
});

describe('isMeshNeededByPackage — does this demo need its mesh?', () => {
    const packages = [
        packageFixture('needs', { 'headless-paas': storefrontFixture('Headless', { requiresMesh: true }) }),
        { ...packageFixture('optional', { 'eds-paas': storefrontFixture('EDS') }), requiresMesh: 'optional' as const },
    ];

    it('is true when the requirement resolves to true for the stack', () => {
        expect(isMeshNeededByPackage('needs', 'headless-paas', packages)).toBe(true);
    });

    it('is false for an optional mesh, an unknown package, or no stack', () => {
        expect(isMeshNeededByPackage('optional', 'eds-paas', packages)).toBe(false);
        expect(isMeshNeededByPackage('nobody', 'eds-paas', packages)).toBe(false);
        expect(isMeshNeededByPackage('needs', undefined, packages)).toBe(false);
    });

    it('reads the bundled packages by default: CitiSignal headless needs its mesh', () => {
        expect(isMeshNeededByPackage('citisignal', 'headless-paas')).toBe(true);
        expect(isMeshNeededByPackage('citisignal', 'eds-paas')).toBe(false);
    });
});
