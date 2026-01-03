/**
 * Tests for ErrorCode integration in MeshErrorDialog component
 *
 * Verifies that the component accepts and handles error codes.
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import { ErrorCode } from '@/types/errorCodes';
import { MeshErrorDialog } from '@/features/mesh/ui/steps/components/MeshErrorDialog';

// Mock FadeTransition to avoid animation issues
jest.mock('@/core/ui/components/ui/FadeTransition', () => ({
    FadeTransition: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

// Mock Modal
jest.mock('@/core/ui/components/ui/Modal', () => ({
    Modal: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

// Mock NumberedInstructions
jest.mock('@/core/ui/components/ui/NumberedInstructions', () => ({
    NumberedInstructions: () => <div>Instructions</div>,
}));

function renderWithProvider(component: React.ReactElement) {
    return render(
        <>
            {component}
        </>
    );
}

describe('MeshErrorDialog with error codes', () => {
    const defaultProps = {
        error: 'Test error message',
        onRetry: jest.fn(),
        onBack: jest.fn(),
        onOpenConsole: jest.fn(),
    };

    it('accepts code prop without crashing', () => {
        renderWithProvider(
            <MeshErrorDialog
                {...defaultProps}
                code={ErrorCode.TIMEOUT}
            />
        );
        expect(screen.getByText(/API Mesh API Not Enabled/i)).toBeInTheDocument();
    });

    it('accepts MESH_DEPLOY_FAILED error code', () => {
        renderWithProvider(
            <MeshErrorDialog
                {...defaultProps}
                error="Deployment failed"
                code={ErrorCode.MESH_DEPLOY_FAILED}
            />
        );
        expect(screen.getByText(/Deployment failed/i)).toBeInTheDocument();
    });

    it('accepts MESH_NOT_FOUND error code', () => {
        renderWithProvider(
            <MeshErrorDialog
                {...defaultProps}
                error="Mesh not found"
                code={ErrorCode.MESH_NOT_FOUND}
            />
        );
        expect(screen.getByText(/Mesh not found/i)).toBeInTheDocument();
    });

    it('accepts NETWORK error code', () => {
        renderWithProvider(
            <MeshErrorDialog
                {...defaultProps}
                error="Network error"
                code={ErrorCode.NETWORK}
            />
        );
        expect(screen.getByText(/Network error/i)).toBeInTheDocument();
    });

    it('works without code prop (backward compatibility)', () => {
        renderWithProvider(
            <MeshErrorDialog
                {...defaultProps}
                error="Some error"
            />
        );
        expect(screen.getByText(/Some error/i)).toBeInTheDocument();
    });
});
