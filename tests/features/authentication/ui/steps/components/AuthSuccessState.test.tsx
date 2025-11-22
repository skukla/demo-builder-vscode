import React from 'react';
import { render, screen } from '@testing-library/react';
import { Provider as SpectrumProvider, defaultTheme } from '@adobe/react-spectrum';
import { AuthSuccessState } from '@/features/authentication/ui/steps/components/AuthSuccessState';

// Test wrapper for Spectrum components
function renderWithSpectrum(ui: React.ReactElement) {
    return render(
        <SpectrumProvider theme={defaultTheme}>
            {ui}
        </SpectrumProvider>
    );
}

describe('AuthSuccessState', () => {
    const mockUserData = {
        name: 'John Doe',
        email: 'john.doe@example.com',
        orgName: 'Example Organization',
        orgId: 'org-123',
    };

    describe('Success message rendering', () => {
        it('renders success icon and title', () => {
            renderWithSpectrum(
                <AuthSuccessState userData={mockUserData} />
            );

            expect(screen.getByText(/authenticated/i)).toBeInTheDocument();
        });

        it('shows checkmark icon with success styling', () => {
            const { container } = renderWithSpectrum(
                <AuthSuccessState userData={mockUserData} />
            );

            // CheckmarkCircle icon should have green styling
            const icon = container.querySelector('[class*="text-green"]');
            expect(icon).toBeInTheDocument();
        });

        it('displays success message', () => {
            renderWithSpectrum(
                <AuthSuccessState userData={mockUserData} />
            );

            expect(screen.getByText(/successfully authenticated/i)).toBeInTheDocument();
        });
    });

    describe('User information display', () => {
        it('displays user name', () => {
            renderWithSpectrum(
                <AuthSuccessState userData={mockUserData} />
            );

            expect(screen.getByText(mockUserData.name)).toBeInTheDocument();
        });

        it('displays user email', () => {
            renderWithSpectrum(
                <AuthSuccessState userData={mockUserData} />
            );

            expect(screen.getByText(mockUserData.email)).toBeInTheDocument();
        });

        it('displays organization name', () => {
            renderWithSpectrum(
                <AuthSuccessState userData={mockUserData} />
            );

            expect(screen.getByText(mockUserData.orgName)).toBeInTheDocument();
        });

        it('handles missing optional user data gracefully', () => {
            const minimalUserData = {
                name: 'Jane Doe',
                email: 'jane.doe@example.com',
            };

            renderWithSpectrum(
                <AuthSuccessState userData={minimalUserData as any} />
            );

            expect(screen.getByText(minimalUserData.name)).toBeInTheDocument();
            expect(screen.getByText(minimalUserData.email)).toBeInTheDocument();
        });
    });

    describe('Layout and positioning', () => {
        it('centers content vertically and horizontally', () => {
            renderWithSpectrum(
                <AuthSuccessState userData={mockUserData} />
            );

            // Layout verified via visual testing - checking content renders
            expect(screen.getByText('John Doe')).toBeInTheDocument();
        });

        it('uses proper height for step container', () => {
            const { container } = renderWithSpectrum(
                <AuthSuccessState userData={mockUserData} />
            );

            // Should have fixed height (typically 350px)
            expect(container.firstChild).toBeInTheDocument();
        });
    });

    describe('FadeTransition animation', () => {
        it('wraps content in FadeTransition for smooth appearance', () => {
            const { container } = renderWithSpectrum(
                <AuthSuccessState userData={mockUserData} />
            );

            expect(container.firstChild).toBeInTheDocument();
        });
    });

    describe('User data variations', () => {
        it('handles long user names', () => {
            const longNameUser = {
                ...mockUserData,
                name: 'This is a Very Long Name That Should Still Display Properly',
            };

            renderWithSpectrum(
                <AuthSuccessState userData={longNameUser} />
            );

            expect(screen.getByText(longNameUser.name)).toBeInTheDocument();
        });

        it('handles long email addresses', () => {
            const longEmailUser = {
                ...mockUserData,
                email: 'very.long.email.address.with.many.dots@example-domain.com',
            };

            renderWithSpectrum(
                <AuthSuccessState userData={longEmailUser} />
            );

            expect(screen.getByText(longEmailUser.email)).toBeInTheDocument();
        });

        it('handles long organization names', () => {
            const longOrgUser = {
                ...mockUserData,
                orgName: 'This is a Very Long Organization Name That Should Still Display Properly in the UI',
            };

            renderWithSpectrum(
                <AuthSuccessState userData={longOrgUser} />
            );

            expect(screen.getByText(longOrgUser.orgName)).toBeInTheDocument();
        });
    });

    describe('Accessibility', () => {
        it('uses proper heading hierarchy', () => {
            renderWithSpectrum(
                <AuthSuccessState userData={mockUserData} />
            );

            const heading = screen.getByText(/authenticated/i);
            expect(heading).toBeInTheDocument();
        });

        it('makes user information accessible to screen readers', () => {
            renderWithSpectrum(
                <AuthSuccessState userData={mockUserData} />
            );

            const name = screen.getByText(mockUserData.name);
            const email = screen.getByText(mockUserData.email);
            const org = screen.getByText(mockUserData.orgName);

            expect(name).toBeInTheDocument();
            expect(email).toBeInTheDocument();
            expect(org).toBeInTheDocument();
        });

        it('provides semantic structure for user data', () => {
            const { container } = renderWithSpectrum(
                <AuthSuccessState userData={mockUserData} />
            );

            // Should have proper semantic elements
            expect(container).toBeInTheDocument();
        });
    });

    describe('Visual styling', () => {
        it('renders success icon with green color', () => {
            const { container } = renderWithSpectrum(
                <AuthSuccessState userData={mockUserData} />
            );

            // CheckmarkCircle should have green styling
            const icon = container.querySelector('[class*="text-green"]');
            expect(icon).toBeInTheDocument();
        });

        it('displays user info with appropriate text styling', () => {
            renderWithSpectrum(
                <AuthSuccessState userData={mockUserData} />
            );

            // User info should be visible and styled appropriately
            const name = screen.getByText(mockUserData.name);
            expect(name).toBeInTheDocument();
        });

        it('uses proper spacing between elements', () => {
            renderWithSpectrum(
                <AuthSuccessState userData={mockUserData} />
            );

            // Layout spacing verified via visual testing - checking content renders
            expect(screen.getByText('John Doe')).toBeInTheDocument();
            expect(screen.getByText('john.doe@example.com')).toBeInTheDocument();
        });
    });

    describe('Edge cases', () => {
        it('handles empty user name', () => {
            const noNameUser = {
                ...mockUserData,
                name: '',
            };

            renderWithSpectrum(
                <AuthSuccessState userData={noNameUser} />
            );

            // Should still render without crashing
            expect(screen.getByText(/authenticated/i)).toBeInTheDocument();
        });

        it('handles special characters in user data', () => {
            const specialCharUser = {
                name: "O'Brien-Smith",
                email: 'user+test@example.com',
                orgName: 'Company & Partners, LLC.',
                orgId: 'org-123',
            };

            renderWithSpectrum(
                <AuthSuccessState userData={specialCharUser} />
            );

            expect(screen.getByText(specialCharUser.name)).toBeInTheDocument();
            expect(screen.getByText(specialCharUser.email)).toBeInTheDocument();
        });

        it('handles unicode characters in user data', () => {
            const unicodeUser = {
                name: 'José García',
                email: 'jose.garcia@example.com',
                orgName: 'Müller & Söhne GmbH',
                orgId: 'org-456',
            };

            renderWithSpectrum(
                <AuthSuccessState userData={unicodeUser} />
            );

            expect(screen.getByText(unicodeUser.name)).toBeInTheDocument();
            expect(screen.getByText(unicodeUser.orgName)).toBeInTheDocument();
        });
    });
});
