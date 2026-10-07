/**
 * useProjectBuilder Tests — selectedConsoleApis cleanup group
 *
 * Split from useProjectBuilder.test.ts to keep both files under the eslint
 * max-lines limit (same precedent as useProjectBuilder.addons.test.ts).
 * Covers the integrations-flow cleanup contract: onRemoveAppBuilderComponent
 * and onAppBuilderComponentToggle(id, false) also drop the integration's
 * `selectedConsoleApis[id]` picks, without churning state when no picks exist
 * and without disturbing the mesh selection handling.
 *
 */

import { renderHook, act } from '@testing-library/react';
import { useProjectBuilder } from '@/features/project-creation/ui/steps/useProjectBuilder';
import { COMPONENT_IDS } from '@/core/constants';
import type { DemoPackage, GitSource } from '@/types/demoPackages';
import type { Stack } from '@/types/stacks';
import type { WizardState } from '@/types/webview';

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

const mockGitSource: GitSource = {
    type: 'git',
    url: 'https://github.com/test/repo',
    branch: 'main',
    gitOptions: { shallow: true },
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

const citisignal: DemoPackage = {
    id: 'citisignal',
    name: 'CitiSignal',
    description: 'A test package',
    configDefaults: {},
    storefronts: {
        'headless-paas': { name: 'CS HL', description: '', source: mockGitSource },
    },
};

/** Render the hook with a controlled WizardState (mirrors the sibling harness). */
function setup(initial: Partial<WizardState> = {}) {
    const stateRef: { current: WizardState } = {
        current: {
            currentStep: 'welcome',
            projectName: '',
            selectedPackage: 'citisignal',
            selectedStack: 'headless-paas',
            adobeAuth: { isAuthenticated: false, isChecking: false },
            ...initial,
        } as WizardState,
    };
    const updateState = jest.fn((partial: Partial<WizardState>) => {
        stateRef.current = { ...stateRef.current, ...partial };
    });

    const { result } = renderHook(() =>
        useProjectBuilder(stateRef.current, updateState, {
            packages: [citisignal],
            stacks: [headlessStack],
        })
    );

    return { result, updateState };
}

describe('useProjectBuilder — selectedConsoleApis cleanup (integrations flow)', () => {
    it('onRemoveAppBuilderComponent drops the integration selectedConsoleApis key', () => {
        const { result, updateState } = setup({
            selectedAppBuilderComponents: ['erp-sync'],
            selectedConsoleApis: { 'erp-sync': ['CampaignSDK'] },
        });
        act(() => {
            result.current.onRemoveAppBuilderComponent('erp-sync');
        });
        const call = updateState.mock.calls[0][0];
        expect(call.selectedConsoleApis).toStrictEqual({});
    });

    it('onRemoveAppBuilderComponent preserves other integrations picks', () => {
        const { result, updateState } = setup({
            selectedAppBuilderComponents: ['erp-sync', 'other-app'],
            selectedConsoleApis: {
                'erp-sync': ['CampaignSDK'],
                'other-app': ['AssetsSDK'],
            },
        });
        act(() => {
            result.current.onRemoveAppBuilderComponent('erp-sync');
        });
        const call = updateState.mock.calls[0][0];
        expect(call.selectedConsoleApis).toEqual({ 'other-app': ['AssetsSDK'] });
    });

    it('onRemoveAppBuilderComponent omits selectedConsoleApis when no picks are stored', () => {
        const { result, updateState } = setup({
            selectedAppBuilderComponents: ['erp-sync'],
        });
        act(() => {
            result.current.onRemoveAppBuilderComponent('erp-sync');
        });
        const call = updateState.mock.calls[0][0];
        expect('selectedConsoleApis' in call).toBe(false);
    });

    it('toggle-OFF drops the integration selectedConsoleApis key', () => {
        const { result, updateState } = setup({
            selectedAppBuilderComponents: ['erp-sync'],
            selectedConsoleApis: { 'erp-sync': ['CampaignSDK'] },
        });
        act(() => {
            result.current.onAppBuilderComponentToggle('erp-sync', false);
        });
        const call = updateState.mock.calls[0][0];
        expect(call.selectedConsoleApis).toStrictEqual({});
    });

    it('toggle-OFF preserves other integrations picks', () => {
        const { result, updateState } = setup({
            selectedAppBuilderComponents: ['erp-sync', 'other-app'],
            selectedConsoleApis: {
                'erp-sync': ['CampaignSDK'],
                'other-app': ['AssetsSDK'],
            },
        });
        act(() => {
            result.current.onAppBuilderComponentToggle('erp-sync', false);
        });
        const call = updateState.mock.calls[0][0];
        expect(call.selectedConsoleApis).toEqual({ 'other-app': ['AssetsSDK'] });
    });

    it('toggle-ON leaves selectedConsoleApis untouched', () => {
        const { result, updateState } = setup({
            selectedConsoleApis: { 'other-app': ['AssetsSDK'] },
        });
        act(() => {
            result.current.onAppBuilderComponentToggle('erp-sync', true);
        });
        const call = updateState.mock.calls[0][0];
        expect('selectedConsoleApis' in call).toBe(false);
    });

    it('toggle-OFF without stored picks omits selectedConsoleApis from the update', () => {
        const { result, updateState } = setup({
            selectedAppBuilderComponents: ['erp-sync'],
        });
        act(() => {
            result.current.onAppBuilderComponentToggle('erp-sync', false);
        });
        const call = updateState.mock.calls[0][0];
        expect('selectedConsoleApis' in call).toBe(false);
    });

    it('mesh toggle-OFF drops the key along with the selection', () => {
        const { result, updateState } = setup({
            selectedAppBuilderComponents: ['headless-commerce-mesh'],
            selectedConsoleApis: { 'headless-commerce-mesh': ['GraphQLServiceSDK'] },
        });
        act(() => {
            result.current.onAppBuilderComponentToggle('headless-commerce-mesh', false);
        });
        const call = updateState.mock.calls[0][0];
        expect(call.selectedAppBuilderComponents).toStrictEqual([]);
        expect(call.selectedConsoleApis).toStrictEqual({});
    });
});

// The wizard names a pair by the rule the dashboard's add enforces (pairNames), read
// against the real catalog, so a project created with the pair matches one it is added to.
describe('useProjectBuilder — naming the ERP pair', () => {
    it('records the typed name as the ERP\'s and the catalog name as the integration\'s', () => {
        const { result, updateState } = setup({ componentConfigs: { 'erp-integration': { ERP_BASE_URL: 'x' } } });
        act(() => {
            result.current.onAppBuilderComponentToggle('erp-integration', true, 'JustRite ERP Integration');
        });
        expect(updateState.mock.calls[0][0].componentConfigs).toEqual({
            'erp-integration': {
                ERP_BASE_URL: 'x',
                INTEGRATION_DISPLAY_NAME: 'ERP Integration',
                ERP_DISPLAY_NAME: 'JustRite ERP',
            },
        });
    });

    it('a pair added without a name gets the defaults', () => {
        const { result, updateState } = setup();
        act(() => {
            result.current.onAppBuilderComponentToggle('erp-integration', true);
        });
        expect(updateState.mock.calls[0][0].componentConfigs?.['erp-integration']).toEqual({
            INTEGRATION_DISPLAY_NAME: 'ERP Integration',
            ERP_DISPLAY_NAME: 'Acme ERP',
        });
    });

    const NAMED = {
        selectedAppBuilderComponents: ['erp-integration'],
        componentConfigs: {
            'erp-integration': {
                ERP_BASE_URL: 'x',
                INTEGRATION_DISPLAY_NAME: 'ERP Integration',
                ERP_DISPLAY_NAME: 'Acme ERP',
            },
        },
    };

    it('the pencil renames the integration alone', () => {
        const { result, updateState } = setup(NAMED);
        act(() => {
            result.current.onRenameAppBuilderComponent('erp-integration', 'Order Sync');
        });
        expect(updateState).toHaveBeenCalledWith({
            componentConfigs: {
                'erp-integration': {
                    ERP_BASE_URL: 'x',
                    INTEGRATION_DISPLAY_NAME: 'Order Sync',
                    ERP_DISPLAY_NAME: 'Acme ERP',
                },
            },
        });
    });

    it('Settings renames the ERP alone, by the rule the add used', () => {
        const { result, updateState } = setup(NAMED);
        act(() => {
            result.current.onRenamePairedSystem('erp-integration', 'Justrite');
        });
        expect(updateState).toHaveBeenCalledWith({
            componentConfigs: {
                'erp-integration': {
                    ERP_BASE_URL: 'x',
                    INTEGRATION_DISPLAY_NAME: 'ERP Integration',
                    ERP_DISPLAY_NAME: 'Justrite ERP',
                },
            },
        });
    });

    it('neither rename touches an entry that brings no named system', () => {
        const { result, updateState } = setup({ selectedAppBuilderComponents: ['erp-sync'] });
        act(() => {
            result.current.onRenameAppBuilderComponent('erp-sync', 'Anything');
            result.current.onRenamePairedSystem('erp-sync', 'Anything');
        });
        expect(updateState).not.toHaveBeenCalled();
    });

    it('an entry that brings no system records no names', () => {
        const { result, updateState } = setup();
        act(() => {
            result.current.onAppBuilderComponentToggle('erp-sync', true, 'Anything');
        });
        expect('componentConfigs' in updateState.mock.calls[0][0]).toBe(false);
    });
});
