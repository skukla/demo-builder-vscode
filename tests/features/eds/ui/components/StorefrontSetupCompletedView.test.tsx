/**
 * The published screen of the storefront setup step, rendered on its own.
 *
 * Spectrum and the workflow icons come from the jest.config.js module mapper.
 * Every icon specifier maps to ONE stub, so the icons are told apart by the
 * colour class the component gives them, which is the decision under test.
 */

import { render, screen } from '@testing-library/react';
import React from 'react';
import { StorefrontSetupCompletedView } from '@/features/eds/ui/components/StorefrontSetupCompletedView';

function iconClass(container: HTMLElement): string {
    const icon = container.querySelector('svg');
    if (!icon) throw new Error('no icon rendered');
    return icon.getAttribute('class') ?? '';
}

describe('StorefrontSetupCompletedView', () => {
    it('shows a clean publish with a green check', () => {
        const { container } = render(<StorefrontSetupCompletedView />);
        expect(screen.getByText('Storefront Published')).toBeInTheDocument();
        expect(iconClass(container)).toBe('text-green-600');
        expect(
            screen.getByText('Click Continue to proceed with project creation.'),
        ).toBeInTheDocument();
    });

    it('treats an empty warning list as a clean publish', () => {
        const { container } = render(<StorefrontSetupCompletedView warnings={[]} />);
        expect(screen.getByText('Storefront Published')).toBeInTheDocument();
        expect(iconClass(container)).toBe('text-green-600');
    });

    it('does not wear the green check when product pages will not work', () => {
        const { container } = render(
            <StorefrontSetupCompletedView
                warnings={['Product pages will not render', 'Search is not configured']}
            />,
        );
        expect(screen.getByText('Storefront Published, with warnings')).toBeInTheDocument();
        expect(iconClass(container)).toBe('text-orange-600');
        expect(screen.getByText('Product pages will not render')).toHaveClass('text-orange-700');
        expect(screen.getByText('Search is not configured')).toBeInTheDocument();
    });
});
