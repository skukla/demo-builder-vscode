import React from 'react';
import { renderWithProviders, screen } from "../../../../helpers/react-test-utils";
import { Spinner } from '@/webview-ui/shared/components/ui/Spinner';

describe('Spinner', () => {
    describe('Rendering', () => {
        it('renders spinner component', () => {
            renderWithProviders(<Spinner />);
            // ProgressCircle from Spectrum renders with progressbar role
            expect(screen.getByRole('progressbar')).toBeInTheDocument();
        });

        it('renders with custom className', () => {
            const { container } = renderWithProviders(<Spinner className="custom-spinner" />);
            expect(container.querySelector('.custom-spinner')).toBeInTheDocument();
        });
    });

    describe('Size', () => {
        it('renders with default M size', () => {
            renderWithProviders(<Spinner />);
            expect(screen.getByRole('progressbar')).toBeInTheDocument();
        });

        it('renders with S size', () => {
            renderWithProviders(<Spinner size="S" />);
            expect(screen.getByRole('progressbar')).toBeInTheDocument();
        });

        it('renders with L size', () => {
            renderWithProviders(<Spinner size="L" />);
            expect(screen.getByRole('progressbar')).toBeInTheDocument();
        });
    });

    describe('Indeterminate State', () => {
        it('is indeterminate by default', () => {
            renderWithProviders(<Spinner />);
            expect(screen.getByRole('progressbar')).toBeInTheDocument();
        });

        it('respects isIndeterminate prop', () => {
            renderWithProviders(<Spinner isIndeterminate={false} />);
            expect(screen.getByRole('progressbar')).toBeInTheDocument();
        });
    });

    describe('Accessibility', () => {
        it('has default aria-label "Loading"', () => {
            renderWithProviders(<Spinner />);
            expect(screen.getByLabelText('Loading')).toBeInTheDocument();
        });

        it('applies custom aria-label', () => {
            renderWithProviders(<Spinner aria-label="Loading data" />);
            expect(screen.getByLabelText('Loading data')).toBeInTheDocument();
        });

        it('has progressbar role', () => {
            renderWithProviders(<Spinner />);
            const spinner = screen.getByRole('progressbar');
            expect(spinner).toBeInTheDocument();
        });
    });

    describe('Props Combination', () => {
        it('renders with all custom props', () => {
            renderWithProviders(
                <Spinner
                    size="L"
                    isIndeterminate={true}
                    aria-label="Processing request"
                    className="my-spinner"
                />
            );
            expect(screen.getByLabelText('Processing request')).toBeInTheDocument();
        });
    });
});
