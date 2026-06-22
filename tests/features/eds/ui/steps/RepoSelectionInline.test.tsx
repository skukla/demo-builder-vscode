/**
 * Unit Tests: RepoSelectionInline
 *
 * The GitHubRepoSelectionStep body re-homed from TwoColumnLayout to a single
 * column for the StorefrontStep group. It no longer owns canProceed — instead it
 * surfaces its validity (including the GitHub-App-install gate) to the parent via
 * the `onValidityChange(boolean)` callback. No right-column ConfigurationSummary.
 *
 * Coverage:
 * - Single-column render (no TwoColumnLayout, no "Configuration Summary")
 * - New-repo + existing-repo selection update edsConfig
 * - The GitHub-App-install gate drives validity (un-installed → invalid;
 *   installed → valid; existing selected → valid)
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
    currentStep: 'storefront',
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
    let mockOnValidityChange: jest.Mock;

    beforeEach(() => {
        jest.clearAllMocks();
        mockUpdateState = jest.fn();
        mockOnValidityChange = jest.fn();
        mockRequest.mockReset();
    });

    const renderInline = (state: WizardState) =>
        import('@/features/eds/ui/steps/RepoSelectionInline').then(({ RepoSelectionInline }) => {
            render(
                <TestWrapper>
                    <RepoSelectionInline
                        state={state}
                        updateState={mockUpdateState}
                        onValidityChange={mockOnValidityChange}
                    />
                </TestWrapper>,
            );
        });

    describe('single-column layout', () => {
        it('should render the new-repo form in new mode', async () => {
            await renderInline(createDefaultState({ repoMode: 'new' }));
            expect(screen.getByLabelText(/repository name/i)).toBeInTheDocument();
        });

        it('should NOT render a "Configuration Summary" right column', async () => {
            await renderInline(createDefaultState({ repoMode: 'new' }));
            expect(screen.queryByText(/configuration summary/i)).not.toBeInTheDocument();
        });
    });

    describe('new-repo input updates edsConfig (daLiveSite locked to repoName)', () => {
        it('mirrors daLiveSite to the normalized repo name on new-repo input', async () => {
            await renderInline(createDefaultState({ repoMode: 'new' }));

            const input = screen.getByLabelText(/repository name/i);
            fireEvent.change(input, { target: { value: 'My New Store' } });

            const lastCall = mockUpdateState.mock.calls.at(-1)?.[0];
            const { repoName, daLiveSite } = lastCall?.edsConfig ?? {};
            expect(daLiveSite).toBe(repoName);
            expect(repoName).toBeTruthy();
        });
    });

    describe('GitHub-App-install gate drives validity', () => {
        it('should report VALID when an existing repo is selected (app check deferred)', async () => {
            mockRequest.mockResolvedValue({ success: true, isInstalled: true });
            const state = createDefaultState({
                repoMode: 'existing',
                selectedRepo: { id: 'repo-1', name: 'my-repo', fullName: 'testuser/my-repo' },
            });
            // Pre-populate cache so isLoading starts false.
            (state as WizardState & { githubReposCache: unknown[] }).githubReposCache = [
                { id: 'repo-1', name: 'my-repo', fullName: 'testuser/my-repo' },
            ];

            await renderInline(state);

            await waitFor(() => {
                expect(mockOnValidityChange).toHaveBeenCalledWith(true);
            });
        });

        it('should report INVALID for a new repo not yet created (app gate not satisfied)', async () => {
            mockRequest.mockResolvedValue({ success: true, isInstalled: true });
            const state = createDefaultState({ repoMode: 'new', repoName: 'my-valid-repo' });

            await renderInline(state);

            await waitFor(() => {
                expect(mockOnValidityChange).toHaveBeenCalledWith(false);
            });
        });

        it('should report INVALID when GitHub App is not installed', async () => {
            mockRequest.mockResolvedValue({ success: true, isInstalled: false });
            const state = createDefaultState({
                repoMode: 'existing',
                selectedRepo: { id: 'repo-1', name: 'my-repo', fullName: 'testuser/my-repo' },
            });

            await renderInline(state);

            await waitFor(() => {
                expect(mockOnValidityChange).toHaveBeenCalledWith(false);
            });
        });
    });

    describe('existing-repo browse mode', () => {
        it('should show the "New" action to switch to create mode', async () => {
            const state = createDefaultState({ repoMode: 'existing' });
            (state as WizardState & { githubReposCache: unknown[] }).githubReposCache = [
                { id: 'repo-1', name: 'my-repo', fullName: 'testuser/my-repo' },
            ];
            await renderInline(state);
            expect(screen.getByRole('button', { name: /new/i })).toBeInTheDocument();
        });
    });
});
