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
