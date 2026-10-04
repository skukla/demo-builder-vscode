/**
 * The integrations grid ends with an "Add an integration" card (PL-62).
 *
 * Owner decision, 2026-09-21: adding is a card in the grid, not a button in the
 * header — the Welcome step's "Add a demo package" card is the pattern, and both
 * are the shared AddCard. This reverses the 2026-08 removal of a dashed tile,
 * whose reason was "two doors, one room" (tile AND header button); the header
 * button goes in the same change, so there is still one door.
 *
 * The SCREEN decides whether the card shows (it owns the filter); the grid only
 * renders it last when handed `onAdd`.
 */

import { fireEvent, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { cardsFor, renderCards, resetGridMocks, twoDeployed } from './IntegrationsGrid.testUtils';

const ADD_NAME = 'Add an integration';

describe('IntegrationsGrid — the add card', () => {
    beforeEach(() => resetGridMocks());

    it('is the last cell of the card grid, shaped as an integration card', () => {
        const { container } = renderCards(cardsFor({ appBuilderComponents: twoDeployed() }), {
            onAdd: jest.fn(),
        });

        const grid = container.querySelector('.integrations-grid') as HTMLElement;
        const add = screen.getByRole('button', { name: ADD_NAME });
        expect(grid.lastElementChild).toBe(add);
        expect(add).toHaveClass('add-card', 'integration-card');
    });

    it('opens the add flow on click and on Enter', () => {
        const onAdd = jest.fn();
        renderCards(cardsFor({ appBuilderComponents: twoDeployed() }), { onAdd });

        const add = screen.getByRole('button', { name: ADD_NAME });
        fireEvent.click(add);
        fireEvent.keyDown(add, { key: 'Enter' });

        expect(onAdd).toHaveBeenCalledTimes(2);
    });

    it('ends the row list too, shaped as a row, so rows mode keeps a way to add', () => {
        const { container } = renderCards(cardsFor({ appBuilderComponents: twoDeployed() }), {
            onAdd: jest.fn(),
            viewMode: 'rows',
        });

        const list = container.querySelector('.integration-row-list') as HTMLElement;
        const add = screen.getByRole('button', { name: ADD_NAME });
        expect(list.lastElementChild).toBe(add);
        expect(add).toHaveClass('add-card', 'integration-row');
    });

    it('is absent when the screen hands no onAdd (as while a filter is on)', () => {
        const { container } = renderCards(cardsFor({ appBuilderComponents: twoDeployed() }));

        expect(screen.queryByRole('button', { name: ADD_NAME })).not.toBeInTheDocument();
        const grid = container.querySelector('.integrations-grid') as HTMLElement;
        const cards = screen.getAllByRole('button', { name: /, Deployed$/ });
        expect(grid.lastElementChild).toBe(cards[cards.length - 1]);
    });
});
