/**
 * Unit Tests: VerifiedField
 *
 * Tests for the verified field presentational component.
 * Used for fields that require backend verification (e.g., DA.live org, GitHub repo).
 *
 * Coverage:
 * - Verifying state with spinner
 * - Verified state with checkmark
 * - Error state with error message
 * - Basic input behavior
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

describe('VerifiedField', () => {
    let mockOnChange: jest.Mock;
    let mockOnBlur: jest.Mock;

    beforeEach(() => {
        jest.clearAllMocks();
        mockOnChange = jest.fn();
        mockOnBlur = jest.fn();
    });

    describe('Basic Input', () => {
        it('should render with label and placeholder', async () => {
            // Given: Basic props
            const { VerifiedField } = await import(
                '@/features/eds/ui/components/VerifiedField'
            );

            // When: Component renders
            render(
                <TestWrapper>
                    <VerifiedField
                        label="Organization"
                        value=""
                        onChange={mockOnChange}
                        onBlur={mockOnBlur}
                        isVerifying={false}
                        isVerified={false}
                        placeholder="your-org"
                    />
                </TestWrapper>
            );

            // Then: Should show label and placeholder
            expect(screen.getByLabelText(/organization/i)).toBeInTheDocument();
            expect(screen.getByPlaceholderText('your-org')).toBeInTheDocument();
        });

        it('should show description when provided', async () => {
            // Given: Field with description
            const { VerifiedField } = await import(
                '@/features/eds/ui/components/VerifiedField'
            );

            // When: Component renders
            render(
                <TestWrapper>
                    <VerifiedField
                        label="Organization"
                        value=""
                        onChange={mockOnChange}
                        onBlur={mockOnBlur}
                        isVerifying={false}
                        isVerified={false}
                        description="Your DA.live organization name"
                    />
                </TestWrapper>
            );

            // Then: Should show description
            expect(screen.getByText('Your DA.live organization name')).toBeInTheDocument();
        });

        it('should call onChange when value changes', async () => {
            // Given: Basic field
            const { VerifiedField } = await import(
                '@/features/eds/ui/components/VerifiedField'
            );

            render(
                <TestWrapper>
                    <VerifiedField
                        label="Organization"
                        value=""
                        onChange={mockOnChange}
                        onBlur={mockOnBlur}
                        isVerifying={false}
                        isVerified={false}
                    />
                </TestWrapper>
            );

            // When: User types in input
            const input = screen.getByLabelText(/organization/i);
            await userEvent.type(input, 'my-org');

            // Then: onChange should be called
            expect(mockOnChange).toHaveBeenCalled();
        });

        it('should call onBlur when input loses focus', async () => {
            // Given: Basic field
            const { VerifiedField } = await import(
                '@/features/eds/ui/components/VerifiedField'
            );

            render(
                <TestWrapper>
                    <VerifiedField
                        label="Organization"
                        value="test-org"
                        onChange={mockOnChange}
                        onBlur={mockOnBlur}
                        isVerifying={false}
                        isVerified={false}
                    />
                </TestWrapper>
            );

            // When: Input loses focus
            const input = screen.getByLabelText(/organization/i);
            fireEvent.blur(input);

            // Then: onBlur should be called
            expect(mockOnBlur).toHaveBeenCalledTimes(1);
        });
    });

    describe('Verifying State', () => {
        it('should show progress indicator when verifying', async () => {
            // Given: isVerifying is true
            const { VerifiedField } = await import(
                '@/features/eds/ui/components/VerifiedField'
            );

            // When: Component renders
            render(
                <TestWrapper>
                    <VerifiedField
                        label="Organization"
                        value="my-org"
                        onChange={mockOnChange}
                        onBlur={mockOnBlur}
                        isVerifying={true}
                        isVerified={false}
                    />
                </TestWrapper>
            );

            // Then: Should show progress indicator
            expect(screen.getByLabelText(/verifying/i)).toBeInTheDocument();
        });

        it('should not show checkmark when verifying', async () => {
            // Given: isVerifying is true
            const { VerifiedField } = await import(
                '@/features/eds/ui/components/VerifiedField'
            );

            // When: Component renders
            render(
                <TestWrapper>
                    <VerifiedField
                        label="Organization"
                        value="my-org"
                        onChange={mockOnChange}
                        onBlur={mockOnBlur}
                        isVerifying={true}
                        isVerified={false}
                    />
                </TestWrapper>
            );

            // Then: Should not show verified text
            expect(screen.queryByText(/verified/i)).not.toBeInTheDocument();
        });
    });

    describe('Verified State', () => {
        it('should show checkmark and verified text when verified', async () => {
            // Given: isVerified is true
            const { VerifiedField } = await import(
                '@/features/eds/ui/components/VerifiedField'
            );

            // When: Component renders
            render(
                <TestWrapper>
                    <VerifiedField
                        label="Organization"
                        value="my-org"
                        onChange={mockOnChange}
                        onBlur={mockOnBlur}
                        isVerifying={false}
                        isVerified={true}
                    />
                </TestWrapper>
            );

            // Then: Should show verified indicator
            expect(screen.getByText(/verified/i)).toBeInTheDocument();
        });

        it('should not show spinner when verified', async () => {
            // Given: isVerified is true
            const { VerifiedField } = await import(
                '@/features/eds/ui/components/VerifiedField'
            );

            // When: Component renders
            render(
                <TestWrapper>
                    <VerifiedField
                        label="Organization"
                        value="my-org"
                        onChange={mockOnChange}
                        onBlur={mockOnBlur}
                        isVerifying={false}
                        isVerified={true}
                    />
                </TestWrapper>
            );

            // Then: Should not show verifying spinner
            expect(screen.queryByLabelText(/verifying/i)).not.toBeInTheDocument();
        });
    });

    describe('Error State', () => {
        it('should show error message when error provided', async () => {
            // Given: Error state
            const { VerifiedField } = await import(
                '@/features/eds/ui/components/VerifiedField'
            );

            // When: Component renders
            render(
                <TestWrapper>
                    <VerifiedField
                        label="Organization"
                        value="invalid-org"
                        onChange={mockOnChange}
                        onBlur={mockOnBlur}
                        isVerifying={false}
                        isVerified={false}
                        error="Organization not found"
                    />
                </TestWrapper>
            );

            // Then: Should show error message
            expect(screen.getByText('Organization not found')).toBeInTheDocument();
        });

        it('should show error alert icon when error', async () => {
            // Given: Error state
            const { VerifiedField } = await import(
                '@/features/eds/ui/components/VerifiedField'
            );

            // When: Component renders
            const { container } = render(
                <TestWrapper>
                    <VerifiedField
                        label="Organization"
                        value="invalid-org"
                        onChange={mockOnChange}
                        onBlur={mockOnBlur}
                        isVerifying={false}
                        isVerified={false}
                        error="Organization not found"
                    />
                </TestWrapper>
            );

            // Then: Should show error message with alert styling
            expect(screen.getByText('Organization not found')).toBeInTheDocument();
            // The error alert icon should be present (via SVG)
            expect(container.querySelector('svg')).toBeInTheDocument();
        });
    });

    describe('Combined States', () => {
        it('should prioritize error over verified state', async () => {
            // Given: Both error and verified (shouldn't happen but testing priority)
            const { VerifiedField } = await import(
                '@/features/eds/ui/components/VerifiedField'
            );

            // When: Component renders with both states
            render(
                <TestWrapper>
                    <VerifiedField
                        label="Organization"
                        value="my-org"
                        onChange={mockOnChange}
                        onBlur={mockOnBlur}
                        isVerifying={false}
                        isVerified={true}
                        error="Validation error"
                    />
                </TestWrapper>
            );

            // Then: Should show error, not verified
            expect(screen.getByText('Validation error')).toBeInTheDocument();
        });
    });
});
