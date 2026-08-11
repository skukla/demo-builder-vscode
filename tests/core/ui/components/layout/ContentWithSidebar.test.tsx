/**
 * ContentWithSidebar — content column + an edge-reaching sidebar (built on
 * TwoColumnLayout: maxWidth="none" + the .content-with-sidebar left-zone cap + a capped
 * inner sidebar). Renders the main content and the sidebar in their respective columns.
 */

import React from 'react';
import { render } from '@testing-library/react';
import '@testing-library/jest-dom';
import { defaultTheme, Provider } from '@adobe/react-spectrum';
import { ContentWithSidebar } from '@/core/ui/components/layout/ContentWithSidebar';

const renderWithProvider = (ui: React.ReactElement) =>
    render(<Provider theme={defaultTheme}>{ui}</Provider>);

describe('ContentWithSidebar', () => {
    it('renders main content + sidebar with the content-with-sidebar layout', () => {
        const { container, getByText } = renderWithProvider(
            <ContentWithSidebar sidebar={<div>summary</div>}>
                <div>main</div>
            </ContentWithSidebar>,
        );
        expect(container.querySelector('.content-with-sidebar')).toBeInTheDocument();
        expect(getByText('main')).toBeInTheDocument();
        expect(getByText('summary')).toBeInTheDocument();
    });

    it('caps the sidebar inner content width (default 280px)', () => {
        const { container } = renderWithProvider(
            <ContentWithSidebar sidebar={<div>summary</div>}>
                <div>main</div>
            </ContentWithSidebar>,
        );
        const inner = container.querySelector('.content-sidebar-inner') as HTMLElement;
        expect(inner).toBeInTheDocument();
        expect(inner.style.maxWidth).toBe('280px');
    });

    it('honors a custom sidebarContentWidth', () => {
        const { container } = renderWithProvider(
            <ContentWithSidebar sidebar={<div>s</div>} sidebarContentWidth="320px">
                <div>m</div>
            </ContentWithSidebar>,
        );
        const inner = container.querySelector('.content-sidebar-inner') as HTMLElement;
        expect(inner.style.maxWidth).toBe('320px');
    });
});
