/**
 * useModalState Hook Tests
 *
 * Tests for the modal state management hook extracted from BrandGallery.
 * Covers initialization, card click, stack select, change handlers,
 * done sync, and close revert behaviors.
 *
 * @jest-environment jsdom
 */

import { renderHook, act } from '@testing-library/react';
import { useModalState } from '@/features/project-creation/ui/hooks/useModalState';
import type { DemoPackage, GitSource } from '@/types/demoPackages';
import type { Stack } from '@/types/stacks';
import type { CustomBlockLibrary } from '@/types/blockLibraries';

// Mock vscode API
jest.mock('@/core/ui/utils/vscode-api', () => ({
    vscode: { postMessage: jest.fn(), request: jest.fn(), onMessage: jest.fn(() => jest.fn()) },
}));

// Mock block library loader
jest.mock('@/features/project-creation/services/blockLibraryLoader', () => ({
    getNativeBlockLibraries: jest.fn(() => []),
    getDefaultBlockLibraryIds: jest.fn(() => []),
    getBlockLibraryName: jest.fn((id: string) => id),
}));

// Mock demo package loader
jest.mock('@/features/project-creation/services/demoPackageLoader', () => ({
    getResolvedMeshRequirement: jest.fn(() => 'optional'),
}));

import { vscode as mockVscode } from '@/core/ui/utils/vscode-api';
import { getNativeBlockLibraries, getDefaultBlockLibraryIds } from '@/features/project-creation/services/blockLibraryLoader';
import { getResolvedMeshRequirement } from '@/features/project-creation/services/demoPackageLoader';

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
    icon: 'eds',
    frontend: 'eds-storefront',
    backend: 'paas',
    dependencies: [],
    features: [],
    optionalAddons: [
        { id: 'live-search', default: true },
        { id: 'catalog-service', default: false },
    ],
};

const veniaStack: Stack = {
    id: 'venia-paas',
    name: 'Venia + PaaS',
    description: 'Venia storefront with PaaS backend',
    icon: 'venia',
    frontend: 'venia',
    backend: 'paas',
    dependencies: [],
    features: [],
};

const testPackage: DemoPackage = {
    id: 'test-brand',
    name: 'Test Brand',
    description: 'A test brand',
    configDefaults: {},
    storefronts: {
        'eds-paas': {
            name: 'Test EDS',
            description: 'Test storefront',
            source: mockGitSource,
        },
    },
    addons: {
        'live-search': 'required',
    },
    featurePacks: {
        'core-pack': 'required',
    },
};

const packageNoAddons: DemoPackage = {
    id: 'plain-brand',
    name: 'Plain Brand',
    description: 'A plain brand',
    configDefaults: {},
    storefronts: {},
};

const customLib: CustomBlockLibrary = {
    name: 'My Custom Lib',
    source: { owner: 'myorg', repo: 'my-blocks', branch: 'main' },
};

const noop = jest.fn();

describe('useModalState', () => {
    const defaultProps = {
        packages: [testPackage, packageNoAddons],
        stacks: [edsStack, veniaStack],
        selectedStack: undefined as string | undefined,
        selectedAddons: [] as string[],
        selectedFeaturePacks: [] as string[],
        selectedBlockLibraries: [] as string[],
        customBlockLibraries: [] as CustomBlockLibrary[],
        customBlockLibraryDefaults: [] as CustomBlockLibrary[],
        blockLibraryDefaults: [] as string[],
        selectedOptionalDependencies: [] as string[],
        onPackageSelect: noop,
        onStackSelect: noop,
        onAddonsChange: noop,
        onFeaturePacksChange: noop,
        onBlockLibrariesChange: noop,
        onCustomBlockLibrariesChange: noop,
        onOptionalDependenciesChange: noop,
    };

    afterEach(() => {
        jest.clearAllMocks();
    });

    // --- Initial State ---

    describe('initial state', () => {
        it('should return null modalPackageId initially', () => {
            const { result } = renderHook(() => useModalState(defaultProps));

            expect(result.current.modalPackageId).toBeNull();
        });

        it('should return a modalPackage of null initially', () => {
            const { result } = renderHook(() => useModalState(defaultProps));

            expect(result.current.modalPackage).toBeNull();
        });

        it('should return empty modal addons initially', () => {
            const { result } = renderHook(() => useModalState(defaultProps));

            expect(result.current.modalAddons).toEqual([]);
        });
    });

    // --- handleCardClick ---

    describe('handleCardClick', () => {
        it('should set modalPackageId when card is clicked', () => {
            const { result } = renderHook(() => useModalState(defaultProps));

            act(() => {
                result.current.handleCardClick(testPackage);
            });

            expect(result.current.modalPackageId).toBe('test-brand');
        });

        it('should call onPackageSelect when card is clicked', () => {
            const onPackageSelect = jest.fn();
            const { result } = renderHook(() =>
                useModalState({ ...defaultProps, onPackageSelect })
            );

            act(() => {
                result.current.handleCardClick(testPackage);
            });

            expect(onPackageSelect).toHaveBeenCalledWith('test-brand');
        });

        it('should initialize modal addons with required addons from package', () => {
            const { result } = renderHook(() => useModalState(defaultProps));

            act(() => {
                result.current.handleCardClick(testPackage);
            });

            expect(result.current.modalAddons).toContain('live-search');
        });

        it('should initialize modal feature packs with required packs from package', () => {
            const { result } = renderHook(() => useModalState(defaultProps));

            act(() => {
                result.current.handleCardClick(testPackage);
            });

            expect(result.current.modalFeaturePacks).toContain('core-pack');
        });

        it('should initialize modal custom block libraries from defaults when parent is empty', () => {
            const { result } = renderHook(() =>
                useModalState({
                    ...defaultProps,
                    customBlockLibraryDefaults: [customLib],
                })
            );

            act(() => {
                result.current.handleCardClick(testPackage);
            });

            expect(result.current.modalCustomBlockLibraries).toEqual([customLib]);
        });

        it('should use parent custom block libraries when non-empty', () => {
            const parentLib: CustomBlockLibrary = {
                name: 'Parent Lib',
                source: { owner: 'parent', repo: 'repo', branch: 'main' },
            };
            const { result } = renderHook(() =>
                useModalState({
                    ...defaultProps,
                    customBlockLibraries: [parentLib],
                    customBlockLibraryDefaults: [],
                })
            );

            act(() => {
                result.current.handleCardClick(testPackage);
            });

            expect(result.current.modalCustomBlockLibraries).toEqual([parentLib]);
        });
    });

    // --- handleStackSelect ---

    describe('handleStackSelect', () => {
        it('should call onStackSelect with the new stack ID', () => {
            const onStackSelect = jest.fn();
            const { result } = renderHook(() =>
                useModalState({ ...defaultProps, onStackSelect })
            );

            act(() => {
                result.current.handleCardClick(testPackage);
            });
            act(() => {
                result.current.handleStackSelect('eds-paas');
            });

            expect(onStackSelect).toHaveBeenCalledWith('eds-paas');
        });

        it('should reset modal addons to required + default when stack changes', () => {
            const { result } = renderHook(() => useModalState(defaultProps));

            act(() => {
                result.current.handleCardClick(testPackage);
            });
            act(() => {
                result.current.handleStackSelect('eds-paas');
            });

            // Should include 'live-search' (required from package) + 'live-search' (default from stack)
            expect(result.current.modalAddons).toContain('live-search');
        });

        it('should reset feature packs to required only when stack changes', () => {
            const { result } = renderHook(() => useModalState(defaultProps));

            act(() => {
                result.current.handleCardClick(testPackage);
            });
            act(() => {
                result.current.handleStackSelect('eds-paas');
            });

            expect(result.current.modalFeaturePacks).toContain('core-pack');
        });

        it('should compute block libraries for EDS stacks', () => {
            (getDefaultBlockLibraryIds as jest.Mock).mockReturnValue(['default-lib']);
            (getNativeBlockLibraries as jest.Mock).mockReturnValue([{ id: 'native-lib' }]);

            const onBlockLibrariesChange = jest.fn();
            const { result } = renderHook(() =>
                useModalState({ ...defaultProps, onBlockLibrariesChange })
            );

            act(() => {
                result.current.handleCardClick(testPackage);
            });
            act(() => {
                result.current.handleStackSelect('eds-paas');
            });

            expect(onBlockLibrariesChange).toHaveBeenCalled();
        });

        it('should clear block libraries for non-EDS stacks', () => {
            const onBlockLibrariesChange = jest.fn();
            const onCustomBlockLibrariesChange = jest.fn();
            const { result } = renderHook(() =>
                useModalState({
                    ...defaultProps,
                    onBlockLibrariesChange,
                    onCustomBlockLibrariesChange,
                })
            );

            act(() => {
                result.current.handleCardClick(testPackage);
            });
            act(() => {
                result.current.handleStackSelect('venia-paas');
            });

            expect(onBlockLibrariesChange).toHaveBeenCalledWith([]);
            expect(onCustomBlockLibrariesChange).toHaveBeenCalledWith([]);
        });
    });

    // --- Modal Change Handlers ---

    describe('modal change handlers', () => {
        it('should update modal addons via handleModalAddonsChange', () => {
            const { result } = renderHook(() => useModalState(defaultProps));

            act(() => {
                result.current.handleCardClick(testPackage);
            });
            act(() => {
                result.current.handleModalAddonsChange(['addon-1', 'addon-2']);
            });

            expect(result.current.modalAddons).toEqual(['addon-1', 'addon-2']);
        });

        it('should update modal feature packs via handleModalFeaturePacksChange', () => {
            const { result } = renderHook(() => useModalState(defaultProps));

            act(() => {
                result.current.handleCardClick(testPackage);
            });
            act(() => {
                result.current.handleModalFeaturePacksChange(['pack-1']);
            });

            expect(result.current.modalFeaturePacks).toEqual(['pack-1']);
        });

        it('should propagate block library changes to parent immediately', () => {
            const onBlockLibrariesChange = jest.fn();
            const { result } = renderHook(() =>
                useModalState({ ...defaultProps, onBlockLibrariesChange })
            );

            act(() => {
                result.current.handleModalBlockLibrariesChange(['lib-1']);
            });

            expect(onBlockLibrariesChange).toHaveBeenCalledWith(['lib-1']);
        });

        it('should propagate custom block library changes to parent immediately', () => {
            const onCustomBlockLibrariesChange = jest.fn();
            const { result } = renderHook(() =>
                useModalState({ ...defaultProps, onCustomBlockLibrariesChange })
            );

            act(() => {
                result.current.handleModalCustomBlockLibrariesChange([customLib]);
            });

            expect(onCustomBlockLibrariesChange).toHaveBeenCalledWith([customLib]);
        });

        it('should propagate optional dep changes to parent immediately', () => {
            const onOptionalDependenciesChange = jest.fn();
            const { result } = renderHook(() =>
                useModalState({ ...defaultProps, onOptionalDependenciesChange })
            );

            act(() => {
                result.current.handleModalOptionalDepsChange(['mesh-1']);
            });

            expect(onOptionalDependenciesChange).toHaveBeenCalledWith(['mesh-1']);
        });
    });

    // --- handleModalDone ---

    describe('handleModalDone', () => {
        it('should sync addons to parent including required addons', () => {
            const onAddonsChange = jest.fn();
            const { result } = renderHook(() =>
                useModalState({ ...defaultProps, onAddonsChange })
            );

            act(() => {
                result.current.handleCardClick(testPackage);
            });
            act(() => {
                result.current.handleModalAddonsChange(['catalog-service']);
            });
            act(() => {
                result.current.handleModalDone();
            });

            // Should include both user-selected and required addons
            const calledWith = onAddonsChange.mock.calls[onAddonsChange.mock.calls.length - 1][0];
            expect(calledWith).toContain('live-search'); // required
            expect(calledWith).toContain('catalog-service'); // user-selected
        });

        it('should sync feature packs to parent including required packs', () => {
            const onFeaturePacksChange = jest.fn();
            const { result } = renderHook(() =>
                useModalState({ ...defaultProps, onFeaturePacksChange })
            );

            act(() => {
                result.current.handleCardClick(testPackage);
            });
            act(() => {
                result.current.handleModalDone();
            });

            const calledWith = onFeaturePacksChange.mock.calls[onFeaturePacksChange.mock.calls.length - 1][0];
            expect(calledWith).toContain('core-pack');
        });

        it('should close modal after done', () => {
            const { result } = renderHook(() => useModalState(defaultProps));

            act(() => {
                result.current.handleCardClick(testPackage);
            });
            expect(result.current.modalPackageId).toBe('test-brand');

            act(() => {
                result.current.handleModalDone();
            });

            expect(result.current.modalPackageId).toBeNull();
        });

        it('should post message to save block library defaults when libraries are selected', () => {
            const { result } = renderHook(() => useModalState(defaultProps));

            act(() => {
                result.current.handleCardClick(testPackage);
            });
            act(() => {
                result.current.handleModalBlockLibrariesChange(['lib-1']);
            });
            act(() => {
                result.current.handleModalDone();
            });

            expect((mockVscode.postMessage as jest.Mock)).toHaveBeenCalledWith(
                'offer-save-block-library-defaults',
                { selectedLibraries: ['lib-1'] },
            );
        });
    });

    // --- handleModalClose ---

    describe('handleModalClose', () => {
        it('should close modal on close', () => {
            const { result } = renderHook(() => useModalState(defaultProps));

            act(() => {
                result.current.handleCardClick(testPackage);
            });
            act(() => {
                result.current.handleModalClose();
            });

            expect(result.current.modalPackageId).toBeNull();
        });

        it('should revert optional deps to pre-modal state on close', () => {
            const onOptionalDependenciesChange = jest.fn();
            const { result } = renderHook(() =>
                useModalState({
                    ...defaultProps,
                    selectedOptionalDependencies: ['pre-modal-dep'],
                    onOptionalDependenciesChange,
                })
            );

            act(() => {
                result.current.handleCardClick(testPackage);
            });
            // Change deps during modal
            act(() => {
                result.current.handleModalOptionalDepsChange(['new-dep']);
            });
            // Close (cancel) modal
            act(() => {
                result.current.handleModalClose();
            });

            // Last call should be the revert to pre-modal state
            const lastCall = onOptionalDependenciesChange.mock.calls[
                onOptionalDependenciesChange.mock.calls.length - 1
            ][0];
            expect(lastCall).toEqual(['pre-modal-dep']);
        });
    });

});
