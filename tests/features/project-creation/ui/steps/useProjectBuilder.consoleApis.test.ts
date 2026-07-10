/**
 * useProjectBuilder Tests — selectedConsoleApis cleanup group
 *
 * Split from useProjectBuilder.test.ts to keep both files under the eslint
 * max-lines limit (same precedent as useProjectBuilder.addons.test.ts).
 * Covers the integrations-flow cleanup contract: onRemoveAppBuilderComponent
 * and onAppBuilderComponentToggle(id, false) also drop the integration's
 * `selectedConsoleApis[id]` picks, without churning state when no picks exist
 * and without disturbing the load-bearing mesh mirror-write.
 *
 * @jest-environment jsdom
 */

import { renderHook, act } from '@testing-library/react';
import { useProjectBuilder } from '@/features/project-creation/ui/steps/useProjectBuilder';
import { COMPONENT_IDS } from '@/core/constants';
import type { DemoPackage, GitSource } from '@/types/demoPackages';
import type { Stack } from '@/types/stacks';
import type { WizardState } from '@/types/webview';

// Same deterministic service mocks as the sibling useProjectBuilder files.
jest.mock('@/features/project-creation/services/demoPackageLoader', () => ({
    getResolvedMeshRequirement: jest.fn(() => 'optional'),
    getPackageById: jest.fn(),
}));

jest.mock('@/features/project-creation/services/blockLibraryLoader', () => ({
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
        const call = updateState.mock.calls[0][0] as Partial<WizardState>;
        expect(call.selectedConsoleApis).toEqual({});
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
        const call = updateState.mock.calls[0][0] as Partial<WizardState>;
        expect(call.selectedConsoleApis).toEqual({ 'other-app': ['AssetsSDK'] });
    });

    it('onRemoveAppBuilderComponent omits selectedConsoleApis when no picks are stored', () => {
        const { result, updateState } = setup({
            selectedAppBuilderComponents: ['erp-sync'],
        });
        act(() => {
            result.current.onRemoveAppBuilderComponent('erp-sync');
        });
        const call = updateState.mock.calls[0][0] as Partial<WizardState>;
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
        const call = updateState.mock.calls[0][0] as Partial<WizardState>;
        expect(call.selectedConsoleApis).toEqual({});
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
        const call = updateState.mock.calls[0][0] as Partial<WizardState>;
        expect(call.selectedConsoleApis).toEqual({ 'other-app': ['AssetsSDK'] });
    });

    it('toggle-ON leaves selectedConsoleApis untouched', () => {
        const { result, updateState } = setup({
            selectedConsoleApis: { 'other-app': ['AssetsSDK'] },
        });
        act(() => {
            result.current.onAppBuilderComponentToggle('erp-sync', true);
        });
        const call = updateState.mock.calls[0][0] as Partial<WizardState>;
        expect('selectedConsoleApis' in call).toBe(false);
    });

    it('toggle-OFF without stored picks omits selectedConsoleApis from the update', () => {
        const { result, updateState } = setup({
            selectedAppBuilderComponents: ['erp-sync'],
        });
        act(() => {
            result.current.onAppBuilderComponentToggle('erp-sync', false);
        });
        const call = updateState.mock.calls[0][0] as Partial<WizardState>;
        expect('selectedConsoleApis' in call).toBe(false);
    });

    it('mesh toggle-OFF drops the key AND still clears the mirrored optional dependency', () => {
        const { result, updateState } = setup({
            selectedAppBuilderComponents: ['headless-commerce-mesh'],
            selectedOptionalDependencies: [COMPONENT_IDS.HEADLESS_COMMERCE_MESH],
            selectedConsoleApis: { 'headless-commerce-mesh': ['GraphQLServiceSDK'] },
        });
        act(() => {
            result.current.onAppBuilderComponentToggle('headless-commerce-mesh', false);
        });
        const call = updateState.mock.calls[0][0] as Partial<WizardState>;
        expect(call.selectedAppBuilderComponents).toEqual([]);
        expect(call.selectedOptionalDependencies).toEqual([]);
        expect(call.selectedConsoleApis).toEqual({});
    });
});
