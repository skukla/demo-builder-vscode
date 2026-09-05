/**
 * Shared fixtures for the demoPackageLoader suites.
 *
 * The three suites here ask different questions of the same shapes — injected
 * loader logic, mesh-requirement resolution, and the stacks.json lookups — and
 * each was building its own package literal. A DemoPackage is a nested shape
 * with a required `storefronts` record, so a hand-rolled one drifts: the first
 * two suites already disagreed about whether a storefront carries a `type` on
 * its source.
 */

import type { DemoPackage, GitSource } from '@/types/demoPackages';

/** A storefront git source, in the shape demo-packages.json actually ships. */
export const gitSource = (url: string): GitSource => ({
    type: 'git',
    url,
    branch: 'main',
    gitOptions: { shallow: true },
});

/**
 * Build a package with the given storefronts.
 *
 * The cast is deliberate and local to this file: demo-packages.json is read
 * through one, so a fixture that could not be built without every optional
 * field would be a stricter shape than production ever sees.
 */
export function packageFixture(
    id: string,
    storefronts: Record<string, unknown>,
    rest: Record<string, unknown> = {},
): DemoPackage {
    return {
        id,
        name: id,
        description: `${id} test package`,
        configDefaults: {},
        storefronts,
        ...rest,
    } as unknown as DemoPackage;
}

/** A storefront body, optionally carrying its own `requiresMesh` override. */
export function storefrontFixture(
    name: string,
    rest: Record<string, unknown> = {},
): Record<string, unknown> {
    return {
        name,
        description: `${name} variant`,
        source: gitSource(`https://example.test/${name}`),
        ...rest,
    };
}
