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
import '@testing-library/jest-dom';

// Simple test wrapper (no Provider needed - React Aria components work standalone)
const TestWrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <>{children}</>
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
        it('should show progress indicator when checking', async () => {
            // Given: isChecking is true
            const { GitHubServiceCard } = await import(
                '@/features/eds/ui/components/GitHubServiceCard'
            );

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

        it('should show connecting text when authenticating', async () => {
            // Given: isAuthenticating is true
            const { GitHubServiceCard } = await import(
                '@/features/eds/ui/components/GitHubServiceCard'
            );

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
        it('should show user login when authenticated', async () => {
            // Given: User is authenticated
            const { GitHubServiceCard } = await import(
                '@/features/eds/ui/components/GitHubServiceCard'
            );

            // When: Component renders with authenticated user
            render(
                <TestWrapper>
                    <GitHubServiceCard
                        isChecking={false}
                        isAuthenticating={false}
                        isAuthenticated={true}
                        user={{ login: 'testuser' }}
                        onConnect={mockOnConnect}
                        onChangeAccount={mockOnChangeAccount}
                    />
                </TestWrapper>
            );

            // Then: Should show user login and success indicator
            expect(screen.getByText('testuser')).toBeInTheDocument();
        });

        it('should show change account button when authenticated', async () => {
            // Given: User is authenticated
            const { GitHubServiceCard } = await import(
                '@/features/eds/ui/components/GitHubServiceCard'
            );

            // When: Component renders
            render(
                <TestWrapper>
                    <GitHubServiceCard
                        isChecking={false}
                        isAuthenticating={false}
                        isAuthenticated={true}
                        user={{ login: 'testuser' }}
                        onConnect={mockOnConnect}
                        onChangeAccount={mockOnChangeAccount}
                    />
                </TestWrapper>
            );

            // Then: Should show change button
            const changeButton = screen.getByRole('button', { name: /change/i });
            expect(changeButton).toBeInTheDocument();
        });

        it('should call onChangeAccount when change button clicked', async () => {
            // Given: User is authenticated
            const { GitHubServiceCard } = await import(
                '@/features/eds/ui/components/GitHubServiceCard'
            );

            render(
                <TestWrapper>
                    <GitHubServiceCard
                        isChecking={false}
                        isAuthenticating={false}
                        isAuthenticated={true}
                        user={{ login: 'testuser' }}
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
        it('should show connect button when not authenticated', async () => {
            // Given: User is not authenticated
            const { GitHubServiceCard } = await import(
                '@/features/eds/ui/components/GitHubServiceCard'
            );

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

        it('should call onConnect when connect button clicked', async () => {
            // Given: User is not authenticated
            const { GitHubServiceCard } = await import(
                '@/features/eds/ui/components/GitHubServiceCard'
            );

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
        it('should show error message when error provided', async () => {
            // Given: Error state
            const { GitHubServiceCard } = await import(
                '@/features/eds/ui/components/GitHubServiceCard'
            );

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

    describe('Card Display', () => {
        it('should render card with GitHub icon and title', async () => {
            // Given: Service card component
            const { GitHubServiceCard } = await import(
                '@/features/eds/ui/components/GitHubServiceCard'
            );

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

            // Then: Should have card with data-connected attribute and GitHub title
            // Note: CSS Modules generate unique class names, so we query by data attribute instead
            expect(container.querySelector('[data-connected]')).toBeInTheDocument();
            expect(screen.getByText('GitHub')).toBeInTheDocument();
        });
    });
});
