/**
 * VerticalStepList tests (Commerce slice — vertical nav)
 *
 * Presentational, fully-controlled VERTICAL step list replacing the rejected
 * horizontal StepTabs strip. Renders steps top-to-bottom as real <button role="tab">s
 * inside a `role="tablist"` with `aria-orientation="vertical"`; the active step is
 * `aria-selected`; only REACHED steps (`done` / `current`) call `onSelect(id)` — you may
 * click BACK to a reached step but never AHEAD to an `upcoming` one. `upcoming` and
 * `locked` steps are `aria-disabled` + out of the tab order and do NOT call `onSelect`;
 * `locked` additionally surfaces its reason. Quiet per-status marks (done →
 * subtle ✓ glyph / current → filled accent marker / upcoming + locked → blank, so the
 * labels stay aligned). No numbered circles, no connector rail. No business logic, no
 * internal state — parent owns activeId / onSelect. Same interface as the deleted
 * StepTabs.
 *
 * @jest-environment jsdom
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { Provider, defaultTheme } from '@adobe/react-spectrum';
import '@testing-library/jest-dom';
import {
    VerticalStepList,
    type StepTab,
} from '@/features/project-creation/ui/components/VerticalStepList';

const renderWithProvider = (ui: React.ReactElement) =>
    render(<Provider theme={defaultTheme}>{ui}</Provider>);

const STEPS: StepTab[] = [
    { id: 'backend', title: 'Backend', status: 'done' },
    { id: 'connection', title: 'Connection', status: 'current' },
    { id: 'business-structure', title: 'Business Structure', status: 'upcoming' },
    {
        id: 'catalog',
        title: 'Catalog',
        status: 'locked',
        lockReason: 'Choose a store view first',
    },
];

/** The tab button for a step id (by stable data-step attribute). */
function tab(id: string): HTMLButtonElement {
    const el = document.querySelector(`[data-step="${id}"]`);
    if (!el) throw new Error(`tab [data-step="${id}"] not found`);
    return el as HTMLButtonElement;
}

describe('VerticalStepList', () => {
    describe('rendering and order', () => {
        it('renders every step as a button in vertical (top-to-bottom) order', () => {
            renderWithProvider(
                <VerticalStepList steps={STEPS} activeId="connection" onSelect={jest.fn()} />,
            );
            const buttons = document.querySelectorAll('.vsteplist-step');
            expect(buttons).toHaveLength(4);
            const ids = Array.from(buttons).map(b => b.getAttribute('data-step'));
            expect(ids).toEqual(['backend', 'connection', 'business-structure', 'catalog']);
        });

        it('exposes a horizontal tablist orientation (the strip)', () => {
            renderWithProvider(
                <VerticalStepList steps={STEPS} activeId="connection" onSelect={jest.fn()} />,
            );
            const list = screen.getByRole('tablist');
            expect(list).toHaveAttribute('aria-orientation', 'horizontal');
        });

        it('renders each step title text', () => {
            renderWithProvider(
                <VerticalStepList steps={STEPS} activeId="connection" onSelect={jest.fn()} />,
            );
            expect(screen.getByText('Backend')).toBeInTheDocument();
            expect(screen.getByText('Catalog')).toBeInTheDocument();
        });
    });

    describe('status markers', () => {
        it('exposes the status via data-status on each step', () => {
            renderWithProvider(
                <VerticalStepList steps={STEPS} activeId="connection" onSelect={jest.fn()} />,
            );
            expect(tab('backend')).toHaveAttribute('data-status', 'done');
            expect(tab('connection')).toHaveAttribute('data-status', 'current');
            expect(tab('business-structure')).toHaveAttribute('data-status', 'upcoming');
            expect(tab('catalog')).toHaveAttribute('data-status', 'locked');
        });

        it('renders NO status glyph on any step — done included (the summary owns the ✓)', () => {
            renderWithProvider(
                <VerticalStepList steps={STEPS} activeId="connection" onSelect={jest.fn()} />,
            );
            // The left sub-menu is navigation only: status lives in data-status (and the
            // adjacent summary column), never a per-item glyph. No svg/icon, no numbers.
            for (const id of ['backend', 'connection', 'business-structure', 'catalog']) {
                expect(tab(id).querySelector('svg')).not.toBeInTheDocument();
                expect(tab(id)).not.toHaveTextContent(/\d/);
            }
        });

        it('does not render numbered circles on any step', () => {
            renderWithProvider(
                <VerticalStepList steps={STEPS} activeId="connection" onSelect={jest.fn()} />,
            );
            // The current step (Connection, 2nd) no longer shows its index "2".
            expect(tab('connection')).not.toHaveTextContent('2');
        });
    });

    describe('active state', () => {
        it('flags the active step with aria-selected=true and others false', () => {
            renderWithProvider(
                <VerticalStepList steps={STEPS} activeId="connection" onSelect={jest.fn()} />,
            );
            expect(tab('connection')).toHaveAttribute('aria-selected', 'true');
            expect(tab('backend')).toHaveAttribute('aria-selected', 'false');
        });
    });

    describe('locked steps', () => {
        it('marks a locked step aria-disabled and does not call onSelect when clicked', () => {
            const onSelect = jest.fn();
            renderWithProvider(
                <VerticalStepList steps={STEPS} activeId="connection" onSelect={onSelect} />,
            );
            expect(tab('catalog')).toHaveAttribute('aria-disabled', 'true');
            fireEvent.click(tab('catalog'));
            expect(onSelect).not.toHaveBeenCalled();
        });

        it('surfaces the lock reason (title + visually-hidden text)', () => {
            renderWithProvider(
                <VerticalStepList steps={STEPS} activeId="connection" onSelect={jest.fn()} />,
            );
            expect(tab('catalog')).toHaveAttribute('title', 'Choose a store view first');
            expect(screen.getByText('Choose a store view first')).toBeInTheDocument();
        });
    });

    describe('upcoming steps', () => {
        it('marks an upcoming step aria-disabled + out of the tab order', () => {
            renderWithProvider(
                <VerticalStepList steps={STEPS} activeId="connection" onSelect={jest.fn()} />,
            );
            expect(tab('business-structure')).toHaveAttribute('aria-disabled', 'true');
            expect(tab('business-structure')).toHaveAttribute('tabindex', '-1');
        });

        it('does not call onSelect when an upcoming (ahead) step is clicked', () => {
            const onSelect = jest.fn();
            renderWithProvider(
                <VerticalStepList steps={STEPS} activeId="connection" onSelect={onSelect} />,
            );
            fireEvent.click(tab('business-structure'));
            expect(onSelect).not.toHaveBeenCalled();
        });

        it('does not surface a reason on an upcoming step (it is future, not gated)', () => {
            renderWithProvider(
                <VerticalStepList steps={STEPS} activeId="connection" onSelect={jest.fn()} />,
            );
            expect(tab('business-structure')).not.toHaveAttribute('title');
        });
    });

    describe('interaction', () => {
        it('calls onSelect with the id when a reached (done/current) step is clicked', () => {
            const onSelect = jest.fn();
            renderWithProvider(
                <VerticalStepList steps={STEPS} activeId="connection" onSelect={onSelect} />,
            );
            // `backend` is `done` — a reached step you can click BACK to.
            fireEvent.click(tab('backend'));
            expect(onSelect).toHaveBeenCalledWith('backend');
        });

        it('calls onSelect when the current step is clicked', () => {
            const onSelect = jest.fn();
            renderWithProvider(
                <VerticalStepList steps={STEPS} activeId="connection" onSelect={onSelect} />,
            );
            fireEvent.click(tab('connection'));
            expect(onSelect).toHaveBeenCalledWith('connection');
        });
    });

    describe('edge cases', () => {
        it('does not crash with an empty step list', () => {
            renderWithProvider(
                <VerticalStepList steps={[]} activeId="" onSelect={jest.fn()} />,
            );
            expect(document.querySelectorAll('.vsteplist-step')).toHaveLength(0);
        });
    });
});
