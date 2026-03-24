/**
 * Tests for mesh requirement resolution logic.
 *
 * Covers getResolvedMeshRequirement: storefront-level override,
 * package-level fallback, and the three-state requiresMesh values.
 */

import { getResolvedMeshRequirement } from '@/features/project-creation/services/demoPackageLoader';
import type { DemoPackage } from '@/types/demoPackages';

describe('getResolvedMeshRequirement', () => {
    const basePkg = {
        id: 'test-pkg',
        name: 'Test',
        description: 'Test package',
        storefronts: {
            'eds-accs': {
                name: 'EDS ACCS',
                description: 'Test',
                source: { owner: 'test', repo: 'test', branch: 'main' },
            },
            'headless-paas': {
                name: 'Headless PaaS',
                description: 'Test',
                source: { owner: 'test', repo: 'test', branch: 'main' },
                requiresMesh: true,
            },
        },
    } as unknown as DemoPackage;

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
        delete (pkg as any).requiresMesh;
        expect(getResolvedMeshRequirement(pkg, 'eds-accs')).toBeUndefined();
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
