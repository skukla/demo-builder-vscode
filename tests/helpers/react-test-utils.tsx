import React, { ReactElement } from 'react';
import { render, RenderOptions } from '@testing-library/react';

/**
 * Custom render function for React Aria components
 *
 * No Provider wrapper needed - React Aria components work standalone.
 * This function exists for API consistency and future extensibility.
 *
 * @param ui - The React element to render
 * @param options - Optional render options
 * @returns Render result with all testing library utilities
 */
export function renderWithProviders(
    ui: ReactElement,
    options?: Omit<RenderOptions, 'wrapper'>
) {
    return render(ui, options);
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
                className={props.className}
                style={props.style}
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
