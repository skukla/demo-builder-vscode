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
        expect(container.querySelector('.page-container-padded')).toBeNull();
    });

    // Found 2026-10-29 on the Data Installer: it shows the loader BELOW its header and
    // tabs, which sit in the left-aligned content column, so a window-centred spinner
    // landed far to the right of everything around it.
    it('centres in the content column instead, when asked', () => {
        const { container } = renderWithProviders(<FullScreenLoading message="Loading" withinContentColumn />);

        const column = container.querySelector('.page-container-padded');
        expect(column).not.toBeNull();
        expect(column?.textContent).toContain('Loading');
        // The space left under the tabs, not a window's height that starts below them.
        expect(column?.classList.contains('flex-1')).toBe(true);
        expect(container.querySelector('div[style*="100vh"]')).toBeNull();
    });
});
