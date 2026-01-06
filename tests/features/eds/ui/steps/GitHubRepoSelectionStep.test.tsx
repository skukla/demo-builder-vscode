/**
 * Unit Tests: GitHubRepoSelectionStep
 *
 * Tests for the GitHub repository selection step with searchable list.
 *
 * Coverage: 10 tests
 * - Create New Mode (3 tests)
 * - Existing Repository Mode (3 tests)
 * - Reset to Template (2 tests)
 * - Navigation State (2 tests)
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider, defaultTheme } from '@adobe/react-spectrum';
import type { WizardState, EDSConfig } from '@/types/webview';
import '@testing-library/jest-dom';

// Mock webviewClient
const mockPostMessage = jest.fn();
const mockOnMessage = jest.fn(() => jest.fn()); // Return unsubscribe function

jest.mock('@/core/ui/utils/WebviewClient', () => ({
    webviewClient: {
        postMessage: mockPostMessage,
        onMessage: mockOnMessage,
        ready: jest.fn().mockResolvedValue(undefined),
    },
}));

// Mock webviewLogger
jest.mock('@/core/ui/utils/webviewLogger', () => ({
    webviewLogger: jest.fn(() => ({
        debug: jest.fn(),
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
    })),
}));

// Test wrapper with Spectrum provider
const TestWrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <Provider theme={defaultTheme} colorScheme="light">
        {children}
    </Provider>
);

// Default wizard state for repository selection
const createDefaultState = (overrides?: Partial<EDSConfig>): WizardState => ({
    currentStep: 'repo-selection',
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

describe('GitHubRepoSelectionStep', () => {
    let mockUpdateState: jest.Mock;
    let mockSetCanProceed: jest.Mock;

    beforeEach(() => {
        jest.clearAllMocks();
        mockUpdateState = jest.fn();
        mockSetCanProceed = jest.fn();
    });

    describe('Create New Mode', () => {
        it('should show repository form when in new mode', async () => {
            // Given: New mode (not existing mode since "New" button requires async repo loading)
            const state = createDefaultState({ repoMode: 'new' });

            // When: Component renders
            const { GitHubRepoSelectionStep } = await import('@/features/eds/ui/steps/GitHubRepoSelectionStep');
            render(
                <TestWrapper>
                    <GitHubRepoSelectionStep
                        state={state}
                        updateState={mockUpdateState}
                        setCanProceed={mockSetCanProceed}
                    />
                </TestWrapper>
            );

            // Then: Should show "New Repository" heading (the form is displayed)
            expect(screen.getByRole('heading', { name: /New Repository/i })).toBeInTheDocument();
        });

        it('should show repository name input in new mode', async () => {
            // Given: New repo mode
            const state = createDefaultState({ repoMode: 'new' });

            // When: Component renders
            const { GitHubRepoSelectionStep } = await import('@/features/eds/ui/steps/GitHubRepoSelectionStep');
            render(
                <TestWrapper>
                    <GitHubRepoSelectionStep
                        state={state}
                        updateState={mockUpdateState}
                        setCanProceed={mockSetCanProceed}
                    />
                </TestWrapper>
            );

            // Then: Should show repo name input
            expect(screen.getByLabelText(/repository name/i)).toBeInTheDocument();
        });

        it('should validate repository name on blur', async () => {
            // Given: New repo mode with invalid name already set
            const state = createDefaultState({ repoMode: 'new', repoName: '-invalid-name' });

            // When: Component renders with invalid name
            const { GitHubRepoSelectionStep } = await import('@/features/eds/ui/steps/GitHubRepoSelectionStep');
            render(
                <TestWrapper>
                    <GitHubRepoSelectionStep
                        state={state}
                        updateState={mockUpdateState}
                        setCanProceed={mockSetCanProceed}
                    />
                </TestWrapper>
            );

            // Trigger blur to show validation error
            const repoInput = screen.getByLabelText(/repository name/i);
            fireEvent.blur(repoInput);

            // Then: Should show validation error
            await waitFor(() => {
                expect(screen.getByText(/must start with a letter or number/i)).toBeInTheDocument();
            });
        });
    });

    describe('Existing Repository Mode', () => {
        it('should show Use Existing button in new mode', async () => {
            // Given: New mode selected
            const state = createDefaultState({ repoMode: 'new' });

            // When: Component renders
            const { GitHubRepoSelectionStep } = await import('@/features/eds/ui/steps/GitHubRepoSelectionStep');
            render(
                <TestWrapper>
                    <GitHubRepoSelectionStep
                        state={state}
                        updateState={mockUpdateState}
                        setCanProceed={mockSetCanProceed}
                    />
                </TestWrapper>
            );

            // Then: Should show Use Existing button
            expect(screen.getByRole('button', { name: /Browse/i })).toBeInTheDocument();
        });

        it('should show configuration summary', async () => {
            // Given: Default state with GitHub user
            const state = createDefaultState({
                githubAuth: {
                    isAuthenticated: true,
                    user: { login: 'testuser' },
                },
            });

            // When: Component renders
            const { GitHubRepoSelectionStep } = await import('@/features/eds/ui/steps/GitHubRepoSelectionStep');
            render(
                <TestWrapper>
                    <GitHubRepoSelectionStep
                        state={state}
                        updateState={mockUpdateState}
                        setCanProceed={mockSetCanProceed}
                    />
                </TestWrapper>
            );

            // Then: Should show configuration summary with GitHub account
            expect(screen.getByText(/configuration summary/i)).toBeInTheDocument();
            expect(screen.getByText(/github account/i)).toBeInTheDocument();
        });

        it('should show selected repository in summary', async () => {
            // Given: A repository is selected
            const state = createDefaultState({
                repoMode: 'existing',
                selectedRepo: {
                    id: 'repo-1',
                    name: 'my-repo',
                    fullName: 'testuser/my-repo',
                },
            });

            // When: Component renders
            const { GitHubRepoSelectionStep } = await import('@/features/eds/ui/steps/GitHubRepoSelectionStep');
            render(
                <TestWrapper>
                    <GitHubRepoSelectionStep
                        state={state}
                        updateState={mockUpdateState}
                        setCanProceed={mockSetCanProceed}
                    />
                </TestWrapper>
            );

            // Then: Should show selected repo in summary
            expect(screen.getByText(/testuser\/my-repo/)).toBeInTheDocument();
        });
    });

    describe('Reset to Template', () => {
        it('should show reset to template checkbox when repo selected', async () => {
            // Given: A repository is selected
            const state = createDefaultState({
                repoMode: 'existing',
                selectedRepo: {
                    id: 'repo-1',
                    name: 'my-repo',
                    fullName: 'testuser/my-repo',
                },
            });

            // When: Component renders
            const { GitHubRepoSelectionStep } = await import('@/features/eds/ui/steps/GitHubRepoSelectionStep');
            render(
                <TestWrapper>
                    <GitHubRepoSelectionStep
                        state={state}
                        updateState={mockUpdateState}
                        setCanProceed={mockSetCanProceed}
                    />
                </TestWrapper>
            );

            // Then: Should show reset checkbox
            expect(screen.getByRole('checkbox', { name: /reset to template/i })).toBeInTheDocument();
        });

        it('should show warning when reset is checked', async () => {
            // Given: A repository is selected with reset enabled
            const state = createDefaultState({
                repoMode: 'existing',
                selectedRepo: {
                    id: 'repo-1',
                    name: 'my-repo',
                    fullName: 'testuser/my-repo',
                },
                resetToTemplate: true,
            });

            // When: Component renders
            const { GitHubRepoSelectionStep } = await import('@/features/eds/ui/steps/GitHubRepoSelectionStep');
            render(
                <TestWrapper>
                    <GitHubRepoSelectionStep
                        state={state}
                        updateState={mockUpdateState}
                        setCanProceed={mockSetCanProceed}
                    />
                </TestWrapper>
            );

            // Then: Should show warning about data loss
            expect(screen.getByText(/delete and recreate/i)).toBeInTheDocument();
        });
    });

    describe('Navigation State', () => {
        it('should enable Continue when new repo name is valid', async () => {
            // Given: New mode with valid repo name
            const state = createDefaultState({
                repoMode: 'new',
                repoName: 'my-valid-repo',
            });

            // When: Component renders
            const { GitHubRepoSelectionStep } = await import('@/features/eds/ui/steps/GitHubRepoSelectionStep');
            render(
                <TestWrapper>
                    <GitHubRepoSelectionStep
                        state={state}
                        updateState={mockUpdateState}
                        setCanProceed={mockSetCanProceed}
                    />
                </TestWrapper>
            );

            // Then: Should enable Continue
            await waitFor(() => {
                expect(mockSetCanProceed).toHaveBeenCalledWith(true);
            });
        });

        it('should enable Continue when existing repo is selected', async () => {
            // Given: Existing mode with repo selected
            const state = createDefaultState({
                repoMode: 'existing',
                selectedRepo: {
                    id: 'repo-1',
                    name: 'my-repo',
                    fullName: 'testuser/my-repo',
                },
            });

            // When: Component renders
            const { GitHubRepoSelectionStep } = await import('@/features/eds/ui/steps/GitHubRepoSelectionStep');
            render(
                <TestWrapper>
                    <GitHubRepoSelectionStep
                        state={state}
                        updateState={mockUpdateState}
                        setCanProceed={mockSetCanProceed}
                    />
                </TestWrapper>
            );

            // Then: Should enable Continue
            await waitFor(() => {
                expect(mockSetCanProceed).toHaveBeenCalledWith(true);
            });
        });
    });
});
