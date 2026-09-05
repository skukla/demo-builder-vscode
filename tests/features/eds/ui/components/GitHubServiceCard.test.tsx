/**
 * Unit Tests: GitHubServiceCard
 *
 * Tests for the GitHub service card presentational component.
 * Used in ConnectServicesStep for side-by-side card layout.
 *
 * Coverage:
 * - Checking state
 * - Authenticated state with user info
 * - Connect button when not authenticated
 * - Error state with retry button
 * - Change account action
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { Provider, defaultTheme } from '@adobe/react-spectrum';
import '@testing-library/jest-dom';
// Imported statically, not re-`await import`ed inside each test. The dynamic
// form loaded the module during the FIRST test only, so everything defined at
// module level — the GitHubIcon mark among it — was attributed to that one test
// and no later assertion could reach it.
import { GitHubServiceCard } from '@/features/eds/ui/components/GitHubServiceCard';

// Test wrapper with Spectrum provider
const TestWrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <Provider theme={defaultTheme} colorScheme="light">
        {children}
    </Provider>
);

describe('GitHubServiceCard', () => {
    let mockOnConnect: jest.Mock;
    let mockOnChangeAccount: jest.Mock;

    beforeEach(() => {
        jest.clearAllMocks();
        mockOnConnect = jest.fn();
        mockOnChangeAccount = jest.fn();
    });

    describe('Checking State', () => {
        it('should show progress indicator when checking', () => {
            // When: Component renders
            render(
                <TestWrapper>
                    <GitHubServiceCard
                        isChecking={true}
                        isAuthenticating={false}
                        isAuthenticated={false}
                        onConnect={mockOnConnect}
                    />
                </TestWrapper>
            );

            // Then: Should show checking indicator
            expect(screen.getByLabelText(/checking/i)).toBeInTheDocument();
            expect(screen.getByText(/checking/i)).toBeInTheDocument();
        });

        it('should show connecting text when authenticating', () => {
            // When: Component renders
            render(
                <TestWrapper>
                    <GitHubServiceCard
                        isChecking={false}
                        isAuthenticating={true}
                        isAuthenticated={false}
                        onConnect={mockOnConnect}
                    />
                </TestWrapper>
            );

            // Then: Should show connecting text
            expect(screen.getByText(/connecting/i)).toBeInTheDocument();
        });
    });

    describe('Authenticated State', () => {
        it('should show user login when authenticated', () => {
            // When: Component renders with authenticated user
            render(
                <TestWrapper>
                    <GitHubServiceCard
                        isChecking={false}
                        isAuthenticating={false}
                        isAuthenticated={true}
                        user={{ login: 'testuser', email: null, name: null, avatarUrl: null }}
                        onConnect={mockOnConnect}
                        onChangeAccount={mockOnChangeAccount}
                    />
                </TestWrapper>
            );

            // Then: Should show user login and success indicator
            expect(screen.getByText('testuser')).toBeInTheDocument();
        });

        it('should show change account button when authenticated', () => {
            // When: Component renders
            render(
                <TestWrapper>
                    <GitHubServiceCard
                        isChecking={false}
                        isAuthenticating={false}
                        isAuthenticated={true}
                        user={{ login: 'testuser', email: null, name: null, avatarUrl: null }}
                        onConnect={mockOnConnect}
                        onChangeAccount={mockOnChangeAccount}
                    />
                </TestWrapper>
            );

            // Then: Should show change button
            const changeButton = screen.getByRole('button', { name: /change/i });
            expect(changeButton).toBeInTheDocument();
        });

        it('should call onChangeAccount when change button clicked', () => {
            render(
                <TestWrapper>
                    <GitHubServiceCard
                        isChecking={false}
                        isAuthenticating={false}
                        isAuthenticated={true}
                        user={{ login: 'testuser', email: null, name: null, avatarUrl: null }}
                        onConnect={mockOnConnect}
                        onChangeAccount={mockOnChangeAccount}
                    />
                </TestWrapper>
            );

            // When: User clicks change
            fireEvent.click(screen.getByRole('button', { name: /change/i }));

            // Then: onChangeAccount should be called
            expect(mockOnChangeAccount).toHaveBeenCalledTimes(1);
        });
    });

    describe('Connect Button', () => {
        it('should show connect button when not authenticated', () => {
            // When: Component renders
            render(
                <TestWrapper>
                    <GitHubServiceCard
                        isChecking={false}
                        isAuthenticating={false}
                        isAuthenticated={false}
                        onConnect={mockOnConnect}
                    />
                </TestWrapper>
            );

            // Then: Should show connect button
            const connectButton = screen.getByRole('button', { name: /connect github/i });
            expect(connectButton).toBeInTheDocument();
        });

        it('should call onConnect when connect button clicked', () => {
            render(
                <TestWrapper>
                    <GitHubServiceCard
                        isChecking={false}
                        isAuthenticating={false}
                        isAuthenticated={false}
                        onConnect={mockOnConnect}
                    />
                </TestWrapper>
            );

            // When: User clicks connect
            fireEvent.click(screen.getByRole('button', { name: /connect github/i }));

            // Then: onConnect should be called
            expect(mockOnConnect).toHaveBeenCalledTimes(1);
        });
    });

    describe('Error State', () => {
        it('should show error message when error provided', () => {
            // When: Component renders with error
            render(
                <TestWrapper>
                    <GitHubServiceCard
                        isChecking={false}
                        isAuthenticating={false}
                        isAuthenticated={false}
                        error="Authentication failed"
                        onConnect={mockOnConnect}
                    />
                </TestWrapper>
            );

            // Then: Should show error message and try again button
            expect(screen.getByText('Authentication failed')).toBeInTheDocument();
            expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument();
        });
    });

    describe('Authenticated Without User', () => {
        it('should still offer Connect when the user payload has not arrived', () => {
            // The flag and the payload arrive in separate messages, so
            // authenticated-with-no-user is a real intermediate state. Treating
            // it as connected renders a checkmark beside an EMPTY account name
            render(
                <TestWrapper>
                    <GitHubServiceCard
                        isChecking={false}
                        isAuthenticating={false}
                        isAuthenticated={true}
                        onConnect={mockOnConnect}
                        onChangeAccount={mockOnChangeAccount}
                    />
                </TestWrapper>
            );

            expect(screen.getByRole('button', { name: /connect github/i })).toBeInTheDocument();
            expect(screen.queryByRole('button', { name: /change/i })).not.toBeInTheDocument();
        });
    });

    describe('Card Display', () => {
        it('should render card with GitHub icon and title', () => {
            // When: Component renders
            const { container } = render(
                <TestWrapper>
                    <GitHubServiceCard
                        isChecking={false}
                        isAuthenticating={false}
                        isAuthenticated={false}
                        onConnect={mockOnConnect}
                    />
                </TestWrapper>
            );

            // Then: Should have card class and GitHub title
            expect(container.querySelector('.service-card')).toBeInTheDocument();
            expect(screen.getByText('GitHub')).toBeInTheDocument();
        });

        it('should render the GitHub mark inside the icon well', () => {
            // The icon is the only thing distinguishing this card from the
            const { container } = render(
                <TestWrapper>
                    <GitHubServiceCard
                        isChecking={false}
                        isAuthenticating={false}
                        isAuthenticated={false}
                        onConnect={mockOnConnect}
                    />
                </TestWrapper>
            );

            const mark = container.querySelector('.service-icon.github-icon svg path');
            expect(mark).toBeInTheDocument();
        });
    });
});
