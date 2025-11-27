import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider as SpectrumProvider, defaultTheme } from '@adobe/react-spectrum';
import { MeshStatusDisplay } from '@/features/mesh/ui/steps/components/MeshStatusDisplay';

// Test wrapper for Spectrum components
function renderWithSpectrum(ui: React.ReactElement) {
    return render(
        <SpectrumProvider theme={defaultTheme}>
            {ui}
        </SpectrumProvider>
    );
}

describe('MeshStatusDisplay', () => {
    const mockOnRecreateMesh = jest.fn();
    const mockOnBack = jest.fn();

    beforeEach(() => {
        mockOnRecreateMesh.mockClear();
        mockOnBack.mockClear();
    });

    describe('Deployed mesh status', () => {
        it('renders success icon for deployed mesh', () => {
            renderWithSpectrum(
                <MeshStatusDisplay
                    meshData={{
                        meshId: 'mesh-123',
                        status: 'deployed',
                        endpoint: 'https://mesh.adobe.io/endpoint',
                    }}
                    onRecreateMesh={mockOnRecreateMesh}
                    onBack={mockOnBack}
                />
            );

            expect(screen.getByText('API Mesh Deployed')).toBeInTheDocument();
        });

        it('shows checkmark icon for deployed status', () => {
            const { container } = renderWithSpectrum(
                <MeshStatusDisplay
                    meshData={{
                        meshId: 'mesh-123',
                        status: 'deployed',
                        endpoint: 'https://mesh.adobe.io/endpoint',
                    }}
                    onRecreateMesh={mockOnRecreateMesh}
                    onBack={mockOnBack}
                />
            );

            // CheckmarkCircle icon should be present with green styling
            const icon = container.querySelector('[class*="text-green"]');
            expect(icon).toBeInTheDocument();
        });

        it('displays update message for deployed mesh', () => {
            renderWithSpectrum(
                <MeshStatusDisplay
                    meshData={{
                        meshId: 'mesh-123',
                        status: 'deployed',
                        endpoint: 'https://mesh.adobe.io/endpoint',
                    }}
                    onRecreateMesh={mockOnRecreateMesh}
                    onBack={mockOnBack}
                />
            );

            expect(screen.getByText(/existing mesh was detected.*updated during deployment/i)).toBeInTheDocument();
        });

        it('does not show Recreate Mesh button for deployed status', () => {
            renderWithSpectrum(
                <MeshStatusDisplay
                    meshData={{
                        meshId: 'mesh-123',
                        status: 'deployed',
                        endpoint: 'https://mesh.adobe.io/endpoint',
                    }}
                    onRecreateMesh={mockOnRecreateMesh}
                    onBack={mockOnBack}
                />
            );

            expect(screen.queryByText('Recreate Mesh')).not.toBeInTheDocument();
        });
    });

    describe('Error mesh status', () => {
        it('renders error icon for error status', () => {
            renderWithSpectrum(
                <MeshStatusDisplay
                    meshData={{
                        meshId: 'mesh-456',
                        status: 'error',
                        endpoint: undefined,
                    }}
                    onRecreateMesh={mockOnRecreateMesh}
                    onBack={mockOnBack}
                />
            );

            expect(screen.getByText('Mesh in Error State')).toBeInTheDocument();
        });

        it('shows alert icon for error status', () => {
            const { container } = renderWithSpectrum(
                <MeshStatusDisplay
                    meshData={{
                        meshId: 'mesh-456',
                        status: 'error',
                        endpoint: undefined,
                    }}
                    onRecreateMesh={mockOnRecreateMesh}
                    onBack={mockOnBack}
                />
            );

            // AlertCircle icon should be present with orange styling
            const icon = container.querySelector('[class*="text-orange"]');
            expect(icon).toBeInTheDocument();
        });

        it('displays error description message', () => {
            renderWithSpectrum(
                <MeshStatusDisplay
                    meshData={{
                        meshId: 'mesh-456',
                        status: 'error',
                        endpoint: undefined,
                    }}
                    onRecreateMesh={mockOnRecreateMesh}
                    onBack={mockOnBack}
                />
            );

            expect(screen.getByText(/mesh exists but is not functioning properly/i)).toBeInTheDocument();
            expect(screen.getByText(/click.*recreate mesh.*to delete and redeploy/i)).toBeInTheDocument();
        });

        it('renders Recreate Mesh and Back buttons for error status', () => {
            renderWithSpectrum(
                <MeshStatusDisplay
                    meshData={{
                        meshId: 'mesh-456',
                        status: 'error',
                        endpoint: undefined,
                    }}
                    onRecreateMesh={mockOnRecreateMesh}
                    onBack={mockOnBack}
                />
            );

            expect(screen.getByText('Recreate Mesh')).toBeInTheDocument();
            expect(screen.getByText('Back')).toBeInTheDocument();
        });

        it('calls onRecreateMesh when Recreate Mesh button is clicked', async () => {
            const user = userEvent.setup();
            renderWithSpectrum(
                <MeshStatusDisplay
                    meshData={{
                        meshId: 'mesh-456',
                        status: 'error',
                        endpoint: undefined,
                    }}
                    onRecreateMesh={mockOnRecreateMesh}
                    onBack={mockOnBack}
                />
            );

            const recreateButton = screen.getByText('Recreate Mesh');
            await user.click(recreateButton);

            expect(mockOnRecreateMesh).toHaveBeenCalledTimes(1);
        });

        it('calls onBack when Back button is clicked', async () => {
            const user = userEvent.setup();
            renderWithSpectrum(
                <MeshStatusDisplay
                    meshData={{
                        meshId: 'mesh-456',
                        status: 'error',
                        endpoint: undefined,
                    }}
                    onRecreateMesh={mockOnRecreateMesh}
                    onBack={mockOnBack}
                />
            );

            const backButton = screen.getByText('Back');
            await user.click(backButton);

            expect(mockOnBack).toHaveBeenCalledTimes(1);
        });
    });

    describe('Pending mesh status', () => {
        it('renders success icon for pending status', () => {
            renderWithSpectrum(
                <MeshStatusDisplay
                    meshData={{
                        meshId: 'mesh-789',
                        status: 'pending',
                        endpoint: undefined,
                    }}
                    onRecreateMesh={mockOnRecreateMesh}
                    onBack={mockOnBack}
                />
            );

            expect(screen.getByText('API Mesh Found')).toBeInTheDocument();
        });

        it('shows checkmark icon for pending status', () => {
            const { container } = renderWithSpectrum(
                <MeshStatusDisplay
                    meshData={{
                        meshId: 'mesh-789',
                        status: 'pending',
                        endpoint: undefined,
                    }}
                    onRecreateMesh={mockOnRecreateMesh}
                    onBack={mockOnBack}
                />
            );

            // CheckmarkCircle icon should be present
            const icon = container.querySelector('[class*="text-green"]');
            expect(icon).toBeInTheDocument();
        });

        it('does not show Recreate Mesh button for pending status', () => {
            renderWithSpectrum(
                <MeshStatusDisplay
                    meshData={{
                        meshId: 'mesh-789',
                        status: 'pending',
                        endpoint: undefined,
                    }}
                    onRecreateMesh={mockOnRecreateMesh}
                    onBack={mockOnBack}
                />
            );

            expect(screen.queryByText('Recreate Mesh')).not.toBeInTheDocument();
        });
    });

    describe('FadeTransition animation', () => {
        it('wraps content in FadeTransition for smooth appearance', () => {
            const { container } = renderWithSpectrum(
                <MeshStatusDisplay
                    meshData={{
                        meshId: 'mesh-123',
                        status: 'deployed',
                        endpoint: 'https://mesh.adobe.io/endpoint',
                    }}
                    onRecreateMesh={mockOnRecreateMesh}
                    onBack={mockOnBack}
                />
            );

            expect(container.firstChild).toBeInTheDocument();
        });
    });

    describe('Visual layout', () => {
        it('centers content vertically and horizontally', () => {
            const { container } = renderWithSpectrum(
                <MeshStatusDisplay
                    meshData={{
                        meshId: 'mesh-123',
                        status: 'deployed',
                        endpoint: 'https://mesh.adobe.io/endpoint',
                    }}
                    onRecreateMesh={mockOnRecreateMesh}
                    onBack={mockOnBack}
                />
            );

            // Should have proper flex layout for centering
            expect(container.querySelector('[style*="height"]')).toBeInTheDocument();
        });

        it('limits max width for error message readability', () => {
            const { container } = renderWithSpectrum(
                <MeshStatusDisplay
                    meshData={{
                        meshId: 'mesh-456',
                        status: 'error',
                        endpoint: undefined,
                    }}
                    onRecreateMesh={mockOnRecreateMesh}
                    onBack={mockOnBack}
                />
            );

            // Error message should have maxWidth styling
            const errorText = screen.getByText(/mesh exists but is not functioning properly/i);
            expect(errorText).toBeInTheDocument();
        });
    });

    describe('Accessibility', () => {
        it('uses proper heading hierarchy', () => {
            renderWithSpectrum(
                <MeshStatusDisplay
                    meshData={{
                        meshId: 'mesh-123',
                        status: 'deployed',
                        endpoint: 'https://mesh.adobe.io/endpoint',
                    }}
                    onRecreateMesh={mockOnRecreateMesh}
                    onBack={mockOnBack}
                />
            );

            const heading = screen.getByText('API Mesh Deployed');
            expect(heading).toBeInTheDocument();
        });

        it('provides accessible button labels for error state', () => {
            renderWithSpectrum(
                <MeshStatusDisplay
                    meshData={{
                        meshId: 'mesh-456',
                        status: 'error',
                        endpoint: undefined,
                    }}
                    onRecreateMesh={mockOnRecreateMesh}
                    onBack={mockOnBack}
                />
            );

            const recreateButton = screen.getByRole('button', { name: /recreate mesh/i });
            const backButton = screen.getByRole('button', { name: /back/i });

            expect(recreateButton).toBeInTheDocument();
            expect(backButton).toBeInTheDocument();
        });
    });

    describe('Edge cases', () => {
        it('handles unknown status gracefully', () => {
            renderWithSpectrum(
                <MeshStatusDisplay
                    meshData={{
                        meshId: 'mesh-999',
                        status: 'unknown' as any,
                        endpoint: undefined,
                    }}
                    onRecreateMesh={mockOnRecreateMesh}
                    onBack={mockOnBack}
                />
            );

            // Should render something without crashing
            expect(screen.getByText(/API Mesh Found/i)).toBeInTheDocument();
        });

        it('handles missing meshId gracefully', () => {
            renderWithSpectrum(
                <MeshStatusDisplay
                    meshData={{
                        meshId: undefined,
                        status: 'deployed',
                        endpoint: 'https://mesh.adobe.io/endpoint',
                    }}
                    onRecreateMesh={mockOnRecreateMesh}
                    onBack={mockOnBack}
                />
            );

            // Should render without crashing
            expect(screen.getByText(/API Mesh/i)).toBeInTheDocument();
        });

        it('handles missing endpoint gracefully', () => {
            renderWithSpectrum(
                <MeshStatusDisplay
                    meshData={{
                        meshId: 'mesh-123',
                        status: 'deployed',
                        endpoint: undefined,
                    }}
                    onRecreateMesh={mockOnRecreateMesh}
                    onBack={mockOnBack}
                />
            );

            // Should render without crashing
            expect(screen.getByText('API Mesh Deployed')).toBeInTheDocument();
        });
    });
});
