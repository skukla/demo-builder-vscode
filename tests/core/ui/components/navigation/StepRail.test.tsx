/**
 * StepRail tests
 *
 * Presentational, fully-controlled HORIZONTAL tab strip. Renders steps as real
 * <button role="tab">s inside a `role="tablist"` with `aria-orientation="horizontal"`;
 * the active step is `aria-selected`; only REACHED steps (`done` / `current`) call
 * `onSelect(id)` — you may click BACK to a reached step but never AHEAD to an
 * `upcoming` one. `upcoming` and `locked` steps are `aria-disabled` + out of the tab
 * order and do NOT call `onSelect`; `locked` additionally surfaces its reason. Labels
 * only — NO per-status marks, no numbered circles, no connector rail. No business
 * logic, no internal state — parent owns activeId / onSelect.
 *
 */

import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { Provider, defaultTheme } from '@adobe/react-spectrum';
import '@testing-library/jest-dom';
import {
    StepRail,
    type StepTab,
} from '@/core/ui/components/navigation/StepRail';

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

describe('StepRail', () => {
    describe('rendering and order', () => {
        it('renders every step as a button in rail (left-to-right) order', () => {
            renderWithProvider(
                <StepRail steps={STEPS} activeId="connection" onSelect={jest.fn()} />,
            );
            const buttons = document.querySelectorAll('.vsteplist-step');
            expect(buttons).toHaveLength(4);
            const ids = Array.from(buttons).map(b => b.getAttribute('data-step'));
            expect(ids).toEqual(['backend', 'connection', 'business-structure', 'catalog']);
        });

        it('exposes a horizontal tablist orientation (the strip)', () => {
            renderWithProvider(
                <StepRail steps={STEPS} activeId="connection" onSelect={jest.fn()} />,
            );
            const list = screen.getByRole('tablist');
            expect(list).toHaveAttribute('aria-orientation', 'horizontal');
        });

        it('renders each step title text', () => {
            renderWithProvider(
                <StepRail steps={STEPS} activeId="connection" onSelect={jest.fn()} />,
            );
            expect(screen.getByText('Backend')).toBeInTheDocument();
            expect(screen.getByText('Catalog')).toBeInTheDocument();
        });
    });

    describe('status markers', () => {
        it('exposes the status via data-status on each step', () => {
            renderWithProvider(
                <StepRail steps={STEPS} activeId="connection" onSelect={jest.fn()} />,
            );
            expect(tab('backend')).toHaveAttribute('data-status', 'done');
            expect(tab('connection')).toHaveAttribute('data-status', 'current');
            expect(tab('business-structure')).toHaveAttribute('data-status', 'upcoming');
            expect(tab('catalog')).toHaveAttribute('data-status', 'locked');
        });

        it('renders NO status glyph on any step — done included (the summary owns the ✓)', () => {
            renderWithProvider(
                <StepRail steps={STEPS} activeId="connection" onSelect={jest.fn()} />,
            );
            // The rail is navigation only: status lives in data-status (and the
            // adjacent summary column), never a per-item glyph. No svg/icon, no numbers.
            for (const id of ['backend', 'connection', 'business-structure', 'catalog']) {
                expect(tab(id).querySelector('svg')).not.toBeInTheDocument();
                expect(tab(id)).not.toHaveTextContent(/\d/);
            }
        });

        it('does not render numbered circles on any step', () => {
            renderWithProvider(
                <StepRail steps={STEPS} activeId="connection" onSelect={jest.fn()} />,
            );
            // The current step (Connection, 2nd) no longer shows its index "2".
            expect(tab('connection')).not.toHaveTextContent('2');
        });
    });

    describe('active state', () => {
        it('flags the active step with aria-selected=true and others false', () => {
            renderWithProvider(
                <StepRail steps={STEPS} activeId="connection" onSelect={jest.fn()} />,
            );
            expect(tab('connection')).toHaveAttribute('aria-selected', 'true');
            expect(tab('backend')).toHaveAttribute('aria-selected', 'false');
        });
    });

    describe('class composition (the highlight the CSS keys off)', () => {
        // Exact strings, not `toContain`: the active accent, the status class and the
        // error class are all appended by one `cn(...)` call, so only exact equality
        // says an extra class was NOT added as well as that the right one was.
        it('appends the accent class to the active tab and to no other', () => {
            renderWithProvider(
                <StepRail steps={STEPS} activeId="connection" onSelect={jest.fn()} />,
            );
            expect(tab('connection').className).toBe('vsteplist-step current active');
            expect(tab('backend').className).toBe('vsteplist-step done');
            expect(tab('business-structure').className).toBe('vsteplist-step upcoming');
            expect(tab('catalog').className).toBe('vsteplist-step locked');
        });
    });

    describe('locked steps', () => {
        it('marks a locked step aria-disabled and does not call onSelect when clicked', () => {
            const onSelect = jest.fn();
            renderWithProvider(
                <StepRail steps={STEPS} activeId="connection" onSelect={onSelect} />,
            );
            expect(tab('catalog')).toHaveAttribute('aria-disabled', 'true');
            fireEvent.click(tab('catalog'));
            expect(onSelect).not.toHaveBeenCalled();
        });

        it('surfaces the lock reason (title + visually-hidden text)', () => {
            renderWithProvider(
                <StepRail steps={STEPS} activeId="connection" onSelect={jest.fn()} />,
            );
            expect(tab('catalog')).toHaveAttribute('title', 'Choose a store view first');
            expect(screen.getByText('Choose a store view first')).toBeInTheDocument();
        });

        it('renders no visually-hidden reason for a locked step that declares none', () => {
            const steps: StepTab[] = [
                { id: 'backend', title: 'Backend', status: 'done' },
                { id: 'catalog', title: 'Catalog', status: 'locked' },
            ];
            renderWithProvider(
                <StepRail steps={steps} activeId="backend" onSelect={jest.fn()} />,
            );
            expect(tab('catalog')).not.toHaveAttribute('title');
            expect(document.querySelectorAll('.vsteplist-sr')).toHaveLength(0);
        });

        it('ignores a reason on a step that is NOT locked — lock status decides, not the reason', () => {
            const steps: StepTab[] = [
                {
                    id: 'backend',
                    title: 'Backend',
                    status: 'done',
                    lockReason: 'Choose a store view first',
                },
                { id: 'connection', title: 'Connection', status: 'current' },
            ];
            renderWithProvider(
                <StepRail steps={steps} activeId="connection" onSelect={jest.fn()} />,
            );
            expect(tab('backend')).not.toHaveAttribute('title');
            expect(document.querySelectorAll('.vsteplist-sr')).toHaveLength(0);
        });
    });

    describe('upcoming steps', () => {
        it('marks an upcoming step aria-disabled + out of the tab order', () => {
            renderWithProvider(
                <StepRail steps={STEPS} activeId="connection" onSelect={jest.fn()} />,
            );
            expect(tab('business-structure')).toHaveAttribute('aria-disabled', 'true');
            expect(tab('business-structure')).toHaveAttribute('tabindex', '-1');
        });

        it('does not call onSelect when an upcoming (ahead) step is clicked', () => {
            const onSelect = jest.fn();
            renderWithProvider(
                <StepRail steps={STEPS} activeId="connection" onSelect={onSelect} />,
            );
            fireEvent.click(tab('business-structure'));
            expect(onSelect).not.toHaveBeenCalled();
        });

        it('does not surface a reason on an upcoming step (it is future, not gated)', () => {
            renderWithProvider(
                <StepRail steps={STEPS} activeId="connection" onSelect={jest.fn()} />,
            );
            expect(tab('business-structure')).not.toHaveAttribute('title');
        });
    });

    describe('interaction', () => {
        it('calls onSelect with the id when a reached (done/current) step is clicked', () => {
            const onSelect = jest.fn();
            renderWithProvider(
                <StepRail steps={STEPS} activeId="connection" onSelect={onSelect} />,
            );
            // `backend` is `done` — a reached step you can click BACK to.
            fireEvent.click(tab('backend'));
            expect(onSelect).toHaveBeenCalledWith('backend');
        });

        it('calls onSelect when the current step is clicked', () => {
            const onSelect = jest.fn();
            renderWithProvider(
                <StepRail steps={STEPS} activeId="connection" onSelect={onSelect} />,
            );
            fireEvent.click(tab('connection'));
            expect(onSelect).toHaveBeenCalledWith('connection');
        });
    });

    describe('error marker', () => {
        // Configure renders ONE section at a time, so a blocking validation error can sit
        // in a section that is off screen. Without a marker on the tab, Save is disabled
        // and the user has no way to find out why.
        const WITH_ERROR: StepTab[] = [
            { id: 'backend', title: 'Backend', status: 'done', hasError: true },
            { id: 'connection', title: 'Connection', status: 'current' },
        ];

        it('marks a tab carrying an error and leaves the others unmarked', () => {
            renderWithProvider(
                <StepRail steps={WITH_ERROR} activeId="connection" onSelect={jest.fn()} />,
            );
            expect(tab('backend')).toHaveAttribute('data-has-error', 'true');
            expect(tab('connection')).not.toHaveAttribute('data-has-error');
        });

        it('appends the error class only to the tab that declares one', () => {
            renderWithProvider(
                <StepRail steps={WITH_ERROR} activeId="connection" onSelect={jest.fn()} />,
            );
            expect(tab('backend').className).toBe('vsteplist-step done has-error');
            expect(tab('connection').className).toBe('vsteplist-step current active');
        });

        it('announces the error to screen readers rather than relying on the dot alone', () => {
            renderWithProvider(
                <StepRail steps={WITH_ERROR} activeId="connection" onSelect={jest.fn()} />,
            );
            expect(tab('backend')).toHaveTextContent('has errors');
        });

        it('keeps an errored tab clickable — finding the error is the point', () => {
            const onSelect = jest.fn();
            renderWithProvider(
                <StepRail steps={WITH_ERROR} activeId="connection" onSelect={onSelect} />,
            );
            fireEvent.click(tab('backend'));
            expect(onSelect).toHaveBeenCalledWith('backend');
        });

        it('adds no marker when no step declares an error (the control)', () => {
            renderWithProvider(
                <StepRail steps={STEPS} activeId="connection" onSelect={jest.fn()} />,
            );
            expect(document.querySelectorAll('[data-has-error]')).toHaveLength(0);
            expect(screen.queryByText('has errors')).not.toBeInTheDocument();
        });
    });

    describe('edge cases', () => {
        it('does not crash with an empty step list', () => {
            renderWithProvider(
                <StepRail steps={[]} activeId="" onSelect={jest.fn()} />,
            );
            expect(document.querySelectorAll('.vsteplist-step')).toHaveLength(0);
        });
    });

    describe('keeping the active tab in view', () => {
        // jsdom does not implement scrollIntoView at all, so the component's optional
        // call short-circuits and the arguments are never evaluated unless we supply it.
        let scrollIntoView: jest.Mock;

        beforeEach(() => {
            scrollIntoView = jest.fn();
            (Element.prototype as unknown as Record<string, unknown>).scrollIntoView =
                scrollIntoView;
        });

        afterEach(() => {
            delete (Element.prototype as unknown as Record<string, unknown>).scrollIntoView;
        });

        it('scrolls the ACTIVE tab into view, nearest on both axes (no vertical nudge)', () => {
            renderWithProvider(
                <StepRail steps={STEPS} activeId="connection" onSelect={jest.fn()} />,
            );
            expect(scrollIntoView).toHaveBeenCalledTimes(1);
            expect(scrollIntoView.mock.instances[0]).toBe(tab('connection'));
            expect(scrollIntoView).toHaveBeenCalledWith({
                block: 'nearest',
                inline: 'nearest',
            });
        });

        it('re-scrolls when the active step changes — not only on first render', () => {
            const { rerender } = renderWithProvider(
                <StepRail steps={STEPS} activeId="connection" onSelect={jest.fn()} />,
            );
            scrollIntoView.mockClear();

            rerender(
                <Provider theme={defaultTheme}>
                    <StepRail steps={STEPS} activeId="backend" onSelect={jest.fn()} />
                </Provider>,
            );

            expect(scrollIntoView).toHaveBeenCalledTimes(1);
            expect(scrollIntoView.mock.instances[0]).toBe(tab('backend'));
        });

        it('scrolls nothing when the active id matches no rendered step', () => {
            renderWithProvider(
                <StepRail steps={STEPS} activeId="nonexistent" onSelect={jest.fn()} />,
            );
            expect(scrollIntoView).not.toHaveBeenCalled();
        });
    });

    describe('reveal animation (enter only — instant removal)', () => {
        const STEPS_WITH_SIGNIN: StepTab[] = [
            STEPS[0],
            { id: 'signin', title: 'Sign in', status: 'current' },
            ...STEPS.slice(1),
        ];
        /** Let the initial settle window pass so the enter animation is enabled. */
        const settle = () => act(() => { jest.advanceTimersByTime(600); });

        it('marks ONLY a newly-added tab as entering — not existing tabs, not on first render', () => {
            const { rerender } = renderWithProvider(
                <StepRail steps={STEPS} activeId="connection" onSelect={jest.fn()} />,
            );
            // Nothing animates on first render or during the settle window.
            expect(document.querySelectorAll('.vsteplist-step--enter')).toHaveLength(0);
            settle();

            // Reveal a new sub-step (e.g. "Sign in" appearing when ACCS is chosen).
            rerender(
                <Provider theme={defaultTheme}>
                    <StepRail steps={STEPS_WITH_SIGNIN} activeId="connection" onSelect={jest.fn()} />
                </Provider>,
            );
            expect(tab('signin').className).toMatch(/vsteplist-step--enter/);
            expect(tab('backend').className).not.toMatch(/vsteplist-step--enter/);
            expect(tab('connection').className).not.toMatch(/vsteplist-step--enter/);
        });

        it('removes a tab INSTANTLY — no lingering exit animation (responsive feedback)', () => {
            const { rerender } = renderWithProvider(
                <StepRail steps={STEPS_WITH_SIGNIN} activeId="connection" onSelect={jest.fn()} />,
            );
            settle();
            expect(document.querySelector('[data-step="signin"]')).not.toBeNull();

            // Remove the sub-step (e.g. switching ACCS → PaaS drops "Sign in").
            rerender(
                <Provider theme={defaultTheme}>
                    <StepRail steps={STEPS} activeId="connection" onSelect={jest.fn()} />
                </Provider>,
            );
            // Gone immediately — not held for an exit animation.
            expect(document.querySelector('[data-step="signin"]')).toBeNull();
        });
    });
});
