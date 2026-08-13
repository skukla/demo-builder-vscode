/**
 * Unit Tests: RepoSelectionInline
 *
 * The GitHubRepoSelectionStep body re-homed from TwoColumnLayout to a single
 * column for the StorefrontStep group. It no longer owns canProceed — instead it
 * surfaces TWO independent verdicts to the parent: `onRepoValidChange` (the repo
 * choice, no app gate) and `onCodeSyncValidChange` (the AEM-Code-Sync app gate).
 * The `phase` prop selects which body renders (`repository` vs `code-sync`), but
 * BOTH validity callbacks fire regardless of phase. No right-column summary.
 *
 * Coverage:
 * - `repository` phase renders the repo pick/create UI (NOT the Code Sync status)
 * - `code-sync` phase renders the Code Sync status/install UI
 * - New-repo + existing-repo selection update edsConfig
 * - Validity flows out via onRepoValidChange / onCodeSyncValidChange
 * - daLiveSite is locked to repoName on new-repo input
 *
 * @jest-environment jsdom
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { Provider, defaultTheme } from '@adobe/react-spectrum';
import type { WizardState, EDSConfig } from '@/types/webview';
import '@testing-library/jest-dom';

// Mock webviewClient (used for create-github-repo + check-github-app)
const mockPostMessage = jest.fn();
const mockOnMessage = jest.fn(() => jest.fn());
const mockRequest = jest.fn();

jest.mock('@/core/ui/utils/WebviewClient', () => ({
    webviewClient: {
        postMessage: mockPostMessage,
        onMessage: mockOnMessage,
        request: mockRequest,
        ready: jest.fn().mockResolvedValue(undefined),
    },
}));

jest.mock('@/core/ui/utils/webviewLogger', () => ({
    webviewLogger: jest.fn(() => ({
        debug: jest.fn(),
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
    })),
}));

const TestWrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <Provider theme={defaultTheme} colorScheme="light">
        {children}
    </Provider>
);

const createDefaultState = (overrides?: Partial<EDSConfig>): WizardState => ({
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
        githubAuth: {
            isAuthenticated: true,
            user: { login: 'testuser' },
        },
        ...overrides,
    },
});

describe('RepoSelectionInline', () => {
    let mockUpdateState: jest.Mock;
    let mockOnRepoValidChange: jest.Mock;
    let mockOnCodeSyncValidChange: jest.Mock;

    beforeEach(() => {
        jest.clearAllMocks();
        mockUpdateState = jest.fn();
        mockOnRepoValidChange = jest.fn();
        mockOnCodeSyncValidChange = jest.fn();
        mockRequest.mockReset();
        // webviewClient.request always returns a promise. mockReset leaves it
        // returning undefined, so any NEW request the component makes crashes on
        // `.then` — which is how check-repo-readiness broke these two tests
        // without either of them being about readiness. Default to a resolved
        // promise; per-test mockResolvedValue still overrides.
        mockRequest.mockResolvedValue({ success: true });
    });

    const renderInline = (
        state: WizardState,
        phase: 'repository' | 'code-sync' = 'repository',
    ) =>
        import('@/features/eds/ui/steps/RepoSelectionInline').then(({ RepoSelectionInline }) => {
            render(
                <TestWrapper>
                    <RepoSelectionInline
                        state={state}
                        updateState={mockUpdateState}
                        phase={phase}
                        onRepoValidChange={mockOnRepoValidChange}
                        onCodeSyncValidChange={mockOnCodeSyncValidChange}
                    />
                </TestWrapper>,
            );
        });

    describe('repository phase', () => {
        it('should render the new-repo form in new mode', async () => {
            await renderInline(createDefaultState({ repoMode: 'new' }), 'repository');
            expect(screen.getByLabelText(/repository name/i)).toBeInTheDocument();
        });

        it('should NOT render a "Configuration Summary" right column', async () => {
            await renderInline(createDefaultState({ repoMode: 'new' }), 'repository');
            expect(screen.queryByText(/configuration summary/i)).not.toBeInTheDocument();
        });

        it('should NOT render the "AEM Code Sync App" status in the repository phase', async () => {
            const state = createDefaultState({ repoMode: 'new', repoName: 'my-repo' });
            await renderInline(state, 'repository');
            expect(screen.queryByText(/AEM Code Sync App/i)).not.toBeInTheDocument();
        });

        it('should show the "New" action to switch to create mode (existing)', async () => {
            const state = createDefaultState({ repoMode: 'existing' });
            (state as WizardState & { githubReposCache: unknown[] }).githubReposCache = [
                { id: 'repo-1', name: 'my-repo', fullName: 'testuser/my-repo' },
            ];
            await renderInline(state, 'repository');
            expect(screen.getByRole('button', { name: /new/i })).toBeInTheDocument();
        });
    });

    describe('new-repo input updates edsConfig (daLiveSite locked to repoName)', () => {
        it('mirrors daLiveSite to the normalized repo name on new-repo input', async () => {
            await renderInline(createDefaultState({ repoMode: 'new' }), 'repository');

            const input = screen.getByLabelText(/repository name/i);
            fireEvent.change(input, { target: { value: 'My New Store' } });

            const lastCall = mockUpdateState.mock.calls.at(-1)?.[0];
            const { repoName, daLiveSite } = lastCall?.edsConfig ?? {};
            expect(daLiveSite).toBe(repoName);
            expect(repoName).toBeTruthy();
        });
    });

    describe('repo validity flows out via onRepoValidChange (no app gate)', () => {
        it('should report repo VALID when an existing repo is selected', async () => {
            const state = createDefaultState({
                repoMode: 'existing',
                selectedRepo: { id: 'repo-1', name: 'my-repo', fullName: 'testuser/my-repo' },
            });
            // Pre-populate cache so isLoading starts false.
            (state as WizardState & { githubReposCache: unknown[] }).githubReposCache = [
                { id: 'repo-1', name: 'my-repo', fullName: 'testuser/my-repo' },
            ];

            await renderInline(state, 'repository');

            await waitFor(() => {
                expect(mockOnRepoValidChange).toHaveBeenCalledWith(true);
            });
        });

        it('should report repo INVALID for a new repo not yet created', async () => {
            const state = createDefaultState({ repoMode: 'new', repoName: 'my-valid-repo' });

            await renderInline(state, 'repository');

            await waitFor(() => {
                expect(mockOnRepoValidChange).toHaveBeenCalledWith(false);
            });
        });
    });

    describe('code-sync phase', () => {
        // Note: the `code-sync` sub-step is omitted entirely for an existing repo
        // (storefrontSectionOrder), so there is no existing-repo code-sync VIEW to test;
        // its validity is still auto-reported (below) which is what makes the skip safe.
        it('should report code-sync VALID for an existing repo (gate deferred)', async () => {
            const state = createDefaultState({
                repoMode: 'existing',
                selectedRepo: { id: 'repo-1', name: 'my-repo', fullName: 'testuser/my-repo' },
            });

            await renderInline(state, 'code-sync');

            await waitFor(() => {
                expect(mockOnCodeSyncValidChange).toHaveBeenCalledWith(true);
            });
        });

        it('should report code-sync INVALID for a new created repo whose app is not installed', async () => {
            mockRequest.mockResolvedValue({ success: true, isInstalled: false });
            const state = createDefaultState({
                repoMode: 'new',
                repoName: 'my-repo',
                createdRepo: { owner: 'testuser', name: 'my-repo', url: '', fullName: 'testuser/my-repo' },
            });

            await renderInline(state, 'code-sync');

            await waitFor(() => {
                expect(mockOnCodeSyncValidChange).toHaveBeenCalledWith(false);
            });
        });

        it('should render the "AEM Code Sync App" status for a created new repo', async () => {
            mockRequest.mockResolvedValue({ success: true, isInstalled: false });
            const state = createDefaultState({
                repoMode: 'new',
                repoName: 'my-repo',
                createdRepo: { owner: 'testuser', name: 'my-repo', url: '', fullName: 'testuser/my-repo' },
            });

            await renderInline(state, 'code-sync');

            await waitFor(() => {
                expect(screen.getByText(/AEM Code Sync App/i)).toBeInTheDocument();
            });
        });
    });
});
