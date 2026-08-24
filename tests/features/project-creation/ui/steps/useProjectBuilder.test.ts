/**
 * useProjectBuilder Tests (Slice 2 — Step 2)
 *
 * The selection hook for the Project Builder step. Tests the single-authority
 * mesh selection (selectedAppBuilderComponents carries the mesh since D3; the
 * legacy selectedOptionalDependencies mirror is pinned REMOVED), the
 * cross-package mesh reconciliation on stack change, and the plain
 * field-update handlers (addons, block libraries, custom libs).
 *
 * The instance identity group (onAddCustomAppBuilderComponent instances,
 * onRemove/onRenameAppBuilderComponent) lives in the sibling
 * useProjectBuilder.instances.test.ts; shared fixtures + setup in
 * useProjectBuilder.testUtils.ts.
 *
 * @jest-environment jsdom
 */

import { act } from '@testing-library/react';
import { COMPONENT_IDS } from '@/core/constants';
import type { WizardState } from '@/types/webview';

// The mesh seeding depends on getResolvedMeshRequirement for the reset path.
// Default each test to 'optional' (no auto-include) unless overridden.
jest.mock('@/features/project-creation/services/demoPackageLoader', () => ({
    getResolvedMeshRequirement: jest.fn(() => 'optional'),
    getPackageById: jest.fn(),
}));

// onStackSelect seeds default block libraries (EDS only) via blockLibraryLoader.
// Mock it so the parity tests are deterministic and independent of config JSON.
jest.mock('@/features/project-creation/services/blockLibraryLoader', () => ({
    getNativeBlockLibraries: jest.fn(() => []),
    getDefaultBlockLibraryIds: jest.fn(() => []),
    getPackageDefaultBlockLibraryIds: jest.fn(() => []),
}));

// onBlockLibrariesChange posts the one-time "save defaults" tip offer.
jest.mock('@/core/ui/utils/vscode-api', () => ({
    vscode: { postMessage: jest.fn() },
}));

// Real catalog by default; individual tests append a nativeForPackages entry to
// drive the generic required-component guard (the catalog ships none today).
jest.mock('@/features/project-creation/services/appBuilderComponentCatalogLoader', () => {
    const actual = jest.requireActual(
        '@/features/project-creation/services/appBuilderComponentCatalogLoader'
    );
    return {
        ...actual,
        getAvailableAppBuilderComponents: jest.fn(actual.getAvailableAppBuilderComponents),
    };
});

import { getResolvedMeshRequirement } from '@/features/project-creation/services/demoPackageLoader';
import {
    getNativeBlockLibraries,
    getDefaultBlockLibraryIds,
} from '@/features/project-creation/services/blockLibraryLoader';
import { setup } from './useProjectBuilder.testUtils';

const mockGetResolvedMeshRequirement = getResolvedMeshRequirement as jest.Mock;
const mockGetNativeBlockLibraries = getNativeBlockLibraries as jest.Mock;
const mockGetDefaultBlockLibraryIds = getDefaultBlockLibraryIds as jest.Mock;

beforeEach(() => {
    mockGetResolvedMeshRequirement.mockReset();
    mockGetResolvedMeshRequirement.mockReturnValue('optional');
    mockGetNativeBlockLibraries.mockReset();
    mockGetNativeBlockLibraries.mockReturnValue([]);
    mockGetDefaultBlockLibraryIds.mockReset();
    mockGetDefaultBlockLibraryIds.mockReturnValue([]);
});

// The mesh dual-flow mirror-write was REMOVED by D3 (2026-08-23):
// selectedAppBuilderComponents is the single mesh authority, and the toggle
// never writes the retired selectedOptionalDependencies key. These pins keep
// the mirror from returning.
describe('useProjectBuilder — mesh selection (single authority, D3)', () => {
    it('adds the mesh component id to selectedAppBuilderComponents on select', () => {
        const { result, updateState } = setup({ selectedStack: 'headless-paas' });
        act(() => {
            result.current.onAppBuilderComponentToggle('headless-commerce-mesh', true);
        });
        expect(updateState).toHaveBeenCalledWith(
            expect.objectContaining({
                selectedAppBuilderComponents: ['headless-commerce-mesh'],
            })
        );
    });

    it('removes the mesh component id from selectedAppBuilderComponents on deselect', () => {
        const { result, updateState } = setup({
            selectedStack: 'headless-paas',
            selectedAppBuilderComponents: ['headless-commerce-mesh'],
        });
        act(() => {
            result.current.onAppBuilderComponentToggle('headless-commerce-mesh', false);
        });
        expect(updateState).toHaveBeenCalledWith(
            expect.objectContaining({ selectedAppBuilderComponents: [] })
        );
    });

    it('never writes the retired legacy dependency key on a mesh select (removed-behavior pin)', () => {
        const { result, updateState } = setup({ selectedStack: 'eds-paas' });
        act(() => {
            result.current.onAppBuilderComponentToggle(COMPONENT_IDS.EDS_COMMERCE_MESH, true);
        });
        const call = updateState.mock.calls[0][0] as Record<string, unknown>;
        expect('selectedOptionalDependencies' in call).toBe(false);
    });

    it('never writes the retired legacy dependency key on a mesh deselect (removed-behavior pin)', () => {
        const { result, updateState } = setup({
            selectedStack: 'headless-paas',
            selectedAppBuilderComponents: ['headless-commerce-mesh'],
        });
        act(() => {
            result.current.onAppBuilderComponentToggle('headless-commerce-mesh', false);
        });
        const call = updateState.mock.calls[0][0] as Record<string, unknown>;
        expect('selectedOptionalDependencies' in call).toBe(false);
    });

    it('still writes selectedAppBuilderComponents for a non-mesh component', () => {
        const { result, updateState } = setup({ selectedStack: 'headless-paas' });
        act(() => {
            result.current.onAppBuilderComponentToggle('some-non-mesh-component', true);
        });
        expect(updateState).toHaveBeenCalledWith(
            expect.objectContaining({
                selectedAppBuilderComponents: ['some-non-mesh-component'],
            })
        );
    });

    it('preserves a previously-selected non-mesh component when toggling a mesh', () => {
        const { result, updateState } = setup({
            selectedStack: 'headless-paas',
            selectedAppBuilderComponents: ['some-non-mesh-component'],
        });
        act(() => {
            result.current.onAppBuilderComponentToggle('headless-commerce-mesh', true);
        });
        const call = updateState.mock.calls[0][0] as Partial<WizardState>;
        expect(call.selectedAppBuilderComponents).toEqual(
            expect.arrayContaining(['some-non-mesh-component', 'headless-commerce-mesh'])
        );
    });
});

describe('useProjectBuilder — onStackSelect (cross-package leak guard)', () => {
    it('writes the selected stack id', () => {
        const { result, updateState } = setup();
        act(() => {
            result.current.onStackSelect('headless-paas');
        });
        expect(updateState).toHaveBeenCalledWith(
            expect.objectContaining({ selectedStack: 'headless-paas' })
        );
    });

    it('never writes the retired legacy dependency key (removed-behavior pin)', () => {
        mockGetResolvedMeshRequirement.mockReturnValue(true);
        const { result, updateState } = setup({ selectedStack: 'eds-paas' });
        act(() => {
            result.current.onStackSelect('headless-paas');
        });
        const call = updateState.mock.calls.at(-1)![0] as Record<string, unknown>;
        expect('selectedOptionalDependencies' in call).toBe(false);
    });
});

describe('useProjectBuilder — onStackSelect seeds the mesh into selectedAppBuilderComponents (D3)', () => {
    it('adds the stack mesh id on a stack change when the package requires mesh', () => {
        mockGetResolvedMeshRequirement.mockReturnValue(true);
        const { result, updateState } = setup({ selectedStack: 'eds-paas' });
        act(() => {
            result.current.onStackSelect('headless-paas');
        });
        const call = updateState.mock.calls.at(-1)![0] as Partial<WizardState>;
        expect(call.selectedAppBuilderComponents).toEqual([COMPONENT_IDS.HEADLESS_COMMERCE_MESH]);
    });

    it('strips the old stack mesh id and keeps non-mesh selections on a stack change', () => {
        mockGetResolvedMeshRequirement.mockReturnValue(true);
        const { result, updateState } = setup({
            selectedStack: 'eds-paas',
            selectedAppBuilderComponents: [COMPONENT_IDS.EDS_COMMERCE_MESH, 'acme-widget'],
        });
        act(() => {
            result.current.onStackSelect('headless-paas');
        });
        const call = updateState.mock.calls.at(-1)![0] as Partial<WizardState>;
        expect(call.selectedAppBuilderComponents).toEqual([
            'acme-widget',
            COMPONENT_IDS.HEADLESS_COMMERCE_MESH,
        ]);
    });

    it('strips mesh ids when the new stack does not require mesh', () => {
        mockGetResolvedMeshRequirement.mockReturnValue('optional');
        const { result, updateState } = setup({
            selectedStack: 'eds-paas',
            selectedAppBuilderComponents: [COMPONENT_IDS.EDS_COMMERCE_MESH, 'acme-widget'],
        });
        act(() => {
            result.current.onStackSelect('headless-paas');
        });
        const call = updateState.mock.calls.at(-1)![0] as Partial<WizardState>;
        expect(call.selectedAppBuilderComponents).toEqual(['acme-widget']);
    });

    it('leaves selectedAppBuilderComponents untouched on a same-stack re-select', () => {
        mockGetResolvedMeshRequirement.mockReturnValue(true);
        const { result, updateState } = setup({
            selectedPackage: 'withAddons',
            selectedStack: 'headless-paas',
            selectedAppBuilderComponents: [COMPONENT_IDS.HEADLESS_COMMERCE_MESH],
        });
        act(() => {
            result.current.onStackSelect('headless-paas');
        });
        const call = updateState.mock.calls.at(-1)![0] as Partial<WizardState>;
        expect(call.selectedAppBuilderComponents).toBeUndefined();
    });
});

describe('useProjectBuilder — onArchitectureChange threading', () => {
    it('fires onArchitectureChange with old and new stack ids on a stack CHANGE', () => {
        const onArchitectureChange = jest.fn();
        const { result } = setup({ selectedStack: 'eds-paas' }, { onArchitectureChange });
        act(() => {
            result.current.onStackSelect('headless-paas');
        });
        expect(onArchitectureChange).toHaveBeenCalledWith('eds-paas', 'headless-paas');
    });

    it('does NOT fire onArchitectureChange on the initial stack selection', () => {
        const onArchitectureChange = jest.fn();
        const { result } = setup({ selectedStack: undefined }, { onArchitectureChange });
        act(() => {
            result.current.onStackSelect('eds-paas');
        });
        expect(onArchitectureChange).not.toHaveBeenCalled();
    });

    it('does NOT fire onArchitectureChange when re-selecting the same stack', () => {
        const onArchitectureChange = jest.fn();
        const { result } = setup({ selectedStack: 'eds-paas' }, { onArchitectureChange });
        act(() => {
            result.current.onStackSelect('eds-paas');
        });
        expect(onArchitectureChange).not.toHaveBeenCalled();
    });

    it('still writes the selected stack id when onArchitectureChange is omitted', () => {
        const { result, updateState } = setup({ selectedStack: 'eds-paas' });
        act(() => {
            result.current.onStackSelect('headless-paas');
        });
        expect(updateState).toHaveBeenCalledWith(
            expect.objectContaining({ selectedStack: 'headless-paas' })
        );
    });
});

describe('useProjectBuilder — edsConfig derivation on stack select', () => {
    it('derives edsConfig template fields from the storefront for an EDS stack', () => {
        const { result, updateState } = setup({ selectedPackage: 'citisignal' });
        act(() => {
            result.current.onStackSelect('eds-accs');
        });
        const call = updateState.mock.calls[0][0] as Partial<WizardState>;
        expect(call.edsConfig).toEqual(
            expect.objectContaining({
                templateOwner: 'skukla',
                templateRepo: 'citisignal-eds',
            })
        );
    });

    it('clears edsConfig for a non-EDS (headless) stack', () => {
        const { result, updateState } = setup({
            selectedPackage: 'custom',
            edsConfig: { templateOwner: 'stale', templateRepo: 'stale-repo' } as never,
        });
        act(() => {
            result.current.onStackSelect('headless-paas');
        });
        const call = updateState.mock.calls[0][0] as Partial<WizardState>;
        expect(call.edsConfig).toBeUndefined();
    });
});

describe('useProjectBuilder — onAddCustomAppBuilderComponent (custom URL door)', () => {
    it('writes selectedAppBuilderComponents + appBuilderComponentSources for a custom source', () => {
        const { result, updateState } = setup({ selectedStack: 'headless-paas' });
        act(() => {
            result.current.onAddCustomAppBuilderComponent({ owner: 'acme', repo: 'widget' });
        });
        expect(updateState).toHaveBeenCalledWith(
            expect.objectContaining({
                selectedAppBuilderComponents: ['acme-widget'],
                appBuilderComponentSources: {
                    'acme-widget': { owner: 'acme', repo: 'widget', branch: undefined },
                },
            })
        );
    });

    it('carries an optional branch through to the source', () => {
        const { result, updateState } = setup({ selectedStack: 'headless-paas' });
        act(() => {
            result.current.onAddCustomAppBuilderComponent({
                owner: 'acme',
                repo: 'widget',
                branch: 'dev',
            });
        });
        const call = updateState.mock.calls[0][0] as Partial<WizardState>;
        expect(call.appBuilderComponentSources).toEqual({
            'acme-widget': { owner: 'acme', repo: 'widget', branch: 'dev' },
        });
    });

    it('merges the new source with pre-existing appBuilderComponentSources', () => {
        const { result, updateState } = setup({
            selectedStack: 'headless-paas',
            selectedAppBuilderComponents: ['prior-repo'],
            appBuilderComponentSources: { 'prior-repo': { owner: 'prior', repo: 'repo' } },
        });
        act(() => {
            result.current.onAddCustomAppBuilderComponent({ owner: 'acme', repo: 'widget' });
        });
        const call = updateState.mock.calls[0][0] as Partial<WizardState>;
        expect(call.selectedAppBuilderComponents).toEqual(
            expect.arrayContaining(['prior-repo', 'acme-widget'])
        );
        expect(call.appBuilderComponentSources).toEqual({
            'prior-repo': { owner: 'prior', repo: 'repo' },
            'acme-widget': { owner: 'acme', repo: 'widget', branch: undefined },
        });
    });
});

describe('required mesh cannot be toggled off', () => {
    // The mesh-required enforcement's defense-in-depth: the card layer hides
    // Remove on a required mesh, and this guard makes the underlying toggle
    // refuse too — a second door found later must not reopen the hole (the
    // silent failure is a storefront on the bare Commerce endpoint rendering
    // empty product blocks).
    it('ignores a toggle-off for the mesh when the package requires it', () => {
        mockGetResolvedMeshRequirement.mockReturnValue(true);
        const { result, updateState } = setup({
            selectedPackage: 'citisignal',
            selectedStack: 'eds-paas',
            selectedAppBuilderComponents: ['eds-commerce-mesh'],
        });

        act(() => {
            result.current.onAppBuilderComponentToggle('eds-commerce-mesh', false);
        });

        expect(updateState).not.toHaveBeenCalled();
    });

    it('still allows toggle-off when the mesh is optional', () => {
        mockGetResolvedMeshRequirement.mockReturnValue('optional');
        const { result, updateState } = setup({
            selectedPackage: 'citisignal',
            selectedStack: 'eds-paas',
            selectedAppBuilderComponents: ['eds-commerce-mesh'],
        });

        act(() => {
            result.current.onAppBuilderComponentToggle('eds-commerce-mesh', false);
        });

        const call = updateState.mock.calls[0][0] as Partial<WizardState>;
        expect(call.selectedAppBuilderComponents).toEqual([]);
    });

    it('never blocks toggle-ON, required or not', () => {
        mockGetResolvedMeshRequirement.mockReturnValue(true);
        const { result, updateState } = setup({
            selectedPackage: 'citisignal',
            selectedStack: 'eds-paas',
        });

        act(() => {
            result.current.onAppBuilderComponentToggle('eds-commerce-mesh', true);
        });

        expect(updateState).toHaveBeenCalled();
    });
});

describe('required NON-mesh components cannot be removed (generic guard)', () => {
    // The lock is generic: a nativeForPackages catalog entry resolves
    // requirement:'required' exactly like a required mesh, and both removal
    // doors (the toggle and the remove callback) must refuse it.
    const { getAvailableAppBuilderComponents } = jest.requireMock(
        '@/features/project-creation/services/appBuilderComponentCatalogLoader'
    ) as { getAvailableAppBuilderComponents: jest.Mock };
    const actualLoader = jest.requireActual(
        '@/features/project-creation/services/appBuilderComponentCatalogLoader'
    ) as { getAvailableAppBuilderComponents: (b: string, f: string) => unknown[] };

    const nativeEntry = {
        id: 'native-thing',
        name: 'Native Thing',
        description: 'Ships with citisignal',
        kind: 'integration',
        source: { owner: 'o', repo: 'native-thing', branch: 'main' },
        nativeForPackages: ['citisignal'],
    };

    beforeEach(() => {
        getAvailableAppBuilderComponents.mockImplementation((b: string, f: string) => [
            ...actualLoader.getAvailableAppBuilderComponents(b, f),
            nativeEntry,
        ]);
    });

    afterEach(() => {
        getAvailableAppBuilderComponents.mockImplementation(
            actualLoader.getAvailableAppBuilderComponents
        );
    });

    it('onRemoveAppBuilderComponent refuses a nativeForPackages entry', () => {
        const { result, updateState } = setup({
            selectedPackage: 'citisignal',
            selectedStack: 'eds-paas',
            selectedAppBuilderComponents: ['native-thing'],
        });

        act(() => {
            result.current.onRemoveAppBuilderComponent('native-thing');
        });

        expect(updateState).not.toHaveBeenCalled();
    });

    it('onAppBuilderComponentToggle refuses toggling the same entry off', () => {
        const { result, updateState } = setup({
            selectedPackage: 'citisignal',
            selectedStack: 'eds-paas',
            selectedAppBuilderComponents: ['native-thing'],
        });

        act(() => {
            result.current.onAppBuilderComponentToggle('native-thing', false);
        });

        expect(updateState).not.toHaveBeenCalled();
    });

    it('still removes it for a package it is NOT native to', () => {
        const { result, updateState } = setup({
            selectedPackage: 'custom',
            selectedStack: 'headless-paas',
            selectedAppBuilderComponents: ['native-thing'],
        });

        act(() => {
            result.current.onRemoveAppBuilderComponent('native-thing');
        });

        expect(updateState).toHaveBeenCalled();
    });
});
