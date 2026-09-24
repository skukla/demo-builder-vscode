/**
 * The integrations screen's cards/rows toggle (owner, 2026-09-24): the projects
 * list's view switch, on this screen. The init payload seeds it, the header's
 * toggle drives it, the grid receives it, and the choice goes to the extension
 * so reopening the screen agrees.
 */

import { act, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import {
    captureHandlers,
    DEPLOYED,
    getClient,
    IntegrationsScreen,
    resetIntegrationsScreenMocks,
    settleStatus,
} from './IntegrationsScreen.testUtils';

function renderLoaded(props: Record<string, unknown> = {}) {
    const handlers = captureHandlers();
    const view = render(
        <IntegrationsScreen hasAdobeContext appBuilderComponents={{ a: DEPLOYED }} {...props} />,
    );
    settleStatus(handlers);
    return view;
}

describe('IntegrationsScreen — cards or rows', () => {
    beforeEach(() => {
        resetIntegrationsScreenMocks();
    });

    it('shows cards by default and offers the toggle', () => {
        renderLoaded();

        expect(screen.getByTestId('grid')).toHaveAttribute('data-view-mode', 'cards');
        expect(screen.getByRole('button', { name: /list view/i })).toBeInTheDocument();
    });

    it('starts in rows when the init payload says so', () => {
        renderLoaded({ integrationsViewMode: 'rows' });

        expect(screen.getByTestId('grid')).toHaveAttribute('data-view-mode', 'rows');
        expect(screen.getByTestId('search-header')).toHaveAttribute('data-view-mode', 'rows');
    });

    it('switches the grid and tells the extension when the toggle is used', () => {
        renderLoaded();

        act(() => {
            fireEvent.click(screen.getByRole('button', { name: /list view/i }));
        });

        expect(screen.getByTestId('grid')).toHaveAttribute('data-view-mode', 'rows');
        expect(getClient().postMessage).toHaveBeenCalledWith('setIntegrationsViewModeOverride', {
            viewMode: 'rows',
        });

        act(() => {
            fireEvent.click(screen.getByRole('button', { name: /card view/i }));
        });

        expect(screen.getByTestId('grid')).toHaveAttribute('data-view-mode', 'cards');
        expect(getClient().postMessage).toHaveBeenLastCalledWith('setIntegrationsViewModeOverride', {
            viewMode: 'cards',
        });
    });
});
