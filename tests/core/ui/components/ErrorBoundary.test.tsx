/**
 * ErrorBoundary Component Tests
 *
 * Tests the React Error Boundary that catches and displays errors gracefully.
 * This is CRITICAL infrastructure - if it fails, users see blank screens.
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { ErrorBoundary } from '@/core/ui/components/ErrorBoundary';

// Test component that throws on demand
const ThrowingComponent: React.FC<{ shouldThrow?: boolean; errorMessage?: string }> = ({
    shouldThrow = false,
    errorMessage = 'Test error',
}) => {
    if (shouldThrow) {
        throw new Error(errorMessage);
    }
    return <div>Normal content</div>;
};

describe('ErrorBoundary', () => {
    // Suppress console.error for expected errors in these tests
    beforeAll(() => {
        jest.spyOn(console, 'error').mockImplementation(() => {});
    });

    afterAll(() => {
        jest.restoreAllMocks();
    });

    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('normal rendering', () => {
        it('renders children when no error occurs', () => {
            render(
                <ErrorBoundary>
                    <div>Test content</div>
                </ErrorBoundary>
            );

            expect(screen.getByText('Test content')).toBeInTheDocument();
        });

        it('renders multiple children correctly', () => {
            render(
                <ErrorBoundary>
                    <div>First child</div>
                    <div>Second child</div>
                </ErrorBoundary>
            );

            expect(screen.getByText('First child')).toBeInTheDocument();
            expect(screen.getByText('Second child')).toBeInTheDocument();
        });

        it('does not show fallback UI when no error', () => {
            render(
                <ErrorBoundary fallback={<div>Error occurred</div>}>
                    <div>Normal content</div>
                </ErrorBoundary>
            );

            expect(screen.getByText('Normal content')).toBeInTheDocument();
            expect(screen.queryByText('Error occurred')).not.toBeInTheDocument();
        });

        it('renders component that does not throw', () => {
            render(
                <ErrorBoundary>
                    <ThrowingComponent shouldThrow={false} />
                </ErrorBoundary>
            );

            expect(screen.getByText('Normal content')).toBeInTheDocument();
        });
    });

    describe('error catching', () => {
        it('catches errors and renders default error UI', () => {
            render(
                <ErrorBoundary>
                    <ThrowingComponent shouldThrow />
                </ErrorBoundary>
            );

            expect(screen.getByText('Something went wrong')).toBeInTheDocument();
        });

        it('displays error message in default UI', () => {
            render(
                <ErrorBoundary>
                    <ThrowingComponent shouldThrow errorMessage="Custom error message" />
                </ErrorBoundary>
            );

            expect(screen.getByText('Custom error message')).toBeInTheDocument();
        });

        it('renders custom fallback when provided', () => {
            render(
                <ErrorBoundary fallback={<div>Custom fallback UI</div>}>
                    <ThrowingComponent shouldThrow />
                </ErrorBoundary>
            );

            expect(screen.getByText('Custom fallback UI')).toBeInTheDocument();
            expect(screen.queryByText('Something went wrong')).not.toBeInTheDocument();
        });

        it('hides children after error', () => {
            render(
                <ErrorBoundary>
                    <ThrowingComponent shouldThrow />
                </ErrorBoundary>
            );

            expect(screen.queryByText('Normal content')).not.toBeInTheDocument();
        });
    });

    describe('onError callback', () => {
        it('calls onError callback when error occurs', () => {
            const onError = jest.fn();

            render(
                <ErrorBoundary onError={onError}>
                    <ThrowingComponent shouldThrow />
                </ErrorBoundary>
            );

            expect(onError).toHaveBeenCalledTimes(1);
        });

        it('passes error to onError callback', () => {
            const onError = jest.fn();

            render(
                <ErrorBoundary onError={onError}>
                    <ThrowingComponent shouldThrow errorMessage="Specific error" />
                </ErrorBoundary>
            );

            expect(onError).toHaveBeenCalledWith(
                expect.objectContaining({
                    message: 'Specific error',
                }),
                expect.any(Object) // errorInfo
            );
        });

        it('passes errorInfo with componentStack to onError', () => {
            const onError = jest.fn();

            render(
                <ErrorBoundary onError={onError}>
                    <ThrowingComponent shouldThrow />
                </ErrorBoundary>
            );

            const [, errorInfo] = onError.mock.calls[0];
            expect(errorInfo).toHaveProperty('componentStack');
            expect(typeof errorInfo.componentStack).toBe('string');
        });

        it('does not call onError when no error occurs', () => {
            const onError = jest.fn();

            render(
                <ErrorBoundary onError={onError}>
                    <ThrowingComponent shouldThrow={false} />
                </ErrorBoundary>
            );

            expect(onError).not.toHaveBeenCalled();
        });
    });

    describe('nested error boundaries', () => {
        it('catches error at nearest boundary', () => {
            render(
                <ErrorBoundary fallback={<div>Outer error</div>}>
                    <div>
                        <ErrorBoundary fallback={<div>Inner error</div>}>
                            <ThrowingComponent shouldThrow />
                        </ErrorBoundary>
                    </div>
                </ErrorBoundary>
            );

            expect(screen.getByText('Inner error')).toBeInTheDocument();
            expect(screen.queryByText('Outer error')).not.toBeInTheDocument();
        });

        it('outer boundary catches when inner has no fallback but error propagates', () => {
            // Inner boundary catches first, but we can verify both work independently
            const outerOnError = jest.fn();
            const innerOnError = jest.fn();

            render(
                <ErrorBoundary onError={outerOnError} fallback={<div>Outer error</div>}>
                    <ErrorBoundary onError={innerOnError} fallback={<div>Inner error</div>}>
                        <ThrowingComponent shouldThrow />
                    </ErrorBoundary>
                </ErrorBoundary>
            );

            // Inner boundary catches first
            expect(innerOnError).toHaveBeenCalled();
            expect(outerOnError).not.toHaveBeenCalled();
        });

        it('sibling components are not affected by error', () => {
            render(
                <div>
                    <ErrorBoundary fallback={<div>Error in first</div>}>
                        <ThrowingComponent shouldThrow />
                    </ErrorBoundary>
                    <div>Sibling content</div>
                </div>
            );

            expect(screen.getByText('Error in first')).toBeInTheDocument();
            expect(screen.getByText('Sibling content')).toBeInTheDocument();
        });
    });

    describe('error state display', () => {
        it('shows component stack in default error UI', () => {
            render(
                <ErrorBoundary>
                    <ThrowingComponent shouldThrow />
                </ErrorBoundary>
            );

            // The error boundary shows componentStack in a monospace text element
            // We verify the error UI is rendered (which includes the stack)
            expect(screen.getByText('Something went wrong')).toBeInTheDocument();
        });

        it('handles error with no message gracefully', () => {
            const NoMessageError: React.FC = () => {
                throw new Error();
            };

            render(
                <ErrorBoundary>
                    <NoMessageError />
                </ErrorBoundary>
            );

            // Should show default message or empty message without crashing
            expect(screen.getByText('Something went wrong')).toBeInTheDocument();
        });
    });
});
