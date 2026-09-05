/**
 * Shared setup for the RepoSelectionInline container suites.
 *
 * THIS FILE OWNS THE MOCK AND THE SUT IMPORT. Specs import the harness from
 * here and never import the component themselves — jest.mock hoists above the
 * imports of the module it appears in, NOT across modules, so a component
 * import left in a spec would bind to the real WebviewClient.
 *
 * Real Spectrum, like the other suites in this directory: the component's own
 * disabled/validation wiring is part of what these specs measure, so stubbing
 * the primitives would remove the thing under test.
 */

// The doubles are built INSIDE the factory and read back below. Declaring them
// as consts above would leave them uninitialised when this module's static SUT
// import runs, because jest.mock is hoisted above it and the factory is not.
jest.mock('@/core/ui/utils/WebviewClient', () => ({
    webviewClient: {
        postMessage: jest.fn(),
        onMessage: jest.fn(() => jest.fn()),
        request: jest.fn(),
        ready: jest.fn().mockResolvedValue(undefined),
    },
}));

// Below the mock on purpose: it must register before the component loads.
import React from 'react';
import { webviewClient } from '@/core/ui/utils/WebviewClient';
import { render } from '@testing-library/react';
import { Provider, defaultTheme } from '@adobe/react-spectrum';
import { settle } from '../../../../helpers/reactSettle';
import { RepoSelectionInline } from '@/features/eds/ui/steps/RepoSelectionInline';
import type { WizardState, EDSConfig, GitHubRepoItem } from '@/types/webview';

const mockPostMessage = webviewClient.postMessage as unknown as jest.Mock;
/** Typed to the real signature, so a spec's handler cannot invent a shape. */
const mockOnMessage = webviewClient.onMessage as unknown as jest.Mock<
    () => void,
    [string, (data: unknown) => void]
>;
const mockRequest = webviewClient.request as unknown as jest.Mock;

export const REPO: GitHubRepoItem = {
    id: 'repo-1',
    name: 'my-store',
    fullName: 'testuser/my-store',
    htmlUrl: 'https://github.com/testuser/my-store',
} as GitHubRepoItem;

export const OTHER: GitHubRepoItem = {
    id: 'repo-2',
    name: 'other-store',
    fullName: 'testuser/other-store',
    htmlUrl: 'https://github.com/testuser/other-store',
    isPrivate: true,
    description: 'The other one',
} as GitHubRepoItem;

/**
 * A state whose repo cache is already populated, so nothing is mid-load.
 *
 * Pass `null` for the cache to leave it unset — that is what makes the hook
 * load on mount, which is the only way to reach the pre-load auth guard.
 */
export function stateWith(
    edsOverrides: Partial<EDSConfig> = {},
    cache: GitHubRepoItem[] | null = [REPO, OTHER]
): WizardState {
    const state = {
        currentStep: 'storefront-setup',
        projectName: 'test-project',
        adobeAuth: { isAuthenticated: true, isChecking: false },
        componentConfigs: {},
        edsConfig: {
            accsHost: '',
            storeViewCode: '',
            customerGroup: '',
            repoName: '',
            daLiveOrg: '',
            daLiveSite: '',
            repoMode: 'existing',
            templateOwner: 'adobe',
            templateRepo: 'aem-boilerplate',
            githubAuth: {
                isAuthenticated: true,
                user: { login: 'testuser', email: null, name: null, avatarUrl: null },
            },
            ...edsOverrides,
        },
    } as WizardState;
    if (cache) {
        (state as WizardState & { githubReposCache: GitHubRepoItem[] }).githubReposCache = cache;
    }
    return state;
}

export type Phase = 'repository' | 'code-sync';

/** The three render styles the specs need, plus readers over the recorded calls. */
export interface SelectionHarness {
    updateState: jest.Mock;
    onRepoValidChange: jest.Mock;
    onCodeSyncValidChange: jest.Mock;
    renderInline: (state: WizardState, phase?: Phase) => Promise<void>;
    renderWithRerender: (
        state: WizardState,
        phase?: Phase
    ) => Promise<(next: WizardState) => Promise<void>>;
    renderStateful: (initial: WizardState) => Promise<void>;
    lastEdsConfig: () => Record<string, unknown>;
    lastConfigPatch: () => Record<string, unknown>;
    clearedSelection: () => boolean;
    requestsOf: (type: string) => unknown[];
}

/**
 * Reset the module mocks. `clearAllMocks` clears calls but NOT implementations,
 * so the request mock is reset and its default re-established here.
 */
export function resetSelectionMocks(): void {
    jest.clearAllMocks();
    mockRequest.mockReset();
    mockRequest.mockResolvedValue({ success: true });
    mockOnMessage.mockImplementation(() => () => undefined);
}

/** Build a fresh harness; call from each spec's `beforeEach`. */
export function createHarness(): SelectionHarness {
    const updateState = jest.fn();
    const onRepoValidChange = jest.fn();
    const onCodeSyncValidChange = jest.fn();

    const ui = (state: WizardState, phase: Phase): React.ReactElement => (
        <Provider theme={defaultTheme} colorScheme="light">
            <RepoSelectionInline
                state={state}
                updateState={updateState}
                phase={phase}
                onRepoValidChange={onRepoValidChange}
                onCodeSyncValidChange={onCodeSyncValidChange}
            />
        </Provider>
    );

    const renderInline = async (state: WizardState, phase: Phase = 'repository') => {
        render(ui(state, phase));
        await settle();
    };

    /**
     * Render, then hand back a `rerender` that swaps the state — which is how
     * the wizard drives this component. Several effects only prove they watch
     * the right things when the state MOVES; a single render cannot show it.
     */
    const renderWithRerender = async (state: WizardState, phase: Phase = 'repository') => {
        const { rerender } = render(ui(state, phase));
        await settle();
        return async (next: WizardState) => {
            rerender(ui(next, phase));
            await settle();
        };
    };

    /**
     * Render with the wizard state HELD, so a patch this component sends is what
     * its next render — and its next callback — sees.
     */
    const renderStateful = async (initial: WizardState) => {
        const Harness = (): React.ReactElement => {
            const [state, setState] = React.useState(initial);
            const update = (patch: Partial<WizardState>): void => {
                updateState(patch);
                setState((prev) => {
                    const next = {
                        ...prev,
                        ...patch,
                        edsConfig: { ...prev.edsConfig, ...patch.edsConfig },
                    } as WizardState;
                    // Same value, same object: the wizard's own store does this,
                    // and without it a patch that changes nothing re-runs every
                    // effect depending on edsConfig, forever.
                    return JSON.stringify(next) === JSON.stringify(prev) ? prev : next;
                });
            };
            return (
                <RepoSelectionInline
                    state={state}
                    updateState={update}
                    phase="repository"
                    onRepoValidChange={onRepoValidChange}
                    onCodeSyncValidChange={onCodeSyncValidChange}
                />
            );
        };
        render(
            <Provider theme={defaultTheme} colorScheme="light">
                <Harness />
            </Provider>
        );
        await settle();
    };

    return {
        updateState,
        onRepoValidChange,
        onCodeSyncValidChange,
        renderInline,
        renderWithRerender,
        renderStateful,
        lastEdsConfig: () => updateState.mock.calls.at(-1)?.[0]?.edsConfig ?? {},
        lastConfigPatch: () =>
            [...updateState.mock.calls].reverse().find((c) => c[0]?.edsConfig)?.[0]?.edsConfig ??
            {},
        clearedSelection: () =>
            updateState.mock.calls.some((c) => 'selectedRepo' in (c[0]?.edsConfig ?? {})),
        requestsOf: (type: string) =>
            mockRequest.mock.calls.filter((c) => c[0] === type).map((c) => c[1]),
    };
}

export { mockPostMessage, mockOnMessage, mockRequest };
