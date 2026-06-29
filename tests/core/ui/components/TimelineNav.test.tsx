/**
 * TimelineNav Component Tests
 *
 * Covers the flat (existing) timeline behavior plus the additive single-level
 * nested sub-step rendering used by the nested "Build Your Project" builder.
 *
 * Nested behavior contract (Slice 1):
 *  - `children` render as an indented sub-list ONLY beneath the parent whose
 *    status is `current` (one level, no recursion).
 *  - Each child reuses the existing status -> dot mapping keyed off
 *    `childStatusById[child.id]` (default `upcoming`); `activeChildId` gets the
 *    active/current styling.
 *  - Clicking a child calls `onChildClick(childId)` and MUST NOT call
 *    `onStepClick` or alter parent navigation (load-bearing independence).
 *  - With no `children` the markup is unchanged for existing callers (flat list,
 *    including the sidebar `compact` consumer).
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { Provider, defaultTheme } from '@adobe/react-spectrum';
import '@testing-library/jest-dom';
import { TimelineNav, type TimelineStep } from '@/core/ui/components/TimelineNav';

// Helper to render with Spectrum Provider
const renderWithProvider = (ui: React.ReactElement) => {
    return render(
        <Provider theme={defaultTheme}>
            {ui}
        </Provider>
    );
};

const STEPS: TimelineStep[] = [
    { id: 'welcome', name: 'Welcome' },
    { id: 'build', name: 'Build Your Project' },
    { id: 'review', name: 'Review' },
];

const CHILDREN: TimelineStep[] = [
    { id: 'commerce', name: 'Commerce' },
    { id: 'storefront', name: 'Storefront' },
    { id: 'integrations', name: 'Integrations' },
];

describe('TimelineNav', () => {
    describe('flat rendering (backward compatible)', () => {
        it('renders all step labels when no children are provided', () => {
            renderWithProvider(
                <TimelineNav
                    steps={STEPS}
                    currentStepIndex={1}
                    completedStepIndices={[0]}
                />
            );

            expect(screen.getByText('Welcome')).toBeInTheDocument();
            expect(screen.getByText('Build Your Project')).toBeInTheDocument();
            expect(screen.getByText('Review')).toBeInTheDocument();
        });

        it('renders no child elements when children are not provided', () => {
            const { container } = renderWithProvider(
                <TimelineNav
                    steps={STEPS}
                    currentStepIndex={1}
                    completedStepIndices={[0]}
                />
            );

            expect(
                container.querySelector('[data-testid^="timeline-children-"]')
            ).toBeNull();
            expect(
                container.querySelector('[data-testid^="timeline-child-"]')
            ).toBeNull();
        });

        it('renders no child elements when children is an empty array', () => {
            const { container } = renderWithProvider(
                <TimelineNav
                    steps={STEPS}
                    currentStepIndex={1}
                    completedStepIndices={[0]}
                    childSteps={[]}
                />
            );

            expect(
                container.querySelector('[data-testid^="timeline-child-"]')
            ).toBeNull();
        });

        it('renders the existing step testids', () => {
            renderWithProvider(
                <TimelineNav
                    steps={STEPS}
                    currentStepIndex={1}
                    completedStepIndices={[0]}
                />
            );

            expect(screen.getByTestId('timeline-step-welcome')).toBeInTheDocument();
            expect(screen.getByTestId('timeline-step-build')).toBeInTheDocument();
            expect(screen.getByTestId('timeline-step-review')).toBeInTheDocument();
        });
    });

    describe('nested sub-steps (additive)', () => {
        it('renders children only beneath the current parent step', () => {
            renderWithProvider(
                <TimelineNav
                    steps={STEPS}
                    currentStepIndex={1}
                    completedStepIndices={[0]}
                    childSteps={CHILDREN}
                />
            );

            // Children belong to the current parent ("build")
            expect(screen.getByTestId('timeline-children-build')).toBeInTheDocument();
            expect(screen.getByTestId('timeline-child-commerce')).toBeInTheDocument();
            expect(screen.getByTestId('timeline-child-storefront')).toBeInTheDocument();
            expect(screen.getByTestId('timeline-child-integrations')).toBeInTheDocument();
        });

        it('does not render children beneath completed or upcoming parents', () => {
            const { container } = renderWithProvider(
                <TimelineNav
                    steps={STEPS}
                    currentStepIndex={1}
                    completedStepIndices={[0]}
                    childSteps={CHILDREN}
                />
            );

            // Only one child sub-list exists, attached to the current parent
            const childLists = container.querySelectorAll(
                '[data-testid^="timeline-children-"]'
            );
            expect(childLists).toHaveLength(1);
            expect(childLists[0]).toHaveAttribute('data-testid', 'timeline-children-build');

            // No child list under completed parent ("welcome") or upcoming ("review")
            expect(
                container.querySelector('[data-testid="timeline-children-welcome"]')
            ).toBeNull();
            expect(
                container.querySelector('[data-testid="timeline-children-review"]')
            ).toBeNull();
        });

        it('renders child labels', () => {
            renderWithProvider(
                <TimelineNav
                    steps={STEPS}
                    currentStepIndex={1}
                    completedStepIndices={[0]}
                    childSteps={CHILDREN}
                />
            );

            expect(screen.getByText('Commerce')).toBeInTheDocument();
            expect(screen.getByText('Storefront')).toBeInTheDocument();
            expect(screen.getByText('Integrations')).toBeInTheDocument();
        });

        it('tiers a completed child label via childStatusById (done modifier)', () => {
            renderWithProvider(
                <TimelineNav
                    steps={STEPS}
                    currentStepIndex={1}
                    completedStepIndices={[0]}
                    childSteps={CHILDREN}
                    childStatusById={{ commerce: 'completed' }}
                />
            );

            const completedChild = screen.getByTestId('timeline-child-commerce');
            expect(completedChild).toHaveClass('timeline-child--done');
            expect(completedChild).not.toHaveClass('timeline-child--active');
        });

        it('leaves children without an explicit status quiet (no done/active modifier)', () => {
            renderWithProvider(
                <TimelineNav
                    steps={STEPS}
                    currentStepIndex={1}
                    completedStepIndices={[0]}
                    childSteps={CHILDREN}
                    childStatusById={{ commerce: 'completed' }}
                />
            );

            const upcomingChild = screen.getByTestId('timeline-child-storefront');
            expect(upcomingChild).not.toHaveClass('timeline-child--done');
            expect(upcomingChild).not.toHaveClass('timeline-child--active');
        });

        it('applies active styling (accent bar modifier) to the activeChildId child', () => {
            renderWithProvider(
                <TimelineNav
                    steps={STEPS}
                    currentStepIndex={1}
                    completedStepIndices={[0]}
                    childSteps={CHILDREN}
                    activeChildId="storefront"
                />
            );

            const activeChild = screen.getByTestId('timeline-child-storefront');
            expect(activeChild).toHaveClass('timeline-child--active');
        });

        it('renders sub-items as quiet labels with NO dots/checkmarks', () => {
            renderWithProvider(
                <TimelineNav
                    steps={STEPS}
                    currentStepIndex={1}
                    completedStepIndices={[0]}
                    childSteps={CHILDREN}
                    childStatusById={{ commerce: 'completed' }}
                    activeChildId="storefront"
                />
            );

            const child = screen.getByTestId('timeline-child-commerce');
            // No per-child indicator dots anymore (the active accent bar + weight carry it).
            expect(child.querySelector('.timeline-step-dot')).toBeNull();
            expect(child.querySelector('.timeline-child-dot')).toBeNull();
        });
    });

    describe('child interaction independence', () => {
        it('calls onChildClick with the child id when a child is clicked', () => {
            const onChildClick = jest.fn();
            const onStepClick = jest.fn();

            renderWithProvider(
                <TimelineNav
                    steps={STEPS}
                    currentStepIndex={1}
                    completedStepIndices={[0]}
                    childSteps={CHILDREN}
                    onChildClick={onChildClick}
                    onStepClick={onStepClick}
                />
            );

            fireEvent.click(screen.getByTestId('timeline-child-storefront'));

            expect(onChildClick).toHaveBeenCalledTimes(1);
            expect(onChildClick).toHaveBeenCalledWith('storefront');
        });

        it('does NOT call onStepClick when a child is clicked', () => {
            const onChildClick = jest.fn();
            const onStepClick = jest.fn();

            renderWithProvider(
                <TimelineNav
                    steps={STEPS}
                    currentStepIndex={1}
                    completedStepIndices={[0]}
                    childSteps={CHILDREN}
                    onChildClick={onChildClick}
                    onStepClick={onStepClick}
                />
            );

            fireEvent.click(screen.getByTestId('timeline-child-commerce'));

            expect(onStepClick).not.toHaveBeenCalled();
        });

        it('does not throw when a child is clicked without an onChildClick handler', () => {
            renderWithProvider(
                <TimelineNav
                    steps={STEPS}
                    currentStepIndex={1}
                    completedStepIndices={[0]}
                    childSteps={CHILDREN}
                />
            );

            expect(() =>
                fireEvent.click(screen.getByTestId('timeline-child-commerce'))
            ).not.toThrow();
        });
    });

    describe('compact (sidebar) mode', () => {
        it('renders the flat step list in compact mode', () => {
            renderWithProvider(
                <TimelineNav
                    steps={STEPS}
                    currentStepIndex={1}
                    completedStepIndices={[0]}
                    compact
                />
            );

            expect(screen.getByText('Welcome')).toBeInTheDocument();
            expect(screen.getByText('Build Your Project')).toBeInTheDocument();
            expect(screen.getByText('Review')).toBeInTheDocument();
        });

        it('renders nested children in compact mode beneath the current parent', () => {
            renderWithProvider(
                <TimelineNav
                    steps={STEPS}
                    currentStepIndex={1}
                    completedStepIndices={[0]}
                    compact
                    childSteps={CHILDREN}
                />
            );

            expect(screen.getByTestId('timeline-children-build')).toBeInTheDocument();
            expect(screen.getByText('Commerce')).toBeInTheDocument();
        });
    });
});
