/**
 * TimelineNav — who can be clicked, and what a click does.
 *
 * Navigation rule: you may click the CURRENT step or any step BEHIND it;
 * forward navigation is the Continue button's job. A step you cannot reach is
 * fully inert — no role, no tab stop, and neither mouse nor keyboard moves the
 * wizard.
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { Provider, defaultTheme } from '@adobe/react-spectrum';
import '@testing-library/jest-dom';
import { TimelineNav, type TimelineStep } from '@/core/ui/components/TimelineNav';

const renderWithProvider = (ui: React.ReactElement) =>
    render(<Provider theme={defaultTheme}>{ui}</Provider>);

const STEPS: TimelineStep[] = [
    { id: 'welcome', name: 'Welcome' },
    { id: 'build', name: 'Build Your Project' },
    { id: 'review', name: 'Review' },
];

const step = (id: string) => screen.getByTestId(`timeline-step-${id}`);

/** Steps 0 completed, 1 current, 2 upcoming — the ordinary mid-wizard shape. */
const renderNav = (onStepClick?: (i: number) => void) =>
    renderWithProvider(
        <TimelineNav
            steps={STEPS}
            currentStepIndex={1}
            completedStepIndices={[0]}
            onStepClick={onStepClick}
        />,
    );

describe('TimelineNav - step navigation', () => {
    describe('clicking', () => {
        it('navigates to the current step by its own index', () => {
            const onStepClick = jest.fn();
            renderNav(onStepClick);

            fireEvent.click(step('build'));

            expect(onStepClick).toHaveBeenCalledWith(1);
            expect(onStepClick).toHaveBeenCalledTimes(1);
        });

        it('navigates backward to an already-completed step', () => {
            const onStepClick = jest.fn();
            renderNav(onStepClick);

            fireEvent.click(step('welcome'));

            expect(onStepClick).toHaveBeenCalledWith(0);
        });

        it('refuses to navigate forward to an upcoming step', () => {
            const onStepClick = jest.fn();
            renderNav(onStepClick);

            fireEvent.click(step('review'));

            expect(onStepClick).not.toHaveBeenCalled();
        });

        it('does not throw when a reachable step is clicked with no handler', () => {
            renderNav(undefined);

            expect(() => fireEvent.click(step('build'))).not.toThrow();
        });
    });

    describe('affordances', () => {
        it('marks reachable steps as buttons in the tab order', () => {
            renderNav(jest.fn());

            for (const id of ['welcome', 'build']) {
                expect(step(id)).toHaveAttribute('role', 'button');
                expect(step(id)).toHaveAttribute('tabindex', '0');
                expect(step(id).className).toContain('cursor-pointer');
            }
        });

        it('leaves an upcoming step with no role and out of the tab order', () => {
            renderNav(jest.fn());

            expect(step('review')).not.toHaveAttribute('role');
            expect(step('review')).not.toHaveAttribute('tabindex');
            expect(step('review').className).toContain('cursor-default');
        });

        it('marks only the current step as aria-current', () => {
            renderNav(jest.fn());

            expect(step('build')).toHaveAttribute('aria-current', 'step');
            expect(step('welcome')).not.toHaveAttribute('aria-current');
            expect(step('review')).not.toHaveAttribute('aria-current');
        });
    });

    describe('keyboard', () => {
        it.each([['Enter'], [' ']])('activates a reachable step on %s', (key) => {
            const onStepClick = jest.fn();
            renderNav(onStepClick);

            fireEvent.keyDown(step('welcome'), { key });

            expect(onStepClick).toHaveBeenCalledWith(0);
        });

        it('claims the key press so the surrounding surface does not also act', () => {
            renderNav(jest.fn());

            const handled = fireEvent.keyDown(step('build'), { key: 'Enter' });

            // fireEvent returns false once a listener called preventDefault.
            expect(handled).toBe(false);
        });

        it('ignores any other key', () => {
            const onStepClick = jest.fn();
            renderNav(onStepClick);

            fireEvent.keyDown(step('build'), { key: 'a' });
            fireEvent.keyDown(step('build'), { key: 'Tab' });

            expect(onStepClick).not.toHaveBeenCalled();
        });

        it('does not activate an upcoming step from the keyboard either', () => {
            const onStepClick = jest.fn();
            renderNav(onStepClick);

            fireEvent.keyDown(step('review'), { key: 'Enter' });

            expect(onStepClick).not.toHaveBeenCalled();
        });
    });

    describe('status styling', () => {
        it('shows a completed step as completed and undimmed', () => {
            renderNav(jest.fn());

            const dot = step('welcome').querySelector('.timeline-step-dot');
            expect(dot?.className).toContain('timeline-step-dot-completed');
            expect(step('welcome').querySelector('.nav-item-row')?.className).not.toMatch(
                /\bopacity-50\b/,
            );
        });

        it('shows an upcoming step with the upcoming dot', () => {
            renderNav(jest.fn());

            const dot = step('review').querySelector('.timeline-step-dot');
            expect(dot?.className).toContain('timeline-step-dot-upcoming');
        });
    });
});
