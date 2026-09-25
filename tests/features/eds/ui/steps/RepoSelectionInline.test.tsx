/**
 * Unit Tests: RepoSelectionInline
 *
 * The Storefront area's Repository sub-step body: the repo pick/create UI, no
 * right-column summary. One verdict flows out — `onRepoValidChange`. The Code Sync
 * sub-step and its phase prop were removed on 2026-09-25 (setup asks the App
 * question where it can be answered).
 *
 * Coverage:
 * - renders the repo pick/create UI, never a Code Sync status
 * - New-repo + existing-repo selection update edsConfig
 * - Validity flows out via onRepoValidChange
 * - daLiveSite is locked to repoName on new-repo input
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

import { settle } from '../../../../helpers/reactSettle';
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
            user: { login: 'testuser', email: null, name: null, avatarUrl: null },
        },
        ...overrides,
    },
});

describe('RepoSelectionInline', () => {
    let mockUpdateState: jest.Mock;
    let mockOnRepoValidChange: jest.Mock;

    beforeEach(() => {
        jest.clearAllMocks();
        mockUpdateState = jest.fn();
        mockOnRepoValidChange = jest.fn();
        mockRequest.mockReset();
        // webviewClient.request always returns a promise. mockReset leaves it
        // returning undefined, so any NEW request the component makes crashes on
        // `.then` — which is how check-repo-readiness broke these two tests
        // without either of them being about readiness. Default to a resolved
        // promise; per-test mockResolvedValue still overrides.
        mockRequest.mockResolvedValue({ success: true });
    });

    /**
     * The component, imported ONCE rather than per render.
     *
     * This used to be a dynamic `import(...).then(render)` inside renderInline,
     * and that await boundary was the whole reason this suite could not be
     * silenced. Tracing it: the component's mount effect fires check-github-app,
     * whose response resolves on a microtask; awaiting the import then YIELDS,
     * and the resolution ran in that gap — after render, before any settle could
     * start. Nothing placed inside the test could reach it, which is why six
     * different settle placements all left the count at exactly 20.
     *
     * Importing in beforeAll removes the gap: render and settle now sit in one
     * uninterrupted stretch, so the response commits inside act().
     *
     * (A static top-level import would work too — jest.mock is hoisted above it
     * either way. beforeAll is the smaller change and keeps the mock preamble
     * reading as it did.)
     */
    let RepoSelectionInline: typeof import('@/features/eds/ui/steps/RepoSelectionInline').RepoSelectionInline;

    beforeAll(async () => {
        ({ RepoSelectionInline } = await import('@/features/eds/ui/steps/RepoSelectionInline'));
    });

    const renderInline = async (state: WizardState) => {
        render(
            <TestWrapper>
                <RepoSelectionInline
                    state={state}
                    updateState={mockUpdateState}
                    onRepoValidChange={mockOnRepoValidChange}
                />
            </TestWrapper>
        );
        // No await between render and this: see the note on the import above.
        await settle();
    };

    describe('the repository body', () => {
        it('should render the new-repo form in new mode', async () => {
            await renderInline(createDefaultState({ repoMode: 'new' }));
            expect(screen.getByLabelText(/repository name/i)).toBeInTheDocument();
        });

        it('should NOT render a "Configuration Summary" right column', async () => {
            await renderInline(createDefaultState({ repoMode: 'new' }));
            expect(screen.queryByText(/configuration summary/i)).not.toBeInTheDocument();
        });

        it('never renders an AEM Code Sync status', async () => {
            const state = createDefaultState({ repoMode: 'new', repoName: 'my-repo' });
            await renderInline(state);
            expect(screen.queryByText(/AEM Code Sync App/i)).not.toBeInTheDocument();
        });

        it('should show the "New" action to switch to create mode (existing)', async () => {
            const state = createDefaultState({ repoMode: 'existing' });
            (state as WizardState & { githubReposCache: unknown[] }).githubReposCache = [
                {
                    id: 'repo-1',
                    name: 'my-repo',
                    fullName: 'testuser/my-repo',
                    htmlUrl: 'https://github.com/testuser/my-repo',
                },
            ];
            await renderInline(state);
            expect(screen.getByRole('button', { name: /new/i })).toBeInTheDocument();
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

    describe('repo validity flows out via onRepoValidChange', () => {
        it('should report repo VALID when an existing repo is selected', async () => {
            const state = createDefaultState({
                repoMode: 'existing',
                selectedRepo: {
                    id: 'repo-1',
                    name: 'my-repo',
                    fullName: 'testuser/my-repo',
                    htmlUrl: 'https://github.com/testuser/my-repo',
                },
            });
            // Pre-populate cache so isLoading starts false.
            (state as WizardState & { githubReposCache: unknown[] }).githubReposCache = [
                {
                    id: 'repo-1',
                    name: 'my-repo',
                    fullName: 'testuser/my-repo',
                    htmlUrl: 'https://github.com/testuser/my-repo',
                },
            ];

            await renderInline(state);

            await waitFor(() => {
                expect(mockOnRepoValidChange).toHaveBeenCalledWith(true);
            });
        });

        it('should report repo INVALID for a new repo not yet created', async () => {
            const state = createDefaultState({ repoMode: 'new', repoName: 'my-valid-repo' });

            await renderInline(state);

            await waitFor(() => {
                expect(mockOnRepoValidChange).toHaveBeenCalledWith(false);
            });
        });
    });
});
