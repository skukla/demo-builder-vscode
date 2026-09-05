/**
 * TimelineNav — the rail's own geometry: header, compact mode, the connector
 * between dots, the spacing between steps, and what changes when the current
 * step opens a set of children beneath it.
 *
 * These are CSS-class and inline-style assertions on purpose. The connector is
 * a positioned element with no text and no role, and the "current step has
 * children" state exists only to move spacing around — so the class names and
 * the margin ARE the behaviour.
 */

import React from 'react';
import { render, screen, act } from '@testing-library/react';
import { Provider, defaultTheme } from '@adobe/react-spectrum';
import '@testing-library/jest-dom';
import { TimelineNav, type TimelineStep } from '@/core/ui/components/TimelineNav';
import { FRONTEND_TIMEOUTS } from '@/core/ui/utils/frontendTimeouts';

const renderWithProvider = (ui: React.ReactElement) =>
    render(<Provider theme={defaultTheme}>{ui}</Provider>);

const STEPS: TimelineStep[] = [
    { id: 'welcome', name: 'Welcome' },
    { id: 'build', name: 'Build Your Project' },
    { id: 'review', name: 'Review' },
];

const CHILDREN: TimelineStep[] = [
    { id: 'commerce', name: 'Commerce' },
    { id: 'storefront', name: 'Storefront' },
];

const STEP_GAP = 'var(--spectrum-global-dimension-size-400)';
const COMPACT_STEP_GAP = 'var(--spectrum-global-dimension-size-300)';

const step = (id: string) => screen.getByTestId(`timeline-step-${id}`);
/** The positioned wrapper around a step — it carries the children-clip class. */
const wrapper = (id: string) => step(id).parentElement as HTMLElement;
const connectors = () => Array.from(document.querySelectorAll('.timeline-connector'));
/** The connector belonging to one step, or null when it is the last one. */
const connectorOf = (id: string) => step(id).querySelector('.timeline-connector');
/** Inline margin-bottom as React wrote it (jsdom keeps custom-property values verbatim). */
const marginBottomOf = (id: string) => step(id).getAttribute('style') ?? '';

describe('TimelineNav - rail geometry', () => {
    describe('header', () => {
        it('shows the default header when nothing says otherwise', () => {
            renderWithProvider(
                <TimelineNav steps={STEPS} currentStepIndex={1} completedStepIndices={[0]} />,
            );

            expect(screen.getByText('Setup Progress')).toBeInTheDocument();
        });

        it('shows a caller-supplied header instead', () => {
            renderWithProvider(
                <TimelineNav
                    steps={STEPS}
                    currentStepIndex={1}
                    completedStepIndices={[0]}
                    headerText="Project Setup"
                />,
            );

            expect(screen.getByText('Project Setup')).toBeInTheDocument();
            expect(screen.queryByText('Setup Progress')).not.toBeInTheDocument();
        });

        it('omits the header entirely when showHeader is false', () => {
            const { container } = renderWithProvider(
                <TimelineNav
                    steps={STEPS}
                    currentStepIndex={1}
                    completedStepIndices={[0]}
                    showHeader={false}
                />,
            );

            expect(screen.queryByText('Setup Progress')).not.toBeInTheDocument();
            expect(container.querySelector('.timeline-header-label')).toBeNull();
        });
    });

    describe('compact (sidebar) mode', () => {
        it('carries only the base container class by default', () => {
            const { container } = renderWithProvider(
                <TimelineNav steps={STEPS} currentStepIndex={1} completedStepIndices={[0]} />,
            );

            const root = container.querySelector('.timeline-container') as HTMLElement;
            expect(root).not.toBeNull();
            expect(root.className).not.toContain('timeline-sidebar');
            expect(marginBottomOf('welcome')).toContain(STEP_GAP);
        });

        it('adds the sidebar class and tightens the step gap when compact', () => {
            const { container } = renderWithProvider(
                <TimelineNav
                    steps={STEPS}
                    currentStepIndex={1}
                    completedStepIndices={[0]}
                    compact
                />,
            );

            const root = container.querySelector('.timeline-container') as HTMLElement;
            expect(root.className).toContain('timeline-sidebar');
            expect(marginBottomOf('welcome')).toContain(COMPACT_STEP_GAP);
        });
    });

    describe('connectors', () => {
        it('draws one connector after every step except the last', () => {
            renderWithProvider(
                <TimelineNav steps={STEPS} currentStepIndex={1} completedStepIndices={[0]} />,
            );

            expect(connectors()).toHaveLength(STEPS.length - 1);
            expect(connectorOf('welcome')).not.toBeNull();
            expect(connectorOf('build')).not.toBeNull();
            expect(connectorOf('review')).toBeNull();
        });

        it('draws no connector at all for a single step', () => {
            renderWithProvider(
                <TimelineNav
                    steps={[STEPS[0]]}
                    currentStepIndex={0}
                    completedStepIndices={[]}
                />,
            );

            expect(connectors()).toHaveLength(0);
        });

        it('marks a completed step’s connector completed and the rest pending', () => {
            renderWithProvider(
                <TimelineNav steps={STEPS} currentStepIndex={1} completedStepIndices={[0]} />,
            );

            expect(connectorOf('welcome')?.className).toContain('timeline-connector-completed');
            expect(connectorOf('welcome')?.className).not.toContain('timeline-connector-pending');
            expect(connectorOf('build')?.className).toContain('timeline-connector-pending');
            expect(connectorOf('build')?.className).not.toContain('timeline-connector-completed');
        });
    });

    describe('step spacing', () => {
        it('spaces every step but the last', () => {
            renderWithProvider(
                <TimelineNav steps={STEPS} currentStepIndex={1} completedStepIndices={[0]} />,
            );

            expect(marginBottomOf('welcome')).toContain(STEP_GAP);
            expect(marginBottomOf('build')).toContain(STEP_GAP);
            expect(marginBottomOf('review')).not.toContain(STEP_GAP);
        });
    });

    describe('the current step with children', () => {
        const renderWithChildren = (childSteps: TimelineStep[]) =>
            renderWithProvider(
                <TimelineNav
                    steps={STEPS}
                    currentStepIndex={1}
                    completedStepIndices={[0]}
                    childSteps={childSteps}
                />,
            );

        it('clips only the current step’s wrapper and stretches only its connector', () => {
            renderWithChildren(CHILDREN);

            expect(wrapper('build').className).toContain('timeline-step-wrap-clip');
            expect(wrapper('welcome').className).not.toContain('timeline-step-wrap-clip');
            expect(wrapper('review').className).not.toContain('timeline-step-wrap-clip');

            expect(connectorOf('build')?.className).toContain('timeline-connector-stretch');
            expect(connectorOf('welcome')?.className).not.toContain('timeline-connector-stretch');
        });

        it('moves the current step’s bottom spacing to the children block', () => {
            renderWithChildren(CHILDREN);

            expect(marginBottomOf('build')).not.toContain(STEP_GAP);
            // Its neighbours keep theirs.
            expect(marginBottomOf('welcome')).toContain(STEP_GAP);
        });

        it('changes nothing when the children array is empty', () => {
            renderWithChildren([]);

            expect(document.querySelectorAll('.timeline-step-wrap-clip')).toHaveLength(0);
            expect(document.querySelectorAll('.timeline-connector-stretch')).toHaveLength(0);
            expect(marginBottomOf('build')).toContain(STEP_GAP);
        });
    });
});

/**
 * Enter/exit animation flags.
 *
 * `useEnterExit` holds animations off for a settle window after mount, so
 * nothing animates on first paint. Past that window a step that appears is
 * flagged for the entrance animation with a staggered delay, and a step that
 * disappears is re-inserted where it was, flagged for the exit animation, and
 * rendered inert while it plays out.
 */
describe('TimelineNav - entering and exiting steps', () => {
    const settle = () => act(() => {
        jest.advanceTimersByTime(FRONTEND_TIMEOUTS.INIT_ANIMATION_DELAY + 1);
    });

    const renderNav = (steps: TimelineStep[], onStepClick?: (i: number) => void) =>
        renderWithProvider(
            <TimelineNav
                steps={steps}
                currentStepIndex={1}
                completedStepIndices={[0]}
                onStepClick={onStepClick}
            />,
        );

    it('animates nothing on first paint', () => {
        renderNav(STEPS);

        expect(document.querySelectorAll('.timeline-step-enter')).toHaveLength(0);
        expect(step('welcome').style.animationDelay).toBe('');
    });

    it('flags a newly added step, and staggers its delay by position', () => {
        const { rerender } = renderNav(STEPS);
        settle();

        const grown = [...STEPS, { id: 'create', name: 'Create Project' }];
        act(() => {
            rerender(
                <Provider theme={defaultTheme}>
                    <TimelineNav steps={grown} currentStepIndex={1} completedStepIndices={[0]} />
                </Provider>,
            );
        });

        expect(step('create').className).toContain('timeline-step-enter');
        // Fourth in the list -> 3 * 40ms.
        expect(step('create').style.animationDelay).toBe('120ms');
        // Steps that were already there are not re-animated.
        expect(step('welcome').className).not.toContain('timeline-step-enter');
        expect(step('welcome').style.animationDelay).toBe('');
    });

    it('keeps a removed step in place, flagged for exit and fully inert', () => {
        const onStepClick = jest.fn();
        const { rerender } = renderNav(STEPS, onStepClick);
        settle();

        act(() => {
            rerender(
                <Provider theme={defaultTheme}>
                    <TimelineNav
                        steps={[STEPS[0], STEPS[2]]}
                        currentStepIndex={1}
                        completedStepIndices={[0]}
                        onStepClick={onStepClick}
                    />
                </Provider>,
            );
        });

        const leaving = step('build');
        expect(leaving.className).toContain('timeline-step-exit');
        expect(leaving.className).toContain('cursor-default');
        expect(leaving).not.toHaveAttribute('role');
        expect(leaving).not.toHaveAttribute('aria-current');
        expect(leaving.querySelector('.timeline-step-dot')?.className).toContain(
            'timeline-step-dot-upcoming',
        );
    });

    it('drops the exiting step once the animation has settled', () => {
        const { rerender } = renderNav(STEPS);
        settle();

        act(() => {
            rerender(
                <Provider theme={defaultTheme}>
                    <TimelineNav
                        steps={[STEPS[0], STEPS[2]]}
                        currentStepIndex={1}
                        completedStepIndices={[0]}
                    />
                </Provider>,
            );
        });
        act(() => {
            jest.advanceTimersByTime(FRONTEND_TIMEOUTS.ANIMATION_SETTLE + 1);
        });

        expect(screen.queryByTestId('timeline-step-build')).toBeNull();
    });
});
