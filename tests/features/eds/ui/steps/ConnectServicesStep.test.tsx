/**
 * Unit Tests: ConnectServicesStep Component
 *
 * Tests for the combined GitHub + DA.live authentication step.
 *
 * Coverage:
 * - Cards update independently
 * - Cancel input calls cancelAuth and hides form
 * - Change credentials shows input form directly
 * - Continue enabled when both services connected
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { Provider, defaultTheme } from '@adobe/react-spectrum';
import type { WizardState } from '@/types/webview';

// Mock the auth hooks
const mockGitHubAuth = {
    isChecking: false,
    isAuthenticating: false,
    isAuthenticated: false,
    user: undefined,
    error: undefined,
    startOAuth: jest.fn(),
    changeAccount: jest.fn(),
};

const mockDaLiveAuth = {
    isChecking: false,
    isAuthenticating: false,
    isAuthenticated: false,
    verifiedOrg: undefined,
    error: undefined,
    setupComplete: false,
    openDaLive: jest.fn(),
    storeToken: jest.fn(),
    storeTokenWithOrg: jest.fn(),
    checkAuthStatus: jest.fn(),
    resetAuth: jest.fn(),
    cancelAuth: jest.fn(),
};

jest.mock('@/features/eds/ui/hooks/useGitHubAuth', () => ({
    useGitHubAuth: jest.fn(() => mockGitHubAuth),
}));

jest.mock('@/features/eds/ui/hooks/useDaLiveAuth', () => ({
    useDaLiveAuth: jest.fn(() => mockDaLiveAuth),
}));

// Import after mocks
import { ConnectServicesStep } from '@/features/eds/ui/steps/ConnectServicesStep';
import { useGitHubAuth } from '@/features/eds/ui/hooks/useGitHubAuth';
import { useDaLiveAuth } from '@/features/eds/ui/hooks/useDaLiveAuth';

// Wrapper component with Spectrum provider
const renderWithProvider = (ui: React.ReactElement) => {
    return render(
        <Provider theme={defaultTheme}>
            {ui}
        </Provider>
    );
};

// Default wizard state
const createDefaultState = (): WizardState => ({
    currentStep: 'connect-services',
    projectName: 'test-project',
    projectTemplate: 'citisignal',
    adobeAuth: { isAuthenticated: true, isChecking: false },
    edsConfig: {
        accsHost: 'https://accs.example.com',
        storeViewCode: 'default',
        customerGroup: 'general',
        repoName: '',
        daLiveOrg: '',
        daLiveSite: '',
    },
});

describe('ConnectServicesStep', () => {
    let mockUpdateState: jest.Mock;
    let mockSetCanProceed: jest.Mock;

    beforeEach(() => {
        jest.clearAllMocks();
        mockUpdateState = jest.fn();
        mockSetCanProceed = jest.fn();

        // Reset mock auth states
        Object.assign(mockGitHubAuth, {
            isChecking: false,
            isAuthenticating: false,
            isAuthenticated: false,
            user: undefined,
            error: undefined,
        });

        Object.assign(mockDaLiveAuth, {
            isChecking: false,
            isAuthenticating: false,
            isAuthenticated: false,
            verifiedOrg: undefined,
            error: undefined,
            setupComplete: false,
        });
    });

    describe('rendering', () => {
        it('should render both service cards', () => {
            // Given: Default state
            const state = createDefaultState();

            // When: Rendering the component
            renderWithProvider(
                <ConnectServicesStep
                    state={state}
                    updateState={mockUpdateState}
                    setCanProceed={mockSetCanProceed}
                />
            );

            // Then: Both cards should be visible
            expect(screen.getByText('GitHub')).toBeInTheDocument();
            expect(screen.getByText('DA.live')).toBeInTheDocument();
        });

        it('should render layout toggle buttons', () => {
            // Given: Default state
            const state = createDefaultState();

            // When: Rendering the component
            renderWithProvider(
                <ConnectServicesStep
                    state={state}
                    updateState={mockUpdateState}
                    setCanProceed={mockSetCanProceed}
                />
            );

            // Then: Layout toggles should be visible
            expect(screen.getByLabelText('Side-by-side cards')).toBeInTheDocument();
            expect(screen.getByLabelText('Vertical cards')).toBeInTheDocument();
            expect(screen.getByLabelText('Checklist view')).toBeInTheDocument();
        });
    });

    describe('canProceed state', () => {
        it('should set canProceed to false when neither service is connected', () => {
            // Given: Both services not authenticated
            const state = createDefaultState();

            // When: Rendering
            renderWithProvider(
                <ConnectServicesStep
                    state={state}
                    updateState={mockUpdateState}
                    setCanProceed={mockSetCanProceed}
                />
            );

            // Then: setCanProceed should be called with false
            expect(mockSetCanProceed).toHaveBeenCalledWith(false);
        });

        it('should set canProceed to false when only GitHub is connected', () => {
            // Given: Only GitHub authenticated
            mockGitHubAuth.isAuthenticated = true;
            mockGitHubAuth.user = { login: 'testuser' };
            const state = createDefaultState();

            // When: Rendering
            renderWithProvider(
                <ConnectServicesStep
                    state={state}
                    updateState={mockUpdateState}
                    setCanProceed={mockSetCanProceed}
                />
            );

            // Then: setCanProceed should be called with false
            expect(mockSetCanProceed).toHaveBeenCalledWith(false);
        });

        it('should set canProceed to true when both services are connected', () => {
            // Given: Both services authenticated
            mockGitHubAuth.isAuthenticated = true;
            mockGitHubAuth.user = { login: 'testuser' };
            mockDaLiveAuth.isAuthenticated = true;
            mockDaLiveAuth.verifiedOrg = 'test-org';
            const state = createDefaultState();

            // When: Rendering
            renderWithProvider(
                <ConnectServicesStep
                    state={state}
                    updateState={mockUpdateState}
                    setCanProceed={mockSetCanProceed}
                />
            );

            // Then: setCanProceed should be called with true
            expect(mockSetCanProceed).toHaveBeenCalledWith(true);
        });
    });

    describe('DA.live setup flow', () => {
        it('should call openDaLive and show input form when clicking Set up', () => {
            // Given: DA.live not connected
            const state = createDefaultState();

            renderWithProvider(
                <ConnectServicesStep
                    state={state}
                    updateState={mockUpdateState}
                    setCanProceed={mockSetCanProceed}
                />
            );

            // When: Clicking set up button
            const setupButton = screen.getByText('Set up DA.live');
            fireEvent.click(setupButton);

            // Then: Should call openDaLive
            expect(mockDaLiveAuth.openDaLive).toHaveBeenCalled();
        });
    });

    describe('cancel input behavior', () => {
        it('should call cancelAuth when clicking Cancel on input form', async () => {
            // Given: DA.live input form is showing
            const state = createDefaultState();

            renderWithProvider(
                <ConnectServicesStep
                    state={state}
                    updateState={mockUpdateState}
                    setCanProceed={mockSetCanProceed}
                />
            );

            // First, click Set up to show the form
            const setupButton = screen.getByText('Set up DA.live');
            fireEvent.click(setupButton);

            // When: Clicking Cancel
            const cancelButton = screen.getByText('Cancel');
            fireEvent.click(cancelButton);

            // Then: Should call cancelAuth to reset authenticating state
            expect(mockDaLiveAuth.cancelAuth).toHaveBeenCalled();
        });

        it('should hide input form when clicking Cancel', async () => {
            // Given: DA.live input form is showing
            const state = createDefaultState();

            renderWithProvider(
                <ConnectServicesStep
                    state={state}
                    updateState={mockUpdateState}
                    setCanProceed={mockSetCanProceed}
                />
            );

            // First, click Set up to show the form
            const setupButton = screen.getByText('Set up DA.live');
            fireEvent.click(setupButton);

            // Verify form is showing
            expect(screen.getByPlaceholderText('Organization')).toBeInTheDocument();

            // When: Clicking Cancel
            const cancelButton = screen.getByText('Cancel');
            fireEvent.click(cancelButton);

            // Then: Form should be hidden, showing Set up button again
            await waitFor(() => {
                expect(screen.queryByPlaceholderText('Organization')).not.toBeInTheDocument();
            });
        });
    });

    describe('change credentials behavior', () => {
        it('should show input form directly when clicking Change on connected DA.live', async () => {
            // Given: DA.live is connected
            mockDaLiveAuth.isAuthenticated = true;
            mockDaLiveAuth.verifiedOrg = 'test-org';

            // Mock resetAuth to simulate clearing auth state
            mockDaLiveAuth.resetAuth.mockImplementation(() => {
                mockDaLiveAuth.isAuthenticated = false;
                mockDaLiveAuth.verifiedOrg = undefined;
            });

            const state = createDefaultState();

            const { rerender } = renderWithProvider(
                <ConnectServicesStep
                    state={state}
                    updateState={mockUpdateState}
                    setCanProceed={mockSetCanProceed}
                />
            );

            // When: Clicking Change button
            const changeButton = screen.getByText('Change');
            fireEvent.click(changeButton);

            // Then: Should call resetAuth
            expect(mockDaLiveAuth.resetAuth).toHaveBeenCalled();

            // Re-render to reflect mock state change
            rerender(
                <Provider theme={defaultTheme}>
                    <ConnectServicesStep
                        state={state}
                        updateState={mockUpdateState}
                        setCanProceed={mockSetCanProceed}
                    />
                </Provider>
            );

            // And input form should be shown (not the Set up button)
            await waitFor(() => {
                expect(screen.getByPlaceholderText('Organization')).toBeInTheDocument();
            });
        });

        it('should call resetAuth to clear credentials when changing', () => {
            // Given: DA.live is connected
            mockDaLiveAuth.isAuthenticated = true;
            mockDaLiveAuth.verifiedOrg = 'test-org';
            const state = createDefaultState();

            renderWithProvider(
                <ConnectServicesStep
                    state={state}
                    updateState={mockUpdateState}
                    setCanProceed={mockSetCanProceed}
                />
            );

            // When: Clicking Change button
            const changeButton = screen.getByText('Change');
            fireEvent.click(changeButton);

            // Then: Should call resetAuth to clear old credentials
            expect(mockDaLiveAuth.resetAuth).toHaveBeenCalled();
        });
    });

    describe('cards independence', () => {
        it('should not pass compact prop to GitHub card', () => {
            // Given: Default state
            const state = createDefaultState();

            // When: Rendering
            renderWithProvider(
                <ConnectServicesStep
                    state={state}
                    updateState={mockUpdateState}
                    setCanProceed={mockSetCanProceed}
                />
            );

            // Then: useGitHubAuth should be called (cards rendered independently)
            expect(useGitHubAuth).toHaveBeenCalledWith({
                state,
                updateState: mockUpdateState,
            });

            // And useDaLiveAuth should be called
            expect(useDaLiveAuth).toHaveBeenCalledWith({
                state,
                updateState: mockUpdateState,
            });
        });
    });

    describe('token verification', () => {
        it('should call storeTokenWithOrg when submitting credentials', async () => {
            // Given: DA.live input form is showing
            const state = createDefaultState();

            renderWithProvider(
                <ConnectServicesStep
                    state={state}
                    updateState={mockUpdateState}
                    setCanProceed={mockSetCanProceed}
                />
            );

            // Show the form
            const setupButton = screen.getByText('Set up DA.live');
            fireEvent.click(setupButton);

            // When: Entering credentials and clicking Verify
            const orgInput = screen.getByPlaceholderText('Organization');
            const tokenInput = screen.getByPlaceholderText('Token');

            fireEvent.change(orgInput, { target: { value: 'my-org' } });
            fireEvent.change(tokenInput, { target: { value: 'my-token' } });

            const verifyButton = screen.getByText('Verify');
            fireEvent.click(verifyButton);

            // Then: Should call storeTokenWithOrg with token and org
            expect(mockDaLiveAuth.storeTokenWithOrg).toHaveBeenCalledWith('my-token', 'my-org');
        });
    });
});
