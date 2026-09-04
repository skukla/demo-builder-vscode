/**
 * useProjectBuilder — what picking a stack SEEDS.
 *
 * One press writes six fields at once: the stack, the reconciled mesh selection,
 * the EDS template config, the default addons, and both block-library lists.
 * Each is derived from a different pair of (package, stack) facts, so this suite
 * asserts the payload of that single updateState call field by field — including
 * the two cases where a lookup misses, since `stacks.find` and `packages.find`
 * can both come back empty and neither may throw.
 *
 * Fixtures and the render wrapper are shared through useProjectBuilder.testUtils.
 */

import { act } from '@testing-library/react';
import type { DemoPackage } from '@/types/demoPackages';
import type { Stack } from '@/types/stacks';
import type { WizardState } from '@/types/webview';

jest.mock('@/features/components/services/demoPackageLoader', () => ({
    getResolvedMeshRequirement: jest.fn(() => 'optional'),
    getPackageById: jest.fn(),
}));

jest.mock('@/features/components/services/blockLibraryLoader', () => ({
    getNativeBlockLibraries: jest.fn(() => []),
    getDefaultBlockLibraryIds: jest.fn(() => []),
    getPackageDefaultBlockLibraryIds: jest.fn(() => []),
}));

jest.mock('@/core/ui/utils/vscode-api', () => ({
    vscode: { postMessage: jest.fn() },
}));

import { getResolvedMeshRequirement } from '@/features/components/services/demoPackageLoader';
import {
    getNativeBlockLibraries,
    getDefaultBlockLibraryIds,
} from '@/features/components/services/blockLibraryLoader';
import { setup, edsStack, headlessStack, withAddons } from './useProjectBuilder.testUtils';

const mockMeshRequirement = getResolvedMeshRequirement as jest.Mock;
const mockNativeLibraries = getNativeBlockLibraries as jest.Mock;
const mockDefaultLibraryIds = getDefaultBlockLibraryIds as jest.Mock;

beforeEach(() => {
    mockMeshRequirement.mockReset();
    mockMeshRequirement.mockReturnValue('optional');
    mockNativeLibraries.mockReset();
    mockNativeLibraries.mockReturnValue([]);
    mockDefaultLibraryIds.mockReset();
    mockDefaultLibraryIds.mockReturnValue([]);
});

/** The single payload onStackSelect wrote. */
function selectStack(
    s: ReturnType<typeof setup>,
    stackId: string
): Record<string, unknown> {
    act(() => s.result.current.onStackSelect(stackId));
    const calls = s.updateState.mock.calls;
    return calls[calls.length - 1][0] as Record<string, unknown>;
}

describe('useProjectBuilder — addon seeding', () => {
    it("seeds the package's required addons alongside the stack's defaults", () => {
        const s = setup({ selectedPackage: 'withAddons' });

        // withAddons marks live-search required and foo optional; edsStack
        // defaults live-search and offers catalog-service undefaulted.
        expect(selectStack(s, 'eds-paas').selectedAddons).toEqual(['live-search']);
    });

    it('keeps a required addon the stack does not offer at all', () => {
        const s = setup({ selectedPackage: 'withAddons' });

        // headlessStack has no optionalAddons key — the required addon is the
        // whole seed, and the missing key must not throw.
        expect(selectStack(s, 'headless-paas').selectedAddons).toEqual(['live-search']);
    });

    it('seeds only the stack defaults for a package that requires no addons', () => {
        const s = setup({ selectedPackage: 'citisignal' });

        expect(selectStack(s, 'eds-paas').selectedAddons).toEqual(['live-search']);
    });

    it('seeds nothing for a package id that is not in the catalog', () => {
        const s = setup({ selectedPackage: 'no-such-package' });

        // No package resolves, so only the stack's defaults remain.
        expect(selectStack(s, 'headless-paas').selectedAddons).toEqual([]);
    });
});

describe('useProjectBuilder — EDS config seeding', () => {
    it('builds the config for a stack that needs GitHub but not DA.live', () => {
        const gitHubOnly: Stack = { ...edsStack, requiresGitHub: true };
        const s = setup({ selectedPackage: 'citisignal' }, { stacks: [gitHubOnly] });

        expect(selectStack(s, 'eds-paas').edsConfig).toBeDefined();
    });

    it('builds the config for a stack that needs DA.live but not GitHub', () => {
        const daLiveOnly: Stack = { ...edsStack, requiresDaLive: true };
        const s = setup({ selectedPackage: 'citisignal' }, { stacks: [daLiveOnly] });

        expect(selectStack(s, 'eds-paas').edsConfig).toBeDefined();
    });

    it('clears the config for an EDS stack the package has no storefront for', () => {
        const gitHubOnly: Stack = { ...headlessStack, id: 'eds-paas', requiresGitHub: true };
        const noStorefronts = {
            id: 'bare',
            name: 'Bare',
            description: 'no storefronts key at all',
            configDefaults: {},
        } as unknown as DemoPackage;
        const s = setup(
            { selectedPackage: 'bare' },
            { packages: [noStorefronts], stacks: [gitHubOnly] }
        );

        expect(selectStack(s, 'eds-paas').edsConfig).toBeUndefined();
    });

    it('clears the config when the package id resolves to nothing', () => {
        const s = setup({ selectedPackage: 'no-such-package' });

        expect(selectStack(s, 'eds-paas').edsConfig).toBeUndefined();
    });
});

describe('useProjectBuilder — block-library seeding', () => {
    it('falls back to the setting defaults when the state holds an EMPTY custom list', () => {
        const fromSettings = [{ name: 'Mine', source: { owner: 'o', repo: 'mine', branch: 'main' } }];
        const s = setup(
            { selectedPackage: 'citisignal', customBlockLibraries: [] },
            { customBlockLibraryDefaults: fromSettings }
        );

        expect(selectStack(s, 'eds-paas').customBlockLibraries).toEqual(fromSettings);
    });

    it("keeps the state's own custom libraries over the setting defaults", () => {
        const fromState = [{ name: 'State', source: { owner: 'o', repo: 'state-lib', branch: 'main' } }];
        const s = setup(
            { selectedPackage: 'citisignal', customBlockLibraries: fromState },
            { customBlockLibraryDefaults: [{ name: 'Mine', source: { owner: 'o', repo: 'mine', branch: 'main' } }] }
        );

        expect(selectStack(s, 'eds-paas').customBlockLibraries).toEqual(fromState);
    });

    it('seeds an empty custom list when neither the state nor the settings hold any', () => {
        const s = setup({ selectedPackage: 'citisignal' });

        expect(selectStack(s, 'eds-paas').customBlockLibraries).toEqual([]);
    });

    it('clears both lists for a non-EDS stack', () => {
        const s = setup(
            { selectedPackage: 'citisignal', customBlockLibraries: [] },
            { customBlockLibraryDefaults: [{ name: 'Mine', source: { owner: 'o', repo: 'mine', branch: 'main' } }] }
        );

        const update = selectStack(s, 'headless-paas');
        expect(update.selectedBlockLibraries).toEqual([]);
        expect(update.customBlockLibraries).toEqual([]);
    });
});

describe('useProjectBuilder — a stack id the catalog does not have', () => {
    it('records the id and seeds nothing, rather than throwing', () => {
        mockMeshRequirement.mockReturnValue(true);
        const s = setup({
            selectedPackage: 'citisignal',
            selectedStack: 'eds-paas',
            selectedAppBuilderComponents: ['eds-commerce-mesh', 'acme-widget'],
        });

        const update = selectStack(s, 'no-such-stack');

        expect(update.selectedStack).toBe('no-such-stack');
        // The old stack's mesh is stripped and no new one can be seeded, because
        // the unknown stack declares no optional dependencies.
        expect(update.selectedAppBuilderComponents).toEqual(['acme-widget']);
        expect(update.selectedAddons).toEqual([]);
        expect(update.edsConfig).toBeUndefined();
        expect(update.customBlockLibraries).toEqual([]);
    });
});

describe('useProjectBuilder — re-selecting the stack already chosen', () => {
    it('leaves the component selection out of the update entirely', () => {
        const s = setup({
            selectedPackage: 'citisignal',
            selectedStack: 'eds-paas',
            selectedAppBuilderComponents: ['eds-commerce-mesh'],
        });

        const update = selectStack(s, 'eds-paas');

        // Writing the key as undefined is NOT the same as omitting it: the
        // reducer would take it as "clear the selection".
        expect(Object.prototype.hasOwnProperty.call(update, 'selectedAppBuilderComponents')).toBe(
            false
        );
    });
});

describe('useProjectBuilder — the package the selection is read from', () => {
    it("uses the SELECTED package's addons, not the first in the catalog", () => {
        // withAddons is third in the default catalog; citisignal is first and
        // requires nothing, so a lookup that ignored the id would seed nothing.
        const s = setup({ selectedPackage: 'withAddons' } as Partial<WizardState>, {
            packages: [
                { ...withAddons, id: 'decoy', addons: undefined } as unknown as DemoPackage,
                withAddons,
            ],
        });

        expect(selectStack(s, 'headless-paas').selectedAddons).toEqual(['live-search']);
    });
});
