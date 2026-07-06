/**
 * useProjectBuilder Tests (Slice 2 — Step 2)
 *
 * The selection/dual-flow hook for the Project Builder step. Tests the mesh
 * mirror-write invariant (a mesh App Builder component toggle writes BOTH
 * selectedAppBuilderComponents AND the mapped legacy selectedOptionalDependencies),
 * the non-mesh isolation (no optionalDeps churn), the cross-package mesh reset,
 * and the plain field-update handlers (addons, block libraries, custom libs).
 *
 * @jest-environment jsdom
 */

import { renderHook, act } from '@testing-library/react';
import { useProjectBuilder } from '@/features/project-creation/ui/steps/useProjectBuilder';
import { COMPONENT_IDS } from '@/core/constants';
import type { CustomBlockLibrary } from '@/types/blockLibraries';
import type { DemoPackage, GitSource } from '@/types/demoPackages';
import type { Stack } from '@/types/stacks';
import type { WizardState } from '@/types/webview';

// The mesh dual-flow depends on getResolvedMeshRequirement for the reset path.
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
}));

// onBlockLibrariesChange posts the one-time "save defaults" tip offer.
jest.mock('@/core/ui/utils/vscode-api', () => ({
    vscode: { postMessage: jest.fn() },
}));

import { getResolvedMeshRequirement } from '@/features/project-creation/services/demoPackageLoader';
import {
    getNativeBlockLibraries,
    getDefaultBlockLibraryIds,
} from '@/features/project-creation/services/blockLibraryLoader';

const mockGetResolvedMeshRequirement = getResolvedMeshRequirement as jest.Mock;
const mockGetNativeBlockLibraries = getNativeBlockLibraries as jest.Mock;
const mockGetDefaultBlockLibraryIds = getDefaultBlockLibraryIds as jest.Mock;

const mockGitSource: GitSource = {
    type: 'git',
    url: 'https://github.com/test/repo',
    branch: 'main',
    gitOptions: { shallow: true },
};

const edsStack: Stack = {
    id: 'eds-paas',
    name: 'EDS + PaaS',
    description: 'Edge Delivery with PaaS backend',
    frontend: 'eds-storefront',
    backend: 'adobe-commerce-paas',
    dependencies: [],
    optionalDependencies: [COMPONENT_IDS.EDS_COMMERCE_MESH],
    optionalAddons: [
        { id: 'live-search', default: true },
        { id: 'catalog-service', default: false },
    ],
};

const headlessStack: Stack = {
    id: 'headless-paas',
    name: 'Headless + PaaS',
    description: 'Headless storefront with PaaS backend',
    frontend: 'headless',
    backend: 'adobe-commerce-paas',
    dependencies: [],
    optionalDependencies: [COMPONENT_IDS.HEADLESS_COMMERCE_MESH],
};

const edsRequiresStack: Stack = {
    id: 'eds-accs',
    name: 'EDS + ACCS',
    description: 'Edge Delivery with ACCS backend',
    frontend: 'eds-storefront',
    backend: 'adobe-commerce-accs',
    dependencies: [],
    requiresGitHub: true,
    requiresDaLive: true,
};

const citisignal: DemoPackage = {
    id: 'citisignal',
    name: 'CitiSignal',
    description: 'A test package',
    configDefaults: {},
    storefronts: {
        'eds-paas': { name: 'CS EDS', description: '', source: mockGitSource },
        'eds-accs': {
            name: 'CS EDS ACCS',
            description: '',
            source: mockGitSource,
            templateOwner: 'skukla',
            templateRepo: 'citisignal-eds',
        },
    },
};

const custom: DemoPackage = {
    id: 'custom',
    name: 'Custom',
    description: 'Custom package',
    configDefaults: {},
    storefronts: { 'headless-paas': { name: 'Custom HL', description: '', source: mockGitSource } },
};

/**
 * Package with a REQUIRED addon (`live-search`) and an OPTIONAL one (`foo`).
 * Drives the addon-seeding parity tests: onStackSelect must union the package's
 * required addons with the stack's default optionalAddons.
 */
const withAddons: DemoPackage = {
    id: 'withAddons',
    name: 'With Addons',
    description: 'A package with required + optional addons',
    configDefaults: {},
    addons: { 'live-search': 'required', foo: 'optional' },
    storefronts: {
        'eds-paas': { name: 'WA EDS', description: '', source: mockGitSource },
        'headless-paas': { name: 'WA HL', description: '', source: mockGitSource },
    },
} as DemoPackage;

/**
 * Render the hook with a controlled WizardState. updateState applies the partial
 * to a mutable ref so successive handler calls in one test observe prior writes
 * (mirrors the real reducer's functional update).
 */
interface SetupExtras {
    onArchitectureChange?: (oldStackId: string, newStackId: string) => void;
    blockLibraryDefaults?: string[];
    customBlockLibraryDefaults?: CustomBlockLibrary[];
}

function setup(initial: Partial<WizardState> = {}, extras: SetupExtras = {}) {
    const { onArchitectureChange, blockLibraryDefaults, customBlockLibraryDefaults } = extras;
    const stateRef: { current: WizardState } = {
        current: {
            currentStep: 'welcome',
            projectName: '',
            selectedPackage: 'citisignal',
            adobeAuth: { isAuthenticated: false, isChecking: false },
            ...initial,
        } as WizardState,
    };
    const updateState = jest.fn((partial: Partial<WizardState>) => {
        stateRef.current = { ...stateRef.current, ...partial };
    });

    const { result, rerender } = renderHook(
        ({ state }: { state: WizardState }) =>
            useProjectBuilder(state, updateState, {
                packages: [citisignal, custom, withAddons],
                stacks: [edsStack, headlessStack, edsRequiresStack],
                onArchitectureChange,
                blockLibraryDefaults,
                customBlockLibraryDefaults,
            }),
        { initialProps: { state: stateRef.current } },
    );

    return { result, rerender, updateState, stateRef };
}

beforeEach(() => {
    mockGetResolvedMeshRequirement.mockReset();
    mockGetResolvedMeshRequirement.mockReturnValue('optional');
    mockGetNativeBlockLibraries.mockReset();
    mockGetNativeBlockLibraries.mockReturnValue([]);
    mockGetDefaultBlockLibraryIds.mockReset();
    mockGetDefaultBlockLibraryIds.mockReturnValue([]);
});

describe('useProjectBuilder — mesh dual-flow mirror-write', () => {
    it('adds the mesh component id to selectedAppBuilderComponents on select', () => {
        const { result, updateState } = setup({ selectedStack: 'headless-paas' });
        act(() => {
            result.current.onAppBuilderComponentToggle('headless-commerce-mesh', true);
        });
        expect(updateState).toHaveBeenCalledWith(
            expect.objectContaining({
                selectedAppBuilderComponents: ['headless-commerce-mesh'],
            }),
        );
    });

    it('mirror-writes the mapped legacy component id to selectedOptionalDependencies on select', () => {
        const { result, updateState } = setup({ selectedStack: 'headless-paas' });
        act(() => {
            result.current.onAppBuilderComponentToggle('headless-commerce-mesh', true);
        });
        expect(updateState).toHaveBeenCalledWith(
            expect.objectContaining({
                selectedOptionalDependencies: [COMPONENT_IDS.HEADLESS_COMMERCE_MESH],
            }),
        );
    });

    it('removes the mesh component id from selectedAppBuilderComponents on deselect', () => {
        const { result, updateState } = setup({
            selectedStack: 'headless-paas',
            selectedAppBuilderComponents: ['headless-commerce-mesh'],
            selectedOptionalDependencies: [COMPONENT_IDS.HEADLESS_COMMERCE_MESH],
        });
        act(() => {
            result.current.onAppBuilderComponentToggle('headless-commerce-mesh', false);
        });
        expect(updateState).toHaveBeenCalledWith(
            expect.objectContaining({ selectedAppBuilderComponents: [] }),
        );
    });

    it('removes the mapped legacy component id from selectedOptionalDependencies on deselect', () => {
        const { result, updateState } = setup({
            selectedStack: 'headless-paas',
            selectedAppBuilderComponents: ['headless-commerce-mesh'],
            selectedOptionalDependencies: [COMPONENT_IDS.HEADLESS_COMMERCE_MESH],
        });
        act(() => {
            result.current.onAppBuilderComponentToggle('headless-commerce-mesh', false);
        });
        expect(updateState).toHaveBeenCalledWith(
            expect.objectContaining({ selectedOptionalDependencies: [] }),
        );
    });

    it('does not duplicate the legacy id when an already-present mesh is re-selected', () => {
        const { result, updateState } = setup({
            selectedStack: 'headless-paas',
            selectedAppBuilderComponents: ['headless-commerce-mesh'],
            selectedOptionalDependencies: [COMPONENT_IDS.HEADLESS_COMMERCE_MESH],
        });
        act(() => {
            result.current.onAppBuilderComponentToggle('headless-commerce-mesh', true);
        });
        const call = updateState.mock.calls[0][0] as Partial<WizardState>;
        expect(call.selectedOptionalDependencies).toEqual([COMPONENT_IDS.HEADLESS_COMMERCE_MESH]);
    });

    it('preserves unrelated optional dependencies when toggling a mesh', () => {
        const { result, updateState } = setup({
            selectedStack: 'headless-paas',
            selectedOptionalDependencies: ['some-other-dep'],
        });
        act(() => {
            result.current.onAppBuilderComponentToggle('headless-commerce-mesh', true);
        });
        const call = updateState.mock.calls[0][0] as Partial<WizardState>;
        expect(call.selectedOptionalDependencies).toEqual(
            expect.arrayContaining(['some-other-dep', COMPONENT_IDS.HEADLESS_COMMERCE_MESH]),
        );
    });
});

describe('useProjectBuilder — non-mesh isolation', () => {
    it('does NOT touch selectedOptionalDependencies for a non-mesh component select', () => {
        const { result, updateState } = setup({
            selectedStack: 'headless-paas',
            selectedOptionalDependencies: ['existing-dep'],
        });
        act(() => {
            result.current.onAppBuilderComponentToggle('some-non-mesh-component', true);
        });
        const call = updateState.mock.calls[0][0] as Partial<WizardState>;
        expect(call.selectedOptionalDependencies).toBeUndefined();
    });

    it('still writes selectedAppBuilderComponents for a non-mesh component', () => {
        const { result, updateState } = setup({ selectedStack: 'headless-paas' });
        act(() => {
            result.current.onAppBuilderComponentToggle('some-non-mesh-component', true);
        });
        expect(updateState).toHaveBeenCalledWith(
            expect.objectContaining({
                selectedAppBuilderComponents: ['some-non-mesh-component'],
            }),
        );
    });

    it('does NOT touch selectedOptionalDependencies for a non-mesh component DESELECT', () => {
        const { result, updateState } = setup({
            selectedStack: 'headless-paas',
            selectedAppBuilderComponents: ['some-non-mesh-component'],
            selectedOptionalDependencies: ['existing-dep'],
        });
        act(() => {
            result.current.onAppBuilderComponentToggle('some-non-mesh-component', false);
        });
        const call = updateState.mock.calls[0][0] as Partial<WizardState>;
        expect(call.selectedOptionalDependencies).toBeUndefined();
        expect(call.selectedAppBuilderComponents).toEqual([]);
    });
});

describe('useProjectBuilder — mesh mapping coverage', () => {
    it('maps the EDS commerce mesh appBuilderComponent to its legacy component id', () => {
        const { result, updateState } = setup({ selectedStack: 'eds-paas' });
        act(() => {
            result.current.onAppBuilderComponentToggle('commerce-paas-mesh', true);
        });
        expect(updateState).toHaveBeenCalledWith(
            expect.objectContaining({
                selectedOptionalDependencies: [COMPONENT_IDS.EDS_COMMERCE_MESH],
            }),
        );
    });

    it('maps the EDS ACCS mesh appBuilderComponent to its legacy component id', () => {
        const { result, updateState } = setup({ selectedStack: 'eds-paas' });
        act(() => {
            result.current.onAppBuilderComponentToggle('commerce-eds-mesh', true);
        });
        expect(updateState).toHaveBeenCalledWith(
            expect.objectContaining({
                selectedOptionalDependencies: [COMPONENT_IDS.EDS_ACCS_MESH],
            }),
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
            expect.arrayContaining(['some-non-mesh-component', 'headless-commerce-mesh']),
        );
    });
});

describe('useProjectBuilder — onStackSelect mesh reset (cross-package leak guard)', () => {
    it('writes the selected stack id', () => {
        const { result, updateState } = setup();
        act(() => {
            result.current.onStackSelect('headless-paas');
        });
        expect(updateState).toHaveBeenCalledWith(
            expect.objectContaining({ selectedStack: 'headless-paas' }),
        );
    });

    it('resets selectedOptionalDependencies to the stack mesh deps when mesh is required', () => {
        mockGetResolvedMeshRequirement.mockReturnValue(true);
        const { result, updateState } = setup({
            selectedStack: 'eds-paas',
            selectedOptionalDependencies: ['stale-leftover-dep'],
        });
        act(() => {
            result.current.onStackSelect('headless-paas');
        });
        expect(updateState).toHaveBeenCalledWith(
            expect.objectContaining({
                selectedOptionalDependencies: [COMPONENT_IDS.HEADLESS_COMMERCE_MESH],
            }),
        );
    });

    it('clears selectedOptionalDependencies when mesh is not required for the new stack', () => {
        mockGetResolvedMeshRequirement.mockReturnValue('optional');
        const { result, updateState } = setup({
            selectedStack: 'eds-paas',
            selectedOptionalDependencies: ['stale-leftover-dep'],
        });
        act(() => {
            result.current.onStackSelect('headless-paas');
        });
        expect(updateState).toHaveBeenCalledWith(
            expect.objectContaining({ selectedOptionalDependencies: [] }),
        );
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
            expect.objectContaining({ selectedStack: 'headless-paas' }),
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
            }),
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

describe('useProjectBuilder — optional dependencies handler', () => {
    it('updates selectedOptionalDependencies directly', () => {
        const { result, updateState } = setup({ selectedStack: 'headless-paas' });
        act(() => {
            result.current.onOptionalDependenciesChange(['some-dep']);
        });
        expect(updateState).toHaveBeenCalledWith(
            expect.objectContaining({ selectedOptionalDependencies: ['some-dep'] }),
        );
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
            }),
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
            expect.arrayContaining(['prior-repo', 'acme-widget']),
        );
        expect(call.appBuilderComponentSources).toEqual({
            'prior-repo': { owner: 'prior', repo: 'repo' },
            'acme-widget': { owner: 'acme', repo: 'widget', branch: undefined },
        });
    });
});

describe('useProjectBuilder — onRemoveAppBuilderComponent', () => {
    it('removes the id from selectedAppBuilderComponents AND its source entry', () => {
        const { result, updateState } = setup({
            selectedStack: 'headless-paas',
            selectedAppBuilderComponents: ['acme-widget', 'other-repo'],
            appBuilderComponentSources: {
                'acme-widget': { owner: 'acme', repo: 'widget' },
                'other-repo': { owner: 'other', repo: 'repo' },
            },
        });
        act(() => {
            result.current.onRemoveAppBuilderComponent('acme-widget');
        });
        expect(updateState).toHaveBeenCalledWith({
            selectedAppBuilderComponents: ['other-repo'],
            appBuilderComponentSources: { 'other-repo': { owner: 'other', repo: 'repo' } },
        });
    });

    it('removes a catalog integration id (no source entry to delete)', () => {
        const { result, updateState } = setup({
            selectedStack: 'headless-paas',
            selectedAppBuilderComponents: ['erp-sync'],
        });
        act(() => {
            result.current.onRemoveAppBuilderComponent('erp-sync');
        });
        expect(updateState).toHaveBeenCalledWith({
            selectedAppBuilderComponents: [],
            appBuilderComponentSources: {},
        });
    });
});
