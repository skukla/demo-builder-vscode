/**
 * PL-62 — on the integrations screen, adding is the card at the end of the grid,
 * not a button in the header. The screen decides when the card shows; the grid
 * (stubbed here, its own suite pins the card) renders it when handed `onAdd`.
 *
 * Rules, the same on every add-card grid:
 *   - no header "Add integration" button once there are cards — one door;
 *   - the card steps aside while a filter narrows the grid (it is not a result);
 *   - the count is of integrations only;
 *   - the empty state keeps its own CTA (no grid renders there).
 */
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';

import {
    DEPLOYED,
    IntegrationsScreen,
    captureHandlers,
    resetIntegrationsScreenMocks,
    settleStatus,
} from './IntegrationsScreen.testUtils';

beforeEach(() => {
    resetIntegrationsScreenMocks();
});

function renderWithCards(): void {
    const handlers = captureHandlers();
    render(<IntegrationsScreen hasAdobeContext appBuilderComponents={{ a: DEPLOYED }} />);
    settleStatus(handlers);
}

describe('IntegrationsScreen — the add card', () => {
    it('has no Add button in the header band once there are cards', () => {
        renderWithCards();

        expect(screen.queryByRole('button', { name: 'Add integration' })).not.toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'grid-add' })).toBeInTheDocument();
    });

    it("opens the screen's add flow from the grid's card", async () => {
        const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
        renderWithCards();

        await user.click(screen.getByRole('button', { name: 'grid-add' }));

        expect(screen.getByTestId('add-modal')).toHaveAttribute('data-mode', 'add');
    });

    it('withholds the card while a filter is on, and gives it back when cleared', () => {
        renderWithCards();
        const filter = screen.getByLabelText('Filter integrations');

        fireEvent.change(filter, { target: { value: 'zzz' } });
        expect(screen.queryByRole('button', { name: 'grid-add' })).not.toBeInTheDocument();

        fireEvent.change(filter, { target: { value: '' } });
        expect(screen.getByRole('button', { name: 'grid-add' })).toBeInTheDocument();
    });

    it('counts integrations only, never the card', () => {
        renderWithCards();

        expect(screen.getByTestId('count-text')).toHaveTextContent('1 integration');
    });

    it('keeps the empty-state CTA as the only way in when there is nothing yet', () => {
        const handlers = captureHandlers();
        render(<IntegrationsScreen hasAdobeContext appBuilderComponents={{}} />);
        settleStatus(handlers);

        expect(screen.getAllByRole('button', { name: 'Add integration' })).toHaveLength(1);
        expect(screen.queryByRole('button', { name: 'grid-add' })).not.toBeInTheDocument();
    });
});
