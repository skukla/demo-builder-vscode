/**
 * useProjectBuilder — every handler answers from the state it is called in.
 *
 * Two ways that can go wrong, and both are silent. A handler memoised without
 * one of its inputs keeps using the value from the render it was built in: the
 * removal lock then decides "required" against the package the user has since
 * changed, and a write goes to an updater the wizard has already replaced —
 * landing nowhere it is reading. Neither shows up as an error; the selection
 * simply does not move.
 *
 * Fixtures and the render wrapper are shared through useProjectBuilder.testUtils.
 */

import { act } from '@testing-library/react';
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

jest.mock('@/features/components/services/appBuilderComponentCatalogLoader', () => {
    const actual = jest.requireActual(
        '@/features/components/services/appBuilderComponentCatalogLoader'
    );
    return {
        ...actual,
        getAvailableAppBuilderComponents: jest.fn(actual.getAvailableAppBuilderComponents),
    };
});

import { setup } from './useProjectBuilder.testUtils';

const { getAvailableAppBuilderComponents } = jest.requireMock(
    '@/features/components/services/appBuilderComponentCatalogLoader'
);
const actualLoader = jest.requireActual(
    '@/features/components/services/appBuilderComponentCatalogLoader'
);

/** A catalog entry citisignal ships natively — the generic required lock. */
const nativeEntry = {
    id: 'native-thing',
    name: 'Native Thing',
    description: 'Ships with citisignal',
    kind: 'integration',
    source: { owner: 'o', repo: 'native-thing', branch: 'main' },
    nativeForPackages: ['citisignal'],
};

afterEach(() => {
    getAvailableAppBuilderComponents.mockImplementation(
        actualLoader.getAvailableAppBuilderComponents
    );
});

describe('useProjectBuilder — the removal lock reads the CURRENT selection', () => {
    it('resolves the requirement against the selected stack, not the first one', () => {
        // The entry exists only for the headless frontend. A lock that resolved
        // the wrong stack would look at eds-storefront and see nothing to lock.
        getAvailableAppBuilderComponents.mockImplementation((backend: string, frontend: string) => [
            ...actualLoader.getAvailableAppBuilderComponents(backend, frontend),
            ...(frontend === 'headless' ? [nativeEntry] : []),
        ]);
        const s = setup({
            selectedPackage: 'citisignal',
            selectedStack: 'headless-paas',
            selectedAppBuilderComponents: ['native-thing'],
        });

        act(() => s.result.current.onRemoveAppBuilderComponent('native-thing'));

        expect(s.updateState).not.toHaveBeenCalled();
    });

    it('re-decides after the package changes under it', () => {
        getAvailableAppBuilderComponents.mockImplementation((backend: string, frontend: string) => [
            ...actualLoader.getAvailableAppBuilderComponents(backend, frontend),
            nativeEntry,
        ]);
        const s = setup({
            selectedPackage: 'citisignal',
            selectedStack: 'eds-paas',
            selectedAppBuilderComponents: ['native-thing'],
        });
        act(() => s.result.current.onRemoveAppBuilderComponent('native-thing'));
        expect(s.updateState).not.toHaveBeenCalled();

        // 'custom' does not ship it natively, so the lock must lift.
        s.rerender({
            state: { ...s.stateRef.current, selectedPackage: 'custom' } as WizardState,
        });
        act(() => s.result.current.onRemoveAppBuilderComponent('native-thing'));

        expect(s.updateState).toHaveBeenCalledTimes(1);
    });

    it('locks nothing when the selected stack is not in the catalog', () => {
        getAvailableAppBuilderComponents.mockImplementation((backend: string, frontend: string) => [
            ...actualLoader.getAvailableAppBuilderComponents(backend, frontend),
            nativeEntry,
        ]);
        const s = setup({
            selectedPackage: 'citisignal',
            selectedStack: 'no-such-stack',
            selectedAppBuilderComponents: ['native-thing'],
        });

        // Nothing can be resolved, so nothing is locked — and the missing stack
        // must not be dereferenced on the way to that answer.
        act(() => s.result.current.onAppBuilderComponentToggle('native-thing', false));

        expect(s.updateState).toHaveBeenCalledWith(
            expect.objectContaining({ selectedAppBuilderComponents: [] })
        );
    });
});

describe('useProjectBuilder — Console API picks follow the toggle direction', () => {
    it('drops the picks when a component is toggled OFF', () => {
        const s = setup({
            selectedPackage: 'citisignal',
            selectedStack: 'eds-paas',
            selectedAppBuilderComponents: ['acme-widget'],
            selectedConsoleApis: { 'acme-widget': ['FireflyServicesSDK'] },
        });

        act(() => s.result.current.onAppBuilderComponentToggle('acme-widget', false));

        expect(s.updateState).toHaveBeenCalledWith({
            selectedAppBuilderComponents: [],
            selectedConsoleApis: {},
        });
    });

    it('leaves the picks alone when a component is toggled ON', () => {
        const s = setup({
            selectedPackage: 'citisignal',
            selectedStack: 'eds-paas',
            selectedAppBuilderComponents: [],
            selectedConsoleApis: { 'acme-widget': ['FireflyServicesSDK'] },
        });

        act(() => s.result.current.onAppBuilderComponentToggle('acme-widget', true));

        const update = s.updateState.mock.calls[0][0] as Record<string, unknown>;
        // Re-adding must not wipe the picks it is about to need.
        expect(Object.prototype.hasOwnProperty.call(update, 'selectedConsoleApis')).toBe(false);
    });
});

describe('useProjectBuilder — every handler writes through the CURRENT updater', () => {
    function fresh(initial: Partial<WizardState> = {}) {
        const s = setup({
            selectedPackage: 'citisignal',
            selectedStack: 'eds-paas',
            ...initial,
        });
        return { s, next: s.swapUpdater({ ...s.stateRef.current, ...initial } as WizardState) };
    }

    it('onStackSelect', () => {
        const { s, next } = fresh();
        act(() => s.result.current.onStackSelect('headless-paas'));
        expect(next).toHaveBeenCalledTimes(1);
        expect(s.updateState).not.toHaveBeenCalled();
    });

    it('onAppBuilderComponentToggle', () => {
        const { s, next } = fresh({ selectedAppBuilderComponents: [] });
        act(() => s.result.current.onAppBuilderComponentToggle('acme-widget', true));
        expect(next).toHaveBeenCalledTimes(1);
        expect(s.updateState).not.toHaveBeenCalled();
    });

    it('onAddCustomAppBuilderComponent', () => {
        const { s, next } = fresh({ selectedAppBuilderComponents: [] });
        act(() => s.result.current.onAddCustomAppBuilderComponent({ owner: 'a', repo: 'b' }));
        expect(next).toHaveBeenCalledTimes(1);
        expect(s.updateState).not.toHaveBeenCalled();
    });

    it('onRemoveAppBuilderComponent', () => {
        const { s, next } = fresh({ selectedAppBuilderComponents: ['a-b'] });
        act(() => s.result.current.onRemoveAppBuilderComponent('a-b'));
        expect(next).toHaveBeenCalledTimes(1);
        expect(s.updateState).not.toHaveBeenCalled();
    });

    it('onRenameAppBuilderComponent', () => {
        const { s, next } = fresh({
            selectedAppBuilderComponents: ['a-b'],
            appBuilderComponentSources: { 'a-b': { owner: 'a', repo: 'b', name: 'Old' } },
        });
        act(() => s.result.current.onRenameAppBuilderComponent('a-b', 'New'));
        expect(next).toHaveBeenCalledWith({
            appBuilderComponentSources: { 'a-b': { owner: 'a', repo: 'b', name: 'New' } },
        });
        expect(s.updateState).not.toHaveBeenCalled();
    });

    it('onAddonsChange', () => {
        const { s, next } = fresh();
        act(() => s.result.current.onAddonsChange(['live-search']));
        expect(next).toHaveBeenCalledWith({ selectedAddons: ['live-search'] });
        expect(s.updateState).not.toHaveBeenCalled();
    });

    it('onBlockLibrariesChange', () => {
        const { s, next } = fresh();
        act(() => s.result.current.onBlockLibrariesChange(['lib-a']));
        expect(next).toHaveBeenCalledWith({ selectedBlockLibraries: ['lib-a'] });
        expect(s.updateState).not.toHaveBeenCalled();
    });

    it('onCustomBlockLibrariesChange', () => {
        const { s, next } = fresh();
        const libs = [{ name: 'X', source: { owner: 'o', repo: 'x', branch: 'main' } }];
        act(() => s.result.current.onCustomBlockLibrariesChange(libs));
        expect(next).toHaveBeenCalledWith({ customBlockLibraries: libs });
        expect(s.updateState).not.toHaveBeenCalled();
    });
});
