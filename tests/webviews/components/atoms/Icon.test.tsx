import React from 'react';
import { renderWithProviders, screen, createMockIcon } from "../../../helpers/react-test-utils';
import { Icon } from '@/webview-ui/shared/components/ui/Icon';

// Create a mock Spectrum icon
const MockAlertIcon = createMockIcon('Alert');

describe('Icon', () => {
    describe('Rendering', () => {
        it('renders icon component', () => {
            renderWithProviders(<Icon icon={MockAlertIcon} />);
            expect(screen.getByTestId('icon-Alert')).toBeInTheDocument();
        });

        it('renders with custom className', () => {
            renderWithProviders(<Icon icon={MockAlertIcon} className="custom-class" />);
            const icon = screen.getByTestId('icon-Alert');
            expect(icon).toHaveClass('custom-class');
        });
    });

    describe('Size', () => {
        it('renders with default M size', () => {
            renderWithProviders(<Icon icon={MockAlertIcon} />);
            expect(screen.getByTestId('icon-Alert')).toBeInTheDocument();
        });

        it('renders with XS size', () => {
            renderWithProviders(<Icon icon={MockAlertIcon} size="XS" />);
            expect(screen.getByTestId('icon-Alert')).toBeInTheDocument();
        });

        it('renders with S size', () => {
            renderWithProviders(<Icon icon={MockAlertIcon} size="S" />);
            expect(screen.getByTestId('icon-Alert')).toBeInTheDocument();
        });

        it('renders with L size', () => {
            renderWithProviders(<Icon icon={MockAlertIcon} size="L" />);
            expect(screen.getByTestId('icon-Alert')).toBeInTheDocument();
        });

        it('renders with XL size', () => {
            renderWithProviders(<Icon icon={MockAlertIcon} size="XL" />);
            expect(screen.getByTestId('icon-Alert')).toBeInTheDocument();
        });

        it('renders with XXL size', () => {
            renderWithProviders(<Icon icon={MockAlertIcon} size="XXL" />);
            expect(screen.getByTestId('icon-Alert')).toBeInTheDocument();
        });
    });

    describe('Color', () => {
        it('renders without custom color by default', () => {
            renderWithProviders(<Icon icon={MockAlertIcon} />);
            const icon = screen.getByTestId('icon-Alert');
            expect(icon).not.toHaveStyle({ color: expect.any(String) });
        });

        it('applies custom color when provided', () => {
            renderWithProviders(<Icon icon={MockAlertIcon} color="#ff0000" />);
            const icon = screen.getByTestId('icon-Alert');
            expect(icon).toHaveStyle({ color: '#ff0000' });
        });

        it('applies multiple colors', () => {
            const { rerender } = renderWithProviders(<Icon icon={MockAlertIcon} color="#10b981" />);
            expect(screen.getByTestId('icon-Alert')).toHaveStyle({ color: '#10b981' });

            rerender(<Icon icon={MockAlertIcon} color="#ef4444" />);
            expect(screen.getByTestId('icon-Alert')).toHaveStyle({ color: '#ef4444' });
        });
    });

    describe('Accessibility', () => {
        it('renders without aria-label by default', () => {
            renderWithProviders(<Icon icon={MockAlertIcon} />);
            const icon = screen.getByTestId('icon-Alert');
            expect(icon).not.toHaveAttribute('aria-label');
        });

        it('applies aria-label when provided', () => {
            renderWithProviders(<Icon icon={MockAlertIcon} aria-label="Alert icon" />);
            const icon = screen.getByLabelText('Alert icon');
            expect(icon).toBeInTheDocument();
        });
    });

    describe('Props Forwarding', () => {
        it('forwards all props to icon component', () => {
            renderWithProviders(
                <Icon
                    icon={MockAlertIcon}
                    size="L"
                    color="#3b82f6"
                    className="test-class"
                    aria-label="Test icon"
                />
            );
            const icon = screen.getByLabelText('Test icon');
            expect(icon).toBeInTheDocument();
            expect(icon).toHaveClass('test-class');
            expect(icon).toHaveStyle({ color: '#3b82f6' });
        });
    });
});
