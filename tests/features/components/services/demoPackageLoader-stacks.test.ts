/**
 * The two stacks.json lookups, and the injection seam every packages lookup has.
 *
 * WHY SEPARATE FROM `-logic`. That suite injects a packages fixture, which is the
 * right way to test the loader's LOGIC. These two functions have no such seam —
 * `getStackById` and `getAutoSelectedOptionalDependencies` read the bundled
 * `stacks.json` (and, for the second, the bundled `demo-packages.json`)
 * directly. Mocking a config leaf is banned here for a reason
 * (`tests/sop/no-config-leaf-mocks.test.ts`), so these run against the data that
 * actually ships, and each assertion says which shipped fact it depends on.
 *
 * The auto-selection function is the one that matters at runtime: it decides
 * whether a new project silently gains a mesh component. Nothing exercised it.
 */

import {
    getStackById,
    getAutoSelectedOptionalDependencies,
    getPackageById,
    getStorefrontForStack,
    getAvailableStacksForPackage,
    getAllStorefronts,
} from '@/features/components/services/demoPackageLoader';
import { packageFixture, storefrontFixture } from './demoPackageLoader.testUtils';
import type { DemoPackage } from '@/types/demoPackages';

describe('getStackById', () => {
    // The four shipped stacks. This is the canonical lookup that replaced copies
    // in useSelectedStack, the prerequisites check handler, the reset service and
    // the executor.
    it.each(['headless-paas', 'headless-accs', 'eds-paas', 'eds-accs'])(
        'resolves %s to the stack with that id',
        (id) => {
            expect(getStackById(id)?.id).toBe(id);
        },
    );

    it('returns undefined for a stack that is not shipped', () => {
        expect(getStackById('headless-onprem')).toBeUndefined();
    });

    // An empty id must not resolve to the first stack, which is what a lookup
    // that ignored its argument would do.
    it('returns undefined for an empty id rather than the first stack', () => {
        expect(getStackById('')).toBeUndefined();
    });
});

describe('getAutoSelectedOptionalDependencies', () => {
    // buildright is the one shipped package with requiresMesh: true, and eds-paas
    // is the only stack it ships a storefront for. Its stack's optional
    // dependency is the mesh component that gets auto-selected.
    it('returns the stack’s optional dependencies when the package requires mesh', async () => {
        await expect(getAutoSelectedOptionalDependencies('buildright', 'eds-paas')).resolves.toEqual(
            ['eds-commerce-mesh'],
        );
    });

    // citisignal ships requiresMesh: false on the same stack, so the same stack
    // id must produce nothing. This is the pair that proves the mesh requirement
    // is what decides, not the stack.
    it('returns nothing for the same stack when the package does not require mesh', async () => {
        await expect(
            getAutoSelectedOptionalDependencies('citisignal', 'eds-paas'),
        ).resolves.toEqual([]);
    });

    it('returns nothing for a package that does not exist', async () => {
        await expect(getAutoSelectedOptionalDependencies('no-such-pkg', 'eds-paas')).resolves.toEqual(
            [],
        );
    });

    // A mesh-requiring package asked about an unshipped stack: the requirement
    // still resolves from the package level, and then there is no stack to read
    // dependencies off. It must answer with nothing rather than reaching into
    // whichever stack happens to be first.
    it('returns nothing for a stack that is not shipped', async () => {
        await expect(getAutoSelectedOptionalDependencies('buildright', 'no-such-stack'))
            .resolves.toEqual([]);
    });
});

describe('the injected packages list is used instead of the bundled config', () => {
    // Every packages lookup takes an optional list. Passing one must REPLACE the
    // bundled config, not merely be consulted alongside it — otherwise a test or
    // a caller working from a fixture silently sees shipped data.
    const injected: DemoPackage[] = [
        packageFixture('only-one', { 'eds-paas': storefrontFixture('Its storefront') }),
    ];

    it('getPackageById cannot see a shipped package', async () => {
        await expect(getPackageById('citisignal', injected)).resolves.toBeUndefined();
        await expect(getPackageById('only-one', injected)).resolves.toMatchObject({
            id: 'only-one',
        });
    });

    it('getStorefrontForStack resolves only within the injected list', async () => {
        await expect(getStorefrontForStack('citisignal', 'eds-paas', injected)).resolves.toBeUndefined();
        await expect(getStorefrontForStack('only-one', 'eds-paas', injected)).resolves.toMatchObject(
            { name: 'Its storefront' },
        );
    });

    it('getAvailableStacksForPackage lists only the injected storefronts', async () => {
        await expect(getAvailableStacksForPackage('only-one', injected)).resolves.toEqual([
            'eds-paas',
        ]);
        await expect(getAvailableStacksForPackage('citisignal', injected)).resolves.toEqual([]);
    });

    it('getAllStorefronts flattens only the injected list', async () => {
        await expect(getAllStorefronts(injected)).resolves.toEqual([
            { packageId: 'only-one', stackId: 'eds-paas', storefront: expect.any(Object) },
        ]);
    });

    // An empty list is a list, not "no argument given". Falling back to the
    // bundled config here would make a caller that filtered everything out see
    // the whole shipped catalogue instead.
    it('an empty injected list is honoured, not treated as absent', async () => {
        await expect(getAllStorefronts([])).resolves.toEqual([]);
        await expect(getPackageById('citisignal', [])).resolves.toBeUndefined();
    });
});
