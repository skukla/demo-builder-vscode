/**
 * Tests for ErrorCode integration in AuthErrorState component
 *
 * Verifies that the component accepts and handles error codes.
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import { ErrorCode } from '@/types/errorCodes';
import { AuthErrorState } from '@/features/authentication/ui/steps/components/AuthErrorState';

// Mock FadeTransition to avoid animation issues
jest.mock('@/core/ui/components/ui/FadeTransition', () => ({
    FadeTransition: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

function renderWithProvider(component: React.ReactElement) {
    return render(
        <>
            {component}
        </>
    );
}

describe('AuthErrorState with error codes', () => {
    const defaultProps = {
        error: 'Test error message',
        onRetry: jest.fn(),
        onBack: jest.fn(),
    };

    it('accepts code prop without crashing', () => {
        renderWithProvider(
            <AuthErrorState
                {...defaultProps}
                code={ErrorCode.TIMEOUT}
            />
        );
        expect(screen.getByText(/Authentication Failed/i)).toBeInTheDocument();
    });

    it('accepts NETWORK error code', () => {
        renderWithProvider(
            <AuthErrorState
                {...defaultProps}
                error="Network connection failed"
                code={ErrorCode.NETWORK}
            />
        );
        expect(screen.getByText(/Network connection failed/i)).toBeInTheDocument();
    });

    it('accepts AUTH_NO_APP_BUILDER error code', () => {
        renderWithProvider(
            <AuthErrorState
                {...defaultProps}
                error="No App Builder access"
                code={ErrorCode.AUTH_NO_APP_BUILDER}
            />
        );
        expect(screen.getByText(/No App Builder access/i)).toBeInTheDocument();
    });

    it('works without code prop (backward compatibility)', () => {
        renderWithProvider(
            <AuthErrorState
                {...defaultProps}
                error="Some error"
            />
        );
        expect(screen.getByText(/Some error/i)).toBeInTheDocument();
    });
});
