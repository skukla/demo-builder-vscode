/**
 * ViewSwitcher tests.
 *
 * A free, always-reachable switch between the panel's views — deliberately NOT
 * `StepRail`, whose `upcoming`/`locked` statuses are non-actionable by design, and
 * not Spectrum `Tabs`, which no file in the repo uses. Toggle semantics come from
 * `aria-pressed`, the same treatment `ChoiceCard` uses for a pressed choice.
 *
 * The rule with teeth: a switcher for ONE view is chrome with nothing to switch,
 * so it renders nothing. That is what lets the catalog slice ship with a single
 * view and the installed/activity views arrive without a placeholder in between.
 *
 * Strict TDD: written BEFORE the component exists.
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { ViewSwitcher } from '@/features/data-installer/ui/components/ViewSwitcher';

const VIEWS = [
    { id: 'catalog', label: 'Catalog' },
    { id: 'installed', label: 'Installed' },
    { id: 'activity', label: 'Activity' },
];

function renderSwitcher(activeId = 'catalog', views = VIEWS) {
    const onSelect = jest.fn();
    const view = render(<ViewSwitcher views={views} activeId={activeId} onSelect={onSelect} />);
    return { ...view, onSelect };
}

describe('ViewSwitcher', () => {
    it('renders one button per view', () => {
        renderSwitcher();

        expect(screen.getByRole('button', { name: 'Catalog' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Installed' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Activity' })).toBeInTheDocument();
    });

    it('marks only the active view as pressed', () => {
        renderSwitcher('installed');

        expect(screen.getByRole('button', { name: 'Installed' })).toHaveAttribute(
            'aria-pressed',
            'true',
        );
        expect(screen.getByRole('button', { name: 'Catalog' })).toHaveAttribute(
            'aria-pressed',
            'false',
        );
    });

    it('reports the picked view id', () => {
        const { onSelect } = renderSwitcher();

        fireEvent.click(screen.getByRole('button', { name: 'Activity' }));

        expect(onSelect).toHaveBeenCalledWith('activity');
    });

    it('reports even a re-pick of the active view, leaving the decision to the caller', () => {
        const { onSelect } = renderSwitcher();

        fireEvent.click(screen.getByRole('button', { name: 'Catalog' }));

        expect(onSelect).toHaveBeenCalledWith('catalog');
    });

    it('renders nothing for a single view', () => {
        const { container } = renderSwitcher('catalog', [{ id: 'catalog', label: 'Catalog' }]);

        expect(container).toBeEmptyDOMElement();
    });

    it('renders nothing for no views', () => {
        const { container } = renderSwitcher('catalog', []);

        expect(container).toBeEmptyDOMElement();
    });
});
