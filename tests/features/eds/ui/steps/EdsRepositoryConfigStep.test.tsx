/**
 * Unit Tests: EdsRepositoryConfigStep
 *
 * Tests for the EDS repository and DA.live configuration step.
 *
 * Coverage: 12 tests
 * - Repository Mode Selection (2 tests)
 * - New Repository Validation (2 tests)
 * - Existing Repository Validation (2 tests)
 * - DA.live Organization (3 tests)
 * - Navigation State (2 tests)
 * - State Preservation (1 test)
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

// Default wizard state for repository configuration
const createDefaultState = (overrides?: Partial<EDSConfig>): WizardState => ({
    currentStep: 'repo-config',
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
        githubAuth: {
            isAuthenticated: true,
            user: { login: 'testuser' },
        },
        ...overrides,
    },
});

describe('EdsRepositoryConfigStep', () => {
    let mockUpdateState: jest.Mock;
    let mockSetCanProceed: jest.Mock;

    beforeEach(() => {
        jest.clearAllMocks();
        mockUpdateState = jest.fn();
        mockSetCanProceed = jest.fn();
    });

    describe('Repository Mode Selection', () => {
        it('should show radio buttons for new vs existing repository', async () => {
            // Given: Default state
            const state = createDefaultState();

            // When: Component renders
            const { EdsRepositoryConfigStep } = await import('@/features/eds/ui/steps/EdsRepositoryConfigStep');
            render(
                <TestWrapper>
                    <EdsRepositoryConfigStep
                        state={state}
                        updateState={mockUpdateState}
                        setCanProceed={mockSetCanProceed}
                    />
                </TestWrapper>
            );

            // Then: Should show both radio options
            expect(screen.getByRole('radio', { name: /create new repository/i })).toBeInTheDocument();
            expect(screen.getByRole('radio', { name: /use existing repository/i })).toBeInTheDocument();
        });

        it('should default to new repository mode', async () => {
            // Given: Default state (repoMode undefined)
            const state = createDefaultState();

            // When: Component renders
            const { EdsRepositoryConfigStep } = await import('@/features/eds/ui/steps/EdsRepositoryConfigStep');
            render(
                <TestWrapper>
                    <EdsRepositoryConfigStep
                        state={state}
                        updateState={mockUpdateState}
                        setCanProceed={mockSetCanProceed}
                    />
                </TestWrapper>
            );

            // Then: New repository should be selected by default
            const newRepoRadio = screen.getByRole('radio', { name: /create new repository/i });
            expect(newRepoRadio).toBeChecked();
        });
    });

    describe('New Repository Validation', () => {
        it('should show repository name input for new repo mode', async () => {
            // Given: New repo mode selected
            const state = createDefaultState({ repoMode: 'new' });

            // When: Component renders
            const { EdsRepositoryConfigStep } = await import('@/features/eds/ui/steps/EdsRepositoryConfigStep');
            render(
                <TestWrapper>
                    <EdsRepositoryConfigStep
                        state={state}
                        updateState={mockUpdateState}
                        setCanProceed={mockSetCanProceed}
                    />
                </TestWrapper>
            );

            // Then: Should show repo name input
            expect(screen.getByLabelText(/repository name/i)).toBeInTheDocument();
        });

        it('should validate repository name format', async () => {
            // Given: New repo mode with invalid name already typed
            // When state has invalid name, the component shows the error
            const state = createDefaultState({ repoMode: 'new', repoName: '-invalid' });

            // When: Component renders with invalid name
            const { EdsRepositoryConfigStep } = await import('@/features/eds/ui/steps/EdsRepositoryConfigStep');
            render(
                <TestWrapper>
                    <EdsRepositoryConfigStep
                        state={state}
                        updateState={mockUpdateState}
                        setCanProceed={mockSetCanProceed}
                    />
                </TestWrapper>
            );

            // Trigger blur to show validation
            const repoInput = screen.getByLabelText(/repository name/i);
            fireEvent.blur(repoInput);

            // Then: Should show validation error
            await waitFor(() => {
                expect(screen.getByText(/must start with a letter or number/i)).toBeInTheDocument();
            });
        });
    });

    describe('Existing Repository Validation', () => {
        it('should show repository format input for existing repo mode', async () => {
            // Given: Existing repo mode selected
            const state = createDefaultState({ repoMode: 'existing' });

            // When: Component renders
            const { EdsRepositoryConfigStep } = await import('@/features/eds/ui/steps/EdsRepositoryConfigStep');
            render(
                <TestWrapper>
                    <EdsRepositoryConfigStep
                        state={state}
                        updateState={mockUpdateState}
                        setCanProceed={mockSetCanProceed}
                    />
                </TestWrapper>
            );

            // Select existing repo mode
            const existingRadio = screen.getByRole('radio', { name: /use existing repository/i });
            fireEvent.click(existingRadio);

            // Then: Should show repo input with owner/repo format hint
            expect(screen.getByPlaceholderText(/owner\/repository/i)).toBeInTheDocument();
        });

        it('should validate existing repo format (owner/repo)', async () => {
            // Given: Existing repo mode
            const state = createDefaultState({ repoMode: 'existing', existingRepo: '' });

            // When: Component renders and user enters invalid format
            const { EdsRepositoryConfigStep } = await import('@/features/eds/ui/steps/EdsRepositoryConfigStep');
            render(
                <TestWrapper>
                    <EdsRepositoryConfigStep
                        state={state}
                        updateState={mockUpdateState}
                        setCanProceed={mockSetCanProceed}
                    />
                </TestWrapper>
            );

            // Select existing repo mode
            const existingRadio = screen.getByRole('radio', { name: /use existing repository/i });
            fireEvent.click(existingRadio);

            const repoInput = screen.getByPlaceholderText(/owner\/repository/i);
            fireEvent.change(repoInput, { target: { value: 'invalid-format' } });
            fireEvent.blur(repoInput);

            // Then: Should show format error
            await waitFor(() => {
                expect(screen.getByText(/format: owner\/repository/i)).toBeInTheDocument();
            });
        });
    });

    describe('DA.live Organization', () => {
        it('should show DA.live organization input field', async () => {
            // Given: Default state
            const state = createDefaultState();

            // When: Component renders
            const { EdsRepositoryConfigStep } = await import('@/features/eds/ui/steps/EdsRepositoryConfigStep');
            render(
                <TestWrapper>
                    <EdsRepositoryConfigStep
                        state={state}
                        updateState={mockUpdateState}
                        setCanProceed={mockSetCanProceed}
                    />
                </TestWrapper>
            );

            // Then: Should show DA.live org input
            expect(screen.getByLabelText(/organization/i)).toBeInTheDocument();
        });

        it('should accept DA.live org input', async () => {
            // Given: State with DA.live org
            const state = createDefaultState();

            // When: User enters org name
            const { EdsRepositoryConfigStep } = await import('@/features/eds/ui/steps/EdsRepositoryConfigStep');
            render(
                <TestWrapper>
                    <EdsRepositoryConfigStep
                        state={state}
                        updateState={mockUpdateState}
                        setCanProceed={mockSetCanProceed}
                    />
                </TestWrapper>
            );

            const orgInput = screen.getByLabelText(/organization/i);
            fireEvent.change(orgInput, { target: { value: 'test-org' } });

            // Then: Input should have the value and updateState should be called
            await waitFor(() => {
                expect(mockUpdateState).toHaveBeenCalled();
            });
        });

        it('should show verified indicator when DA.live org is verified', async () => {
            // Given: DA.live org is verified
            const state = createDefaultState({
                daLiveOrg: 'verified-org',
                daLiveOrgVerified: true,
            });

            // When: Component renders
            const { EdsRepositoryConfigStep } = await import('@/features/eds/ui/steps/EdsRepositoryConfigStep');
            render(
                <TestWrapper>
                    <EdsRepositoryConfigStep
                        state={state}
                        updateState={mockUpdateState}
                        setCanProceed={mockSetCanProceed}
                    />
                </TestWrapper>
            );

            // Then: Should show verified indicator
            expect(screen.getByText(/verified/i)).toBeInTheDocument();
        });
    });

    describe('Navigation State', () => {
        it('should enable Continue when all requirements met (new repo)', async () => {
            // Given: All fields valid for new repo mode
            const state = createDefaultState({
                repoMode: 'new',
                repoName: 'my-eds-project',
                daLiveOrg: 'my-org',
                daLiveOrgVerified: true,
                daLiveSite: 'my-site',
            });

            // When: Component renders
            const { EdsRepositoryConfigStep } = await import('@/features/eds/ui/steps/EdsRepositoryConfigStep');
            render(
                <TestWrapper>
                    <EdsRepositoryConfigStep
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

        it('should disable Continue when required fields empty', async () => {
            // Given: Required fields are empty
            const state = createDefaultState({
                repoName: '',
                daLiveOrg: '',
                daLiveSite: '',
            });

            // When: Component renders
            const { EdsRepositoryConfigStep } = await import('@/features/eds/ui/steps/EdsRepositoryConfigStep');
            render(
                <TestWrapper>
                    <EdsRepositoryConfigStep
                        state={state}
                        updateState={mockUpdateState}
                        setCanProceed={mockSetCanProceed}
                    />
                </TestWrapper>
            );

            // Then: Should disable Continue
            await waitFor(() => {
                expect(mockSetCanProceed).toHaveBeenCalledWith(false);
            });
        });
    });

    describe('State Preservation', () => {
        it('should preserve values when navigating back', async () => {
            // Given: State with existing values
            const state = createDefaultState({
                repoMode: 'new',
                repoName: 'existing-repo',
                daLiveOrg: 'existing-org',
                daLiveSite: 'existing-site',
            });

            // When: Component renders
            const { EdsRepositoryConfigStep } = await import('@/features/eds/ui/steps/EdsRepositoryConfigStep');
            render(
                <TestWrapper>
                    <EdsRepositoryConfigStep
                        state={state}
                        updateState={mockUpdateState}
                        setCanProceed={mockSetCanProceed}
                    />
                </TestWrapper>
            );

            // Then: Should show preserved values
            const repoInput = screen.getByLabelText(/repository name/i) as HTMLInputElement;
            expect(repoInput.value).toBe('existing-repo');
        });
    });
});
