/**
 * Unit Tests: DaLiveServiceCard
 *
 * Tests for the DA.live service card presentational component.
 * Used in ConnectServicesStep for side-by-side card layout.
 *
 * Coverage:
 * - Authenticated state with org display
 * - Input form display and submission
 * - Setup/connect button
 * - Error state
 * - Cancel input action
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider, defaultTheme } from '@adobe/react-spectrum';
import '@testing-library/jest-dom';

// Test wrapper with Spectrum provider
const TestWrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <Provider theme={defaultTheme} colorScheme="light">
        {children}
    </Provider>
);

describe('DaLiveServiceCard', () => {
    let mockOnSetup: jest.Mock;
    let mockOnSubmit: jest.Mock;
    let mockOnReset: jest.Mock;
    let mockOnCancelInput: jest.Mock;

    beforeEach(() => {
        jest.clearAllMocks();
        mockOnSetup = jest.fn();
        mockOnSubmit = jest.fn();
        mockOnReset = jest.fn();
        mockOnCancelInput = jest.fn();
    });

    describe('Checking State', () => {
        it('should show progress indicator when checking', async () => {
            // Given: isChecking is true
            const { DaLiveServiceCard } = await import(
                '@/features/eds/ui/components/DaLiveServiceCard'
            );

            // When: Component renders
            render(
                <TestWrapper>
                    <DaLiveServiceCard
                        isChecking={true}
                        isAuthenticating={false}
                        isAuthenticated={false}
                        showInput={false}
                        onSetup={mockOnSetup}
                        onSubmit={mockOnSubmit}
                        onReset={mockOnReset}
                        onCancelInput={mockOnCancelInput}
                    />
                </TestWrapper>
            );

            // Then: Should show checking indicator
            expect(screen.getByLabelText(/checking/i)).toBeInTheDocument();
        });

        it('should show verifying text when authenticating', async () => {
            // Given: isAuthenticating is true
            const { DaLiveServiceCard } = await import(
                '@/features/eds/ui/components/DaLiveServiceCard'
            );

            // When: Component renders
            render(
                <TestWrapper>
                    <DaLiveServiceCard
                        isChecking={false}
                        isAuthenticating={true}
                        isAuthenticated={false}
                        showInput={false}
                        onSetup={mockOnSetup}
                        onSubmit={mockOnSubmit}
                        onReset={mockOnReset}
                        onCancelInput={mockOnCancelInput}
                    />
                </TestWrapper>
            );

            // Then: Should show verifying text
            expect(screen.getByText(/verifying/i)).toBeInTheDocument();
        });
    });

    describe('Authenticated State', () => {
        it('should show verified org when authenticated', async () => {
            // Given: User is authenticated with verified org
            const { DaLiveServiceCard } = await import(
                '@/features/eds/ui/components/DaLiveServiceCard'
            );

            // When: Component renders
            render(
                <TestWrapper>
                    <DaLiveServiceCard
                        isChecking={false}
                        isAuthenticating={false}
                        isAuthenticated={true}
                        verifiedOrg="my-org"
                        showInput={false}
                        onSetup={mockOnSetup}
                        onSubmit={mockOnSubmit}
                        onReset={mockOnReset}
                        onCancelInput={mockOnCancelInput}
                    />
                </TestWrapper>
            );

            // Then: Should show org name
            expect(screen.getByText('my-org')).toBeInTheDocument();
        });

        it('should show Connected fallback when authenticated without org', async () => {
            // Given: User is authenticated but no verifiedOrg
            const { DaLiveServiceCard } = await import(
                '@/features/eds/ui/components/DaLiveServiceCard'
            );

            // When: Component renders
            render(
                <TestWrapper>
                    <DaLiveServiceCard
                        isChecking={false}
                        isAuthenticating={false}
                        isAuthenticated={true}
                        showInput={false}
                        onSetup={mockOnSetup}
                        onSubmit={mockOnSubmit}
                        onReset={mockOnReset}
                        onCancelInput={mockOnCancelInput}
                    />
                </TestWrapper>
            );

            // Then: Should show Connected fallback
            expect(screen.getByText('Connected')).toBeInTheDocument();
        });

        it('should show change button when authenticated', async () => {
            // Given: User is authenticated
            const { DaLiveServiceCard } = await import(
                '@/features/eds/ui/components/DaLiveServiceCard'
            );

            render(
                <TestWrapper>
                    <DaLiveServiceCard
                        isChecking={false}
                        isAuthenticating={false}
                        isAuthenticated={true}
                        verifiedOrg="my-org"
                        showInput={false}
                        onSetup={mockOnSetup}
                        onSubmit={mockOnSubmit}
                        onReset={mockOnReset}
                        onCancelInput={mockOnCancelInput}
                    />
                </TestWrapper>
            );

            // Then: Should show change button
            expect(screen.getByRole('button', { name: /change/i })).toBeInTheDocument();
        });

        it('should call onReset when change button clicked', async () => {
            // Given: User is authenticated
            const { DaLiveServiceCard } = await import(
                '@/features/eds/ui/components/DaLiveServiceCard'
            );

            render(
                <TestWrapper>
                    <DaLiveServiceCard
                        isChecking={false}
                        isAuthenticating={false}
                        isAuthenticated={true}
                        verifiedOrg="my-org"
                        showInput={false}
                        onSetup={mockOnSetup}
                        onSubmit={mockOnSubmit}
                        onReset={mockOnReset}
                        onCancelInput={mockOnCancelInput}
                    />
                </TestWrapper>
            );

            // When: User clicks change
            fireEvent.click(screen.getByRole('button', { name: /change/i }));

            // Then: onReset should be called
            expect(mockOnReset).toHaveBeenCalledTimes(1);
        });
    });

    describe('Input Form', () => {
        it('should show input form when showInput is true', async () => {
            // Given: showInput is true
            const { DaLiveServiceCard } = await import(
                '@/features/eds/ui/components/DaLiveServiceCard'
            );

            // When: Component renders
            render(
                <TestWrapper>
                    <DaLiveServiceCard
                        isChecking={false}
                        isAuthenticating={false}
                        isAuthenticated={false}
                        showInput={true}
                        onSetup={mockOnSetup}
                        onSubmit={mockOnSubmit}
                        onReset={mockOnReset}
                        onCancelInput={mockOnCancelInput}
                    />
                </TestWrapper>
            );

            // Then: Should show org and token inputs
            expect(screen.getByPlaceholderText(/organization/i)).toBeInTheDocument();
            expect(screen.getByPlaceholderText(/token/i)).toBeInTheDocument();
        });

        it('should show verify and cancel buttons in input form', async () => {
            // Given: showInput is true
            const { DaLiveServiceCard } = await import(
                '@/features/eds/ui/components/DaLiveServiceCard'
            );

            render(
                <TestWrapper>
                    <DaLiveServiceCard
                        isChecking={false}
                        isAuthenticating={false}
                        isAuthenticated={false}
                        showInput={true}
                        onSetup={mockOnSetup}
                        onSubmit={mockOnSubmit}
                        onReset={mockOnReset}
                        onCancelInput={mockOnCancelInput}
                    />
                </TestWrapper>
            );

            // Then: Should show verify and cancel buttons
            expect(screen.getByRole('button', { name: /verify/i })).toBeInTheDocument();
            expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument();
        });

        it('should have verify button disabled when inputs empty', async () => {
            // Given: showInput is true with empty inputs
            const { DaLiveServiceCard } = await import(
                '@/features/eds/ui/components/DaLiveServiceCard'
            );

            render(
                <TestWrapper>
                    <DaLiveServiceCard
                        isChecking={false}
                        isAuthenticating={false}
                        isAuthenticated={false}
                        showInput={true}
                        onSetup={mockOnSetup}
                        onSubmit={mockOnSubmit}
                        onReset={mockOnReset}
                        onCancelInput={mockOnCancelInput}
                    />
                </TestWrapper>
            );

            // Then: Verify button should be disabled
            const verifyButton = screen.getByRole('button', { name: /verify/i });
            expect(verifyButton).toBeDisabled();
        });

        it('should call onCancelInput when cancel clicked', async () => {
            // Given: showInput is true
            const { DaLiveServiceCard } = await import(
                '@/features/eds/ui/components/DaLiveServiceCard'
            );

            render(
                <TestWrapper>
                    <DaLiveServiceCard
                        isChecking={false}
                        isAuthenticating={false}
                        isAuthenticated={false}
                        showInput={true}
                        onSetup={mockOnSetup}
                        onSubmit={mockOnSubmit}
                        onReset={mockOnReset}
                        onCancelInput={mockOnCancelInput}
                    />
                </TestWrapper>
            );

            // When: User clicks cancel
            fireEvent.click(screen.getByRole('button', { name: /cancel/i }));

            // Then: onCancelInput should be called
            expect(mockOnCancelInput).toHaveBeenCalledTimes(1);
        });

        it('should show error in input form when provided', async () => {
            // Given: Error in input form
            const { DaLiveServiceCard } = await import(
                '@/features/eds/ui/components/DaLiveServiceCard'
            );

            render(
                <TestWrapper>
                    <DaLiveServiceCard
                        isChecking={false}
                        isAuthenticating={false}
                        isAuthenticated={false}
                        showInput={true}
                        error="Invalid token"
                        onSetup={mockOnSetup}
                        onSubmit={mockOnSubmit}
                        onReset={mockOnReset}
                        onCancelInput={mockOnCancelInput}
                    />
                </TestWrapper>
            );

            // Then: Should show error message
            expect(screen.getByText('Invalid token')).toBeInTheDocument();
        });
    });

    describe('Setup Button', () => {
        it('should show setup button when not authenticated and not showing input', async () => {
            // Given: Not authenticated, no input shown
            const { DaLiveServiceCard } = await import(
                '@/features/eds/ui/components/DaLiveServiceCard'
            );

            render(
                <TestWrapper>
                    <DaLiveServiceCard
                        isChecking={false}
                        isAuthenticating={false}
                        isAuthenticated={false}
                        showInput={false}
                        onSetup={mockOnSetup}
                        onSubmit={mockOnSubmit}
                        onReset={mockOnReset}
                        onCancelInput={mockOnCancelInput}
                    />
                </TestWrapper>
            );

            // Then: Should show setup button
            expect(screen.getByRole('button', { name: /set up da\.live/i })).toBeInTheDocument();
        });

        it('should call onSetup when setup button clicked', async () => {
            // Given: Not authenticated
            const { DaLiveServiceCard } = await import(
                '@/features/eds/ui/components/DaLiveServiceCard'
            );

            render(
                <TestWrapper>
                    <DaLiveServiceCard
                        isChecking={false}
                        isAuthenticating={false}
                        isAuthenticated={false}
                        showInput={false}
                        onSetup={mockOnSetup}
                        onSubmit={mockOnSubmit}
                        onReset={mockOnReset}
                        onCancelInput={mockOnCancelInput}
                    />
                </TestWrapper>
            );

            // When: User clicks setup
            fireEvent.click(screen.getByRole('button', { name: /set up da\.live/i }));

            // Then: onSetup should be called
            expect(mockOnSetup).toHaveBeenCalledTimes(1);
        });
    });

    describe('Error State', () => {
        it('should show error and try again when error provided and no input', async () => {
            // Given: Error state without input form
            const { DaLiveServiceCard } = await import(
                '@/features/eds/ui/components/DaLiveServiceCard'
            );

            render(
                <TestWrapper>
                    <DaLiveServiceCard
                        isChecking={false}
                        isAuthenticating={false}
                        isAuthenticated={false}
                        showInput={false}
                        error="Connection failed"
                        onSetup={mockOnSetup}
                        onSubmit={mockOnSubmit}
                        onReset={mockOnReset}
                        onCancelInput={mockOnCancelInput}
                    />
                </TestWrapper>
            );

            // Then: Should show error and try again button
            expect(screen.getByText('Connection failed')).toBeInTheDocument();
            expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument();
        });
    });

    describe('Card Display', () => {
        it('should render card with DA icon and title', async () => {
            // Given: Service card component
            const { DaLiveServiceCard } = await import(
                '@/features/eds/ui/components/DaLiveServiceCard'
            );

            // When: Component renders
            const { container } = render(
                <TestWrapper>
                    <DaLiveServiceCard
                        isChecking={false}
                        isAuthenticating={false}
                        isAuthenticated={false}
                        showInput={false}
                        onSetup={mockOnSetup}
                        onSubmit={mockOnSubmit}
                        onReset={mockOnReset}
                        onCancelInput={mockOnCancelInput}
                    />
                </TestWrapper>
            );

            // Then: Should have card class and DA.live title
            expect(container.querySelector('.service-card')).toBeInTheDocument();
            expect(screen.getByText('DA.live')).toBeInTheDocument();
        });
    });
});
