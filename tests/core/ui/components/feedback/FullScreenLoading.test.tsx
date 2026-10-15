import React from 'react';
import { renderWithProviders, screen, cleanup } from '../../../../helpers/react-test-utils';
import { FullScreenLoading } from '@/core/ui/components/feedback/FullScreenLoading';

/**
 * The first-load view a full-screen surface shows before it has anything to draw:
 * one large spinner, centred in the whole window. Five surfaces use it; it replaced
 * four hand-written copies and the Site Access screen's top-left bar (EDS-41).
 */
describe('FullScreenLoading', () => {
    afterEach(() => {
        cleanup();
    });

    it('names what is loading under a spinner', () => {
        renderWithProviders(<FullScreenLoading message="Loading projects" />);

        expect(screen.getByText('Loading projects')).toBeInTheDocument();
        expect(screen.getByRole('progressbar')).toBeInTheDocument();
    });

    it('fills the window, so the spinner sits in its centre', () => {
        const { container } = renderWithProviders(<FullScreenLoading message="Loading" />);

        const outer = container.querySelector('div[style*="100vh"]');
        expect(outer).not.toBeNull();
    });
});
