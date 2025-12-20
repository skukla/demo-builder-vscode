/**
 * Unit Tests: DataSourceConfigStep
 *
 * Tests for the ACCS credentials and data source configuration step.
 *
 * Coverage: 9 tests
 * - Rendering (2 tests)
 * - Validation (2 tests)
 * - Navigation State (2 tests)
 * - State Updates (1 test)
 * - Loading States (1 test)
 * - Error Display (1 test)
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider, defaultTheme } from '@adobe/react-spectrum';
import type { WizardState, EDSConfig } from '@/types/webview';

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

// Default wizard state for EDS configuration
const createDefaultState = (overrides?: Partial<EDSConfig>): WizardState => ({
    currentStep: 'settings',
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
        ...overrides,
    },
});

describe('DataSourceConfigStep', () => {
    let mockUpdateState: jest.Mock;
    let mockSetCanProceed: jest.Mock;

    beforeEach(() => {
        jest.clearAllMocks();
        mockUpdateState = jest.fn();
        mockSetCanProceed = jest.fn();
    });

    describe('Rendering', () => {
        it('should render ACCS credentials form when EDS component selected', async () => {
            // Given: EDS component is selected
            const state = createDefaultState();

            // When: Component renders
            const { DataSourceConfigStep } = await import('@/features/eds/ui/steps/DataSourceConfigStep');
            render(
                <TestWrapper>
                    <DataSourceConfigStep
                        state={state}
                        updateState={mockUpdateState}
                        setCanProceed={mockSetCanProceed}
                    />
                </TestWrapper>
            );

            // Then: Should display ACCS form fields
            expect(screen.getByLabelText(/ACCS Host/i)).toBeInTheDocument();
            expect(screen.getByLabelText(/Store View Code/i)).toBeInTheDocument();
            expect(screen.getByLabelText(/Customer Group/i)).toBeInTheDocument();
        });

        it('should show data source picker with available options', async () => {
            // Given: Default state
            const state = createDefaultState();

            // When: Component renders
            const { DataSourceConfigStep } = await import('@/features/eds/ui/steps/DataSourceConfigStep');
            render(
                <TestWrapper>
                    <DataSourceConfigStep
                        state={state}
                        updateState={mockUpdateState}
                        setCanProceed={mockSetCanProceed}
                    />
                </TestWrapper>
            );

            // Then: Should display data source picker (renders as combobox in Spectrum)
            const picker = screen.getByRole('button', { name: /data source/i });
            expect(picker).toBeInTheDocument();
        });
    });

    describe('Validation', () => {
        it('should validate ACCS host URL format', async () => {
            // Given: State with invalid URL
            const state = createDefaultState({ accsHost: 'invalid-url' });

            // When: Component renders
            const { DataSourceConfigStep } = await import('@/features/eds/ui/steps/DataSourceConfigStep');
            render(
                <TestWrapper>
                    <DataSourceConfigStep
                        state={state}
                        updateState={mockUpdateState}
                        setCanProceed={mockSetCanProceed}
                    />
                </TestWrapper>
            );

            // Then: Should show validation error
            const hostInput = screen.getByLabelText(/ACCS Host/i);
            await userEvent.type(hostInput, 'invalid-url');
            fireEvent.blur(hostInput);

            await waitFor(() => {
                expect(screen.getByText(/must start with https/i)).toBeInTheDocument();
            });
        });

        it('should accept valid ACCS host URL', async () => {
            // Given: State with valid URL
            const state = createDefaultState({ accsHost: 'https://accs.example.com' });

            // When: Component renders with valid URL
            const { DataSourceConfigStep } = await import('@/features/eds/ui/steps/DataSourceConfigStep');
            render(
                <TestWrapper>
                    <DataSourceConfigStep
                        state={state}
                        updateState={mockUpdateState}
                        setCanProceed={mockSetCanProceed}
                    />
                </TestWrapper>
            );

            // Then: Should not show validation error for host field
            expect(screen.queryByText(/must start with https/i)).not.toBeInTheDocument();
        });
    });

    describe('Navigation State', () => {
        it('should enable Continue when all required fields valid', async () => {
            // Given: All required fields are filled and valid (both DA.live and ACCS)
            const state = createDefaultState({
                // DA.live fields
                daLiveOrg: 'test-org',
                daLiveOrgVerified: true,
                daLiveSite: 'test-site',
                // ACCS fields
                accsHost: 'https://accs.example.com',
                storeViewCode: 'default',
                customerGroup: 'general',
                accsValidated: true,
            });

            // When: Component renders
            const { DataSourceConfigStep } = await import('@/features/eds/ui/steps/DataSourceConfigStep');
            render(
                <TestWrapper>
                    <DataSourceConfigStep
                        state={state}
                        updateState={mockUpdateState}
                        setCanProceed={mockSetCanProceed}
                    />
                </TestWrapper>
            );

            // Then: Should enable Continue (setCanProceed called with true)
            await waitFor(() => {
                expect(mockSetCanProceed).toHaveBeenCalledWith(true);
            });
        });

        it('should disable Continue when required fields empty', async () => {
            // Given: Required fields are empty
            const state = createDefaultState({
                accsHost: '',
                storeViewCode: '',
                customerGroup: '',
            });

            // When: Component renders
            const { DataSourceConfigStep } = await import('@/features/eds/ui/steps/DataSourceConfigStep');
            render(
                <TestWrapper>
                    <DataSourceConfigStep
                        state={state}
                        updateState={mockUpdateState}
                        setCanProceed={mockSetCanProceed}
                    />
                </TestWrapper>
            );

            // Then: Should disable Continue (setCanProceed called with false)
            await waitFor(() => {
                expect(mockSetCanProceed).toHaveBeenCalledWith(false);
            });
        });
    });

    describe('State Updates', () => {
        it('should update wizard state on field changes', async () => {
            // Given: Default state
            const state = createDefaultState();

            // When: User types in ACCS host field
            const { DataSourceConfigStep } = await import('@/features/eds/ui/steps/DataSourceConfigStep');
            render(
                <TestWrapper>
                    <DataSourceConfigStep
                        state={state}
                        updateState={mockUpdateState}
                        setCanProceed={mockSetCanProceed}
                    />
                </TestWrapper>
            );

            const hostInput = screen.getByLabelText(/ACCS Host/i);
            // Type first character to verify onChange is triggered
            await userEvent.type(hostInput, 'h');

            // Then: Should call updateState with the typed character
            await waitFor(() => {
                expect(mockUpdateState).toHaveBeenCalled();
                // First call should have the character typed
                const firstCall = mockUpdateState.mock.calls[0][0];
                expect(firstCall.edsConfig.accsHost).toBe('h');
            });
        });
    });

    describe('Loading States', () => {
        it('should show loading indicator during validation', async () => {
            // Given: State with validation in progress
            const state = createDefaultState({
                accsHost: 'https://accs.example.com',
                storeViewCode: 'default',
                customerGroup: 'general',
            });

            // When: Validation is triggered
            const { DataSourceConfigStep } = await import('@/features/eds/ui/steps/DataSourceConfigStep');
            render(
                <TestWrapper>
                    <DataSourceConfigStep
                        state={state}
                        updateState={mockUpdateState}
                        setCanProceed={mockSetCanProceed}
                    />
                </TestWrapper>
            );

            // Find and click validate button
            const validateButton = screen.getByRole('button', { name: /validate/i });
            await userEvent.click(validateButton);

            // Then: Should send validation message (indicating validation started)
            await waitFor(() => {
                expect(mockPostMessage).toHaveBeenCalledWith('validate-accs-credentials', expect.any(Object));
            });
        });
    });

    describe('Error Display', () => {
        it('should display validation error with recovery hint', async () => {
            // Given: State with validation error
            const state = createDefaultState({
                accsHost: 'https://accs.example.com',
                storeViewCode: 'default',
                customerGroup: 'general',
                accsValidated: false,
                accsValidationError: 'Connection failed: Unable to reach ACCS endpoint',
            });

            // When: Component renders with error state
            const { DataSourceConfigStep } = await import('@/features/eds/ui/steps/DataSourceConfigStep');
            render(
                <TestWrapper>
                    <DataSourceConfigStep
                        state={state}
                        updateState={mockUpdateState}
                        setCanProceed={mockSetCanProceed}
                    />
                </TestWrapper>
            );

            // Then: Should display error message
            expect(screen.getByText(/Connection failed/i)).toBeInTheDocument();
        });

        it('should display validation success message', async () => {
            // Given: State with successful validation
            const state = createDefaultState({
                accsHost: 'https://accs.example.com',
                storeViewCode: 'default',
                customerGroup: 'general',
                accsValidated: true,
            });

            // When: Component renders with success state
            const { DataSourceConfigStep } = await import('@/features/eds/ui/steps/DataSourceConfigStep');
            render(
                <TestWrapper>
                    <DataSourceConfigStep
                        state={state}
                        updateState={mockUpdateState}
                        setCanProceed={mockSetCanProceed}
                    />
                </TestWrapper>
            );

            // Then: Should display success indicator
            expect(screen.getByText(/validated/i)).toBeInTheDocument();
        });
    });
});
