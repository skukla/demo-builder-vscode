/**
 * useProjectBuilder — the name inputs of an integration that brings a system.
 *
 * The sibling suite (`useProjectBuilder.consoleApis.test.ts`, "naming the ERP pair")
 * pins WHAT the names are. This one pins what the write does to everything around
 * them: the other components' inputs are kept, a project with no inputs yet does not
 * throw, the write is built from the state of the CURRENT render, and an entry in the
 * catalog that brings no system is left alone.
 *
 * Read against the real catalog: `erp-integration` is the entry a system is bound to,
 * `commerce-integration-starter-kit` is one that has none.
 */

import { act } from '@testing-library/react';
import { setup } from './useProjectBuilder.testUtils';

// Same deterministic service mocks as the sibling useProjectBuilder files.
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

const PAIR = 'erp-integration';
const UNPAIRED = 'commerce-integration-starter-kit';
const OTHER = { 'other-app': { OTHER_KEY: 'kept' } };

describe('useProjectBuilder — what a pair-name write keeps', () => {
    it("adding the pair keeps the other components' inputs", () => {
        const { result, updateState } = setup({ componentConfigs: OTHER });

        act(() => result.current.onAppBuilderComponentToggle(PAIR, true));

        expect(updateState.mock.calls[0][0].componentConfigs).toStrictEqual({
            ...OTHER,
            [PAIR]: { INTEGRATION_DISPLAY_NAME: 'ERP Integration', ERP_DISPLAY_NAME: 'Acme ERP' },
        });
    });

    it("renaming the integration keeps the other components' inputs", () => {
        const { result, updateState } = setup({
            selectedAppBuilderComponents: [PAIR],
            componentConfigs: { ...OTHER, [PAIR]: { ERP_BASE_URL: 'x' } },
        });

        act(() => result.current.onRenameAppBuilderComponent(PAIR, 'Order Sync'));

        expect(updateState.mock.calls).toStrictEqual([
            [
                {
                    componentConfigs: {
                        ...OTHER,
                        [PAIR]: { ERP_BASE_URL: 'x', INTEGRATION_DISPLAY_NAME: 'Order Sync' },
                    },
                },
            ],
        ]);
    });

    it('renames the integration in a project that holds no inputs yet', () => {
        const { result, updateState } = setup({ selectedAppBuilderComponents: [PAIR] });

        act(() => result.current.onRenameAppBuilderComponent(PAIR, 'Order Sync'));

        expect(updateState.mock.calls).toStrictEqual([
            [{ componentConfigs: { [PAIR]: { INTEGRATION_DISPLAY_NAME: 'Order Sync' } } }],
        ]);
    });
});

describe('useProjectBuilder — a rename is built from the current render', () => {
    it('the integration rename keeps an input that arrived after the first render', () => {
        const { result, rerender, updateState, stateRef } = setup({ selectedAppBuilderComponents: [PAIR] });
        rerender({ state: { ...stateRef.current, componentConfigs: { [PAIR]: { ERP_BASE_URL: 'x' } } } });

        act(() => result.current.onRenameAppBuilderComponent(PAIR, 'Order Sync'));

        expect(updateState.mock.calls[0][0].componentConfigs).toStrictEqual({
            [PAIR]: { ERP_BASE_URL: 'x', INTEGRATION_DISPLAY_NAME: 'Order Sync' },
        });
    });

    it('the system rename keeps an input that arrived after the first render', () => {
        const { result, rerender, updateState, stateRef } = setup({ selectedAppBuilderComponents: [PAIR] });
        rerender({ state: { ...stateRef.current, componentConfigs: { [PAIR]: { ERP_BASE_URL: 'x' } } } });

        act(() => result.current.onRenamePairedSystem(PAIR, 'Justrite'));

        expect(updateState.mock.calls[0][0].componentConfigs).toStrictEqual({
            [PAIR]: { ERP_BASE_URL: 'x', ERP_DISPLAY_NAME: 'Justrite ERP' },
        });
    });
});

describe('useProjectBuilder — a catalog entry that brings no system', () => {
    it('has no system to rename, and says so by writing nothing', () => {
        const { result, updateState } = setup({ selectedAppBuilderComponents: [UNPAIRED] });

        expect(() => act(() => result.current.onRenamePairedSystem(UNPAIRED, 'Anything'))).not.toThrow();

        expect(updateState).not.toHaveBeenCalled();
    });
});
