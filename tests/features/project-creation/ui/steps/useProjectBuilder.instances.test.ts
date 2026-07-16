/**
 * useProjectBuilder Tests — instance identity group (shell instancing)
 *
 * Split from useProjectBuilder.test.ts to keep both files under the eslint
 * max-lines limit (same precedent as useProjectBuilder.addons.test.ts).
 * Covers onAddCustomAppBuilderComponent instance identity (commit under the
 * instance id with a named source), onRemoveAppBuilderComponent, and
 * onRenameAppBuilderComponent (display name only). Shared fixtures + setup in
 * useProjectBuilder.testUtils.ts.
 *
 * @jest-environment jsdom
 */

import { act } from '@testing-library/react';
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

import { setup } from './useProjectBuilder.testUtils';

describe('useProjectBuilder — onAddCustomAppBuilderComponent (instance identity)', () => {
    const SHELL_SOURCE = { owner: 'skukla', repo: 'app-builder-shell', branch: 'main' };

    it('commits under the INSTANCE id with a named source when an instance is passed', () => {
        const { result, updateState } = setup({ selectedStack: 'headless-paas' });
        act(() => {
            result.current.onAddCustomAppBuilderComponent(SHELL_SOURCE, {
                id: 'firefly-image-gen',
                name: 'Firefly Image Gen',
            });
        });
        expect(updateState).toHaveBeenCalledWith({
            selectedAppBuilderComponents: ['firefly-image-gen'],
            appBuilderComponentSources: {
                'firefly-image-gen': {
                    owner: 'skukla',
                    repo: 'app-builder-shell',
                    branch: 'main',
                    name: 'Firefly Image Gen',
                },
            },
        });
    });

    it('adds two differently-named instances of the SAME shell repo side by side', () => {
        const { result, rerender, updateState, stateRef } = setup({
            selectedStack: 'headless-paas',
        });
        act(() => {
            result.current.onAddCustomAppBuilderComponent(SHELL_SOURCE, {
                id: 'order-sync',
                name: 'Order Sync',
            });
        });
        rerender({ state: stateRef.current });
        act(() => {
            result.current.onAddCustomAppBuilderComponent(SHELL_SOURCE, {
                id: 'firefly-image-gen',
                name: 'Firefly Image Gen',
            });
        });
        const call = updateState.mock.calls.at(-1)![0] as Partial<WizardState>;
        expect(call.selectedAppBuilderComponents).toEqual(['order-sync', 'firefly-image-gen']);
        expect(call.appBuilderComponentSources).toEqual({
            'order-sync': { ...SHELL_SOURCE, name: 'Order Sync' },
            'firefly-image-gen': { ...SHELL_SOURCE, name: 'Firefly Image Gen' },
        });
    });

    it('keeps the no-instance call byte-identical to today (owner-repo id, no name key)', () => {
        const { result, updateState } = setup({ selectedStack: 'headless-paas' });
        act(() => {
            result.current.onAddCustomAppBuilderComponent({ owner: 'acme', repo: 'widget' });
        });
        expect(updateState).toHaveBeenCalledWith({
            selectedAppBuilderComponents: ['acme-widget'],
            appBuilderComponentSources: {
                'acme-widget': { owner: 'acme', repo: 'widget', branch: undefined },
            },
        });
        const call = updateState.mock.calls[0][0] as Partial<WizardState>;
        expect(call.appBuilderComponentSources!['acme-widget']).not.toHaveProperty('name');
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

    it('removes an INSTANCE id: selection + named source + API picks all clean up', () => {
        const { result, updateState } = setup({
            selectedStack: 'headless-paas',
            selectedAppBuilderComponents: ['firefly-image-gen', 'other-repo'],
            appBuilderComponentSources: {
                'firefly-image-gen': {
                    owner: 'skukla',
                    repo: 'app-builder-shell',
                    branch: 'main',
                    name: 'Firefly Image Gen',
                },
                'other-repo': { owner: 'other', repo: 'repo' },
            },
            selectedConsoleApis: { 'firefly-image-gen': ['FireflyServicesSDK'] },
        });
        act(() => {
            result.current.onRemoveAppBuilderComponent('firefly-image-gen');
        });
        expect(updateState).toHaveBeenCalledWith({
            selectedAppBuilderComponents: ['other-repo'],
            appBuilderComponentSources: { 'other-repo': { owner: 'other', repo: 'repo' } },
            selectedConsoleApis: {},
        });
    });
});

describe('useProjectBuilder — onRenameAppBuilderComponent (display name only)', () => {
    const INSTANCE_STATE = {
        selectedStack: 'headless-paas',
        selectedAppBuilderComponents: ['firefly-image-gen', 'other-repo'],
        appBuilderComponentSources: {
            'firefly-image-gen': {
                owner: 'skukla',
                repo: 'app-builder-shell',
                branch: 'main',
                name: 'Firefly Image Gen',
            },
            'other-repo': { owner: 'other', repo: 'repo' },
        },
        selectedConsoleApis: { 'firefly-image-gen': ['FireflyServicesSDK'] },
    };

    it('updates sources[id].name in place, preserving owner/repo/branch and sibling entries', () => {
        const { result, updateState } = setup(INSTANCE_STATE);
        act(() => {
            result.current.onRenameAppBuilderComponent('firefly-image-gen', 'Firefly Video Gen');
        });
        expect(updateState).toHaveBeenCalledWith({
            appBuilderComponentSources: {
                'firefly-image-gen': {
                    owner: 'skukla',
                    repo: 'app-builder-shell',
                    branch: 'main',
                    name: 'Firefly Video Gen',
                },
                'other-repo': { owner: 'other', repo: 'repo' },
            },
        });
    });

    it('touches ONLY the source map — selection, API picks, and the id stay untouched (pin)', () => {
        const { result, updateState } = setup(INSTANCE_STATE);
        act(() => {
            result.current.onRenameAppBuilderComponent('firefly-image-gen', 'Firefly Video Gen');
        });
        expect(updateState).toHaveBeenCalledTimes(1);
        const written = updateState.mock.calls[0][0] as Record<string, unknown>;
        // Rename is display-name only: the update carries EXACTLY the source map —
        // never selectedAppBuilderComponents (id immutable) or selectedConsoleApis.
        expect(Object.keys(written)).toEqual(['appBuilderComponentSources']);
    });

    it('no-ops (no state write) when the id has no source record (legacy blank / catalog ids)', () => {
        const { result, updateState } = setup({
            selectedStack: 'headless-paas',
            selectedAppBuilderComponents: ['app-builder-shell'],
        });
        act(() => {
            result.current.onRenameAppBuilderComponent('app-builder-shell', 'Anything');
        });
        expect(updateState).not.toHaveBeenCalled();
    });
});
