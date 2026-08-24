/**
 * useProjectBuilder Tests (Slice 2 — Step 2) — addon / block-library group
 *
 * Split from useProjectBuilder.test.ts to keep both files under the eslint
 * max-lines limit. Covers the plain field-update handlers (addons, block
 * libraries, custom libs) and the onStackSelect addon / block-library seeding
 * parity. Shares the same setup header as the sibling file (unchanged).
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

import { getResolvedMeshRequirement } from '@/features/project-creation/services/demoPackageLoader';
import { vscode } from '@/core/ui/utils/vscode-api';
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

const customLib: CustomBlockLibrary = {
    name: 'My Custom Lib',
    source: { owner: 'myorg', repo: 'my-blocks', branch: 'main' },
};

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

describe('useProjectBuilder — addon handler', () => {
    it('updates selectedAddons', () => {
        const { result, updateState } = setup({ selectedStack: 'eds-paas' });
        act(() => {
            result.current.onAddonsChange(['live-search', 'catalog-service']);
        });
        expect(updateState).toHaveBeenCalledWith(
            expect.objectContaining({ selectedAddons: ['live-search', 'catalog-service'] }),
        );
    });
});

describe('useProjectBuilder — block library handlers', () => {
    it('updates selectedBlockLibraries', () => {
        const { result, updateState } = setup({ selectedStack: 'eds-paas' });
        act(() => {
            result.current.onBlockLibrariesChange(['isle5']);
        });
        expect(updateState).toHaveBeenCalledWith(
            expect.objectContaining({ selectedBlockLibraries: ['isle5'] }),
        );
    });

    it('updates customBlockLibraries', () => {
        const { result, updateState } = setup({ selectedStack: 'eds-paas' });
        act(() => {
            result.current.onCustomBlockLibrariesChange([customLib]);
        });
        expect(updateState).toHaveBeenCalledWith(
            expect.objectContaining({ customBlockLibraries: [customLib] }),
        );
    });
});

describe('useProjectBuilder — onStackSelect addon seeding (parity)', () => {
    it('seeds required (package) ∪ default (stack) addons on stack select', () => {
        // withAddons requires `live-search`; edsStack defaults `live-search`.
        const { result, updateState } = setup({ selectedPackage: 'withAddons' });
        act(() => {
            result.current.onStackSelect('eds-paas');
        });
        const call = updateState.mock.calls[0][0] as Partial<WizardState>;
        expect(call.selectedAddons).toEqual(['live-search']);
    });

    it('seeds only stack-default addons when the package has no required addons', () => {
        const { result, updateState } = setup({ selectedPackage: 'citisignal' });
        act(() => {
            result.current.onStackSelect('eds-paas');
        });
        const call = updateState.mock.calls[0][0] as Partial<WizardState>;
        // edsStack defaults live-search (default:true); catalog-service is default:false.
        expect(call.selectedAddons).toEqual(['live-search']);
    });

    it('seeds an empty addon array for a stack with no default optionalAddons', () => {
        const { result, updateState } = setup({ selectedPackage: 'custom' });
        act(() => {
            result.current.onStackSelect('headless-paas');
        });
        const call = updateState.mock.calls[0][0] as Partial<WizardState>;
        expect(call.selectedAddons).toEqual([]);
    });
});

describe('useProjectBuilder — onStackSelect block library seeding (parity)', () => {
    it('seeds native ∪ default block libraries for an EDS stack', () => {
        mockGetNativeBlockLibraries.mockReturnValue([{ id: 'demo-team-blocks' }]);
        mockGetDefaultBlockLibraryIds.mockReturnValue(['isle5']);
        const { result, updateState } = setup(
            { selectedPackage: 'citisignal' },
            { blockLibraryDefaults: ['isle5'] },
        );
        act(() => {
            result.current.onStackSelect('eds-paas');
        });
        const call = updateState.mock.calls[0][0] as Partial<WizardState>;
        expect(new Set(call.selectedBlockLibraries)).toEqual(
            new Set(['demo-team-blocks', 'isle5']),
        );
    });

    it('passes blockLibraryDefaults through to getDefaultBlockLibraryIds', () => {
        const { result } = setup(
            { selectedPackage: 'citisignal' },
            { blockLibraryDefaults: ['isle5'] },
        );
        act(() => {
            result.current.onStackSelect('eds-paas');
        });
        expect(mockGetDefaultBlockLibraryIds).toHaveBeenCalledWith(
            expect.objectContaining({ id: 'eds-paas' }),
            'citisignal',
            ['isle5'],
        );
    });

    it('dedupes when a native library is also a default', () => {
        mockGetNativeBlockLibraries.mockReturnValue([{ id: 'isle5' }]);
        mockGetDefaultBlockLibraryIds.mockReturnValue(['isle5']);
        const { result, updateState } = setup({ selectedPackage: 'citisignal' });
        act(() => {
            result.current.onStackSelect('eds-paas');
        });
        const call = updateState.mock.calls[0][0] as Partial<WizardState>;
        expect(call.selectedBlockLibraries).toEqual(['isle5']);
    });

    it('seeds customBlockLibraries from customBlockLibraryDefaults when state has none', () => {
        const { result, updateState } = setup(
            { selectedPackage: 'citisignal' },
            { customBlockLibraryDefaults: [customLib] },
        );
        act(() => {
            result.current.onStackSelect('eds-paas');
        });
        const call = updateState.mock.calls[0][0] as Partial<WizardState>;
        expect(call.customBlockLibraries).toEqual([customLib]);
    });

    it('preserves existing state.customBlockLibraries over the defaults', () => {
        const existing: CustomBlockLibrary = {
            name: 'Existing',
            source: { owner: 'org', repo: 'existing', branch: 'main' },
        };
        const { result, updateState } = setup(
            { selectedPackage: 'citisignal', customBlockLibraries: [existing] },
            { customBlockLibraryDefaults: [customLib] },
        );
        act(() => {
            result.current.onStackSelect('eds-paas');
        });
        const call = updateState.mock.calls[0][0] as Partial<WizardState>;
        expect(call.customBlockLibraries).toEqual([existing]);
    });

    it('clears selectedBlockLibraries + customBlockLibraries for a non-EDS stack', () => {
        const { result, updateState } = setup(
            {
                selectedPackage: 'custom',
                selectedBlockLibraries: ['stale-lib'],
                customBlockLibraries: [customLib],
            },
            { customBlockLibraryDefaults: [customLib] },
        );
        act(() => {
            result.current.onStackSelect('headless-paas');
        });
        const call = updateState.mock.calls[0][0] as Partial<WizardState>;
        expect(call.selectedBlockLibraries).toEqual([]);
        expect(call.customBlockLibraries).toEqual([]);
    });

    it('does not call the block library loaders for a non-EDS stack', () => {
        const { result } = setup({ selectedPackage: 'custom' });
        act(() => {
            result.current.onStackSelect('headless-paas');
        });
        expect(mockGetNativeBlockLibraries).not.toHaveBeenCalled();
        expect(mockGetDefaultBlockLibraryIds).not.toHaveBeenCalled();
    });
});

describe('useProjectBuilder — onBlockLibrariesChange offers save-defaults tip', () => {
    beforeEach(() => {
        (vscode.postMessage as jest.Mock).mockClear();
    });

    it('updates selectedBlockLibraries and offers the tip when a selection exists', () => {
        const { result, updateState } = setup({ selectedStack: 'eds-paas' });
        act(() => {
            result.current.onBlockLibrariesChange(['blocks-a', 'blocks-b']);
        });
        expect(updateState).toHaveBeenCalledWith(
            expect.objectContaining({ selectedBlockLibraries: ['blocks-a', 'blocks-b'] }),
        );
        expect(vscode.postMessage).toHaveBeenCalledWith(
            'offer-save-block-library-defaults',
            { selectedLibraries: ['blocks-a', 'blocks-b'] },
        );
    });

    it('does NOT offer the tip when the selection is cleared to empty', () => {
        const { result, updateState } = setup({ selectedStack: 'eds-paas' });
        act(() => {
            result.current.onBlockLibrariesChange([]);
        });
        expect(updateState).toHaveBeenCalledWith(
            expect.objectContaining({ selectedBlockLibraries: [] }),
        );
        expect(vscode.postMessage).not.toHaveBeenCalled();
    });
});
