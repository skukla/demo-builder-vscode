/**
 * useStorefrontSetup — the storefront setup run, driven without the step.
 *
 * The hook's outputs are what it returns, what it posts, and what it hands the
 * wizard (`updateState`, `setCanProceed`). Every assertion reads one of those.
 * The message channel is the canonical WebviewClient double; the real
 * `vscode-api` wrapper sits between it and the hook.
 */

import {
    mockPostMessage,
    webviewClientHandlers,
} from '../../../../helpers/webviewClientMock';
import { act, renderHook } from '@testing-library/react';
import React from 'react';
import { startDependencies, useStorefrontSetup } from '@/features/eds/ui/hooks/useStorefrontSetup';
import type { EDSConfig, WizardState } from '@/types/webview';
import type {
    StorefrontGitHubAppRequiredPayload,
    StorefrontSetupCompletePayload,
    StorefrontSetupProgressPayload,
} from '@/types/webviewPayloads';
import type {
    StorefrontSetupCancelPayload,
    StorefrontSetupStartPayload,
} from '@/types/webviewRequests';

const EDS: EDSConfig = {
    accsHost: 'https://accs.example.com',
    storeViewCode: 'default',
    customerGroup: 'general',
    repoName: 'test-repo',
    daLiveOrg: 'test-org',
    daLiveSite: 'test-site',
};

function wizardState(overrides: Partial<WizardState> = {}): WizardState {
    return {
        currentStep: 'storefront-setup',
        projectName: 'test-project',
        adobeAuth: { isAuthenticated: true, isChecking: false },
        edsConfig: EDS,
        components: { backend: 'adobe-commerce-accs', dependencies: ['eds-commerce-mesh'] },
        selectedAppBuilderComponents: ['eds-commerce-mesh', 'not-a-mesh'],
        ...overrides,
    };
}

function renderRun(initial: WizardState = wizardState(), strict = false) {
    const updateState = jest.fn();
    const setCanProceed = jest.fn();
    const view = renderHook(
        ({ state }: { state: WizardState }) => useStorefrontSetup(state, updateState, setCanProceed),
        {
            initialProps: { state: initial },
            wrapper: strict ? React.StrictMode : undefined,
        },
    );
    return { ...view, updateState, setCanProceed };
}

function push(type: string, payload: unknown): void {
    const handler = webviewClientHandlers.get(type);
    if (!handler) throw new Error(`No handler registered for '${type}'`);
    act(() => handler(payload));
}

const pushProgress = (p: StorefrontSetupProgressPayload) => push('storefront-setup-progress', p);
const pushComplete = (p: StorefrontSetupCompletePayload) => push('storefront-setup-complete', p);
const pushAppRequired = (p: StorefrontGitHubAppRequiredPayload) =>
    push('storefront-setup-github-app-required', p);

function posted<T>(type: string): T[] {
    return mockPostMessage.mock.calls
        .filter((call: unknown[]) => call[0] === type)
        .map((call: unknown[]) => call[1] as T);
}

beforeEach(() => {
    mockPostMessage.mockClear();
    webviewClientHandlers.clear();
});

describe('starting the run', () => {
    // The mesh id is in both lists here; the first start sends it once, as Retry does.
    it('posts one start with the selections the step mounted with, each dependency once', () => {
        renderRun();
        expect(posted<StorefrontSetupStartPayload>('storefront-setup-start')).toStrictEqual([
            {
                projectName: 'test-project',
                edsConfig: EDS,
                componentConfigs: undefined,
                backendComponentId: 'adobe-commerce-accs',
                dependencies: ['eds-commerce-mesh'],
                selectedAddons: undefined,
                selectedBlockLibraries: undefined,
                customBlockLibraries: undefined,
                selectedPackage: undefined,
                selectedStack: undefined,
                demo: undefined,
            },
        ]);
    });

    it('posts once under StrictMode double-mounting', () => {
        renderRun(wizardState(), true);
        expect(posted('storefront-setup-start')).toHaveLength(1);
    });

    it('does not start an incomplete config, and says why', () => {
        const { result } = renderRun(wizardState({ edsConfig: { ...EDS, daLiveSite: '' } }));
        expect(posted('storefront-setup-start')).toStrictEqual([]);
        expect(result.current.setupState.phase).toBe('error');
        expect(result.current.setupState.error).toBe(
            'Storefront configuration is incomplete — go back and finish the Storefront step.',
        );
    });

    it('starts idle and keeps Continue shut', () => {
        const { result, setCanProceed } = renderRun();
        expect(result.current.setupState.phase).toBe('idle');
        expect(result.current.setupState.message).toBe('Starting storefront setup');
        expect(setCanProceed).toHaveBeenLastCalledWith(false);
    });
});

describe('pushes from the extension', () => {
    it('shows progress as it arrives', () => {
        const { result } = renderRun();
        pushProgress({ phase: 'publish', message: 'Publishing', progress: 80 });
        expect(result.current.setupState.phase).toBe('publish');
        expect(result.current.setupState.progress).toBe(80);
    });

    it('opens Continue and records the repo on the wizard with the LATEST config', () => {
        const { result, rerender, updateState, setCanProceed } = renderRun();
        const later = { ...EDS, storeViewCode: 'b2b' };
        rerender({ state: wizardState({ edsConfig: later }) });
        pushComplete({
            message: 'Done',
            githubRepo: 'test-owner/test-repo',
            brokenLinks: [],
        });
        expect(result.current.setupState.phase).toBe('completed');
        expect(setCanProceed).toHaveBeenLastCalledWith(true);
        expect(updateState).toHaveBeenCalledWith({
            edsConfig: {
                ...later,
                repoUrl: 'test-owner/test-repo',
                preflightComplete: true,
                brokenLinks: [],
            },
        });
    });

    it('stops listening once the step is gone', () => {
        const { unmount } = renderRun();
        expect([...webviewClientHandlers.keys()].sort()).toStrictEqual([
            'storefront-setup-complete',
            'storefront-setup-error',
            'storefront-setup-github-app-required',
            'storefront-setup-progress',
        ]);
        unmount();
        expect([...webviewClientHandlers.keys()]).toStrictEqual([]);
    });
});

describe('the AEM Code Sync pause', () => {
    it('shows the dialog data, then resumes at code sync when the App is seen', () => {
        const { result } = renderRun();
        const data: StorefrontGitHubAppRequiredPayload = {
            owner: 'test-owner',
            repo: 'test-repo',
            installUrl: 'https://github.com/apps/aem-code-sync/installations/new',
            message: 'Install AEM Code Sync',
        };
        pushAppRequired(data);
        expect(result.current.setupState.githubAppData).toStrictEqual(data);

        act(() => result.current.handleInstallDetected());
        expect(result.current.setupState.phase).toBe('code-sync');
        expect(result.current.setupState.githubAppData).toBeUndefined();
    });
});

describe('Retry', () => {
    it('starts again from nothing with the CURRENT selections, mesh listed once', () => {
        const { result, rerender } = renderRun();
        push('storefront-setup-error', { message: 'Failed', error: 'HTTP 502' });
        rerender({ state: wizardState({ projectName: 'renamed-project' }) });
        mockPostMessage.mockClear();

        act(() => result.current.handleRetry());

        expect(result.current.setupState).toStrictEqual({
            phase: 'idle',
            message: 'Retrying storefront setup',
            progress: 0,
            partialState: { repoCreated: false, contentCopied: false, phase: 'idle' },
        });
        const [start] = posted<StorefrontSetupStartPayload>('storefront-setup-start');
        expect(start.projectName).toBe('renamed-project');
        expect(start.dependencies).toStrictEqual(['eds-commerce-mesh']);
    });

    it('does not restart an incomplete config', () => {
        const { result, rerender } = renderRun();
        rerender({ state: wizardState({ edsConfig: { ...EDS, repoName: '' } }) });
        mockPostMessage.mockClear();

        act(() => result.current.handleRetry());

        expect(posted('storefront-setup-start')).toStrictEqual([]);
        expect(result.current.setupState.phase).toBe('error');
    });
});

describe('closing the wizard', () => {
    it('cancels a running setup with what it created and the latest DA.live site', () => {
        const { rerender, unmount } = renderRun();
        pushProgress({
            phase: 'repository',
            message: 'Repository ready',
            progress: 12,
            repoUrl: 'https://github.com/test-owner/test-repo',
            repoOwner: 'test-owner',
            repoName: 'test-repo',
        });
        rerender({ state: wizardState({ edsConfig: { ...EDS, daLiveSite: 'later-site' } }) });

        unmount();

        expect(posted<StorefrontSetupCancelPayload>('storefront-setup-cancel')).toStrictEqual([
            {
                partialState: {
                    repoCreated: true,
                    contentCopied: false,
                    phase: 'repository',
                    repoUrl: 'https://github.com/test-owner/test-repo',
                    repoOwner: 'test-owner',
                    repoName: 'test-repo',
                },
                edsConfig: { daLiveOrg: 'test-org', daLiveSite: 'later-site' },
            },
        ]);
    });

    it('sends no cancel once setup has finished', () => {
        const { unmount } = renderRun();
        pushComplete({ message: 'Done', githubRepo: 'test-owner/test-repo' });
        unmount();
        expect(posted('storefront-setup-cancel')).toStrictEqual([]);
    });
});

describe('startDependencies', () => {
    it('adds the selected mesh to the dependencies, each id once', () => {
        expect(
            startDependencies({
                components: { dependencies: ['eds-commerce-mesh', 'demo-inspector'] },
                selectedAppBuilderComponents: ['eds-commerce-mesh', 'erp-integration'],
            }),
        ).toStrictEqual(['eds-commerce-mesh', 'demo-inspector']);
    });

    it('answers the mesh alone when no dependencies were selected', () => {
        expect(startDependencies({ selectedAppBuilderComponents: ['eds-commerce-mesh'] })).toStrictEqual([
            'eds-commerce-mesh',
        ]);
    });

    it('answers an empty list when nothing was selected', () => {
        expect(startDependencies({})).toStrictEqual([]);
    });
});
