/**
 * Typed builders for catalog entries, so a suite that injects a `packages`
 * fixture writes the two or three fields it is about and the compiler fills
 * the rest with a real `DemoPackage` / `Storefront` shape.
 */

import type { AddedDemo } from '@/types/projectFile';
import type { DemoPackage, Storefront } from '@/types/demoPackages';

export function makeStorefront(overrides: Partial<Storefront> = {}): Storefront {
    return {
        name: 'Test storefront',
        description: 'A storefront for tests',
        source: {
            type: 'git',
            url: 'https://github.com/example/storefront',
            branch: 'main',
            gitOptions: { shallow: true },
        },
        ...overrides,
    };
}

export function makeDemoPackage(overrides: Partial<DemoPackage> = {}): DemoPackage {
    return {
        id: 'test-package',
        name: 'Test Package',
        description: 'A package for tests',
        configDefaults: {},
        storefronts: {},
        ...overrides,
    };
}

export function makeAddedDemo(overrides: Partial<AddedDemo> = {}): AddedDemo {
    return {
        kind: 'demo',
        version: 1,
        name: 'Isle5 by Jen',
        source: { owner: 'jen', repo: 'isle5-demo' },
        storefrontKind: 'eds',
        ...overrides,
    };
}

/**
 * `isMeshRequired` for a suite that mocks the demo package loader by hand.
 *
 * Production asks "does this package need the mesh?" through `isMeshRequired`,
 * which reads `getResolvedMeshRequirement`. A suite that mocks the whole loader
 * controls the second; this reads it back, so each test's answer still decides
 * and no suite keeps a copy of the rule. Inside the mock factory:
 *
 *     isMeshRequired: (pkg: unknown, stackId: unknown) =>
 *         jest.requireActual('../../../helpers/demoPackageFixtures').isMeshRequiredThroughMock(pkg, stackId),
 */
export function isMeshRequiredThroughMock(pkg: unknown, stackId: unknown): boolean {
    const loader = jest.requireMock<{ getResolvedMeshRequirement: (p: unknown, s: unknown) => unknown }>(
        '@/features/components/services/demoPackageLoader',
    );
    return loader.getResolvedMeshRequirement(pkg, stackId) === true;
}
