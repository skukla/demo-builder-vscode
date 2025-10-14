import React, { ReactElement } from 'react';
import { render, RenderOptions } from '@testing-library/react';
import { Provider as SpectrumProvider, defaultTheme } from '@adobe/react-spectrum';

/**
 * Custom render function that wraps components with Adobe Spectrum Provider
 *
 * @param ui - The React element to render
 * @param options - Optional render options
 * @returns Render result with all testing library utilities
 */
export function renderWithProviders(
    ui: ReactElement,
    options?: Omit<RenderOptions, 'wrapper'>
) {
    const Wrapper = ({ children }: { children: React.ReactNode }) => (
        <SpectrumProvider theme={defaultTheme}>
            {children}
        </SpectrumProvider>
    );

    return render(ui, { wrapper: Wrapper, ...options });
}

/**
 * Helper to create a mock Spectrum icon component for testing
 */
export function createMockIcon(name: string) {
    return function MockIcon(props: any) {
        return (
            <svg
                data-testid={`icon-${name}`}
                aria-label={props['aria-label']}
                className={props.UNSAFE_className}
                style={props.UNSAFE_style}
            >
                <title>{name}</title>
            </svg>
        );
    };
}

/**
 * Helper to wait for async operations
 */
export const waitForAsync = () => new Promise(resolve => setTimeout(resolve, 0));

// Re-export everything from testing library for convenience
export * from '@testing-library/react';
