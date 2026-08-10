/**
 * StepAreaShell tests
 *
 * The [rail strip / dedicated view] shell that Commerce, Storefront, Integrations and
 * Configure all render. It was hand-inlined at each of those sites; these cases pin the
 * DOM contract the four of them share, because their own suites query it by class
 * (`commerceStepTestHarness` reaches for `.step-nav` / `.step-view-anim`).
 *
 * @jest-environment jsdom
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { StepAreaShell } from '@/core/ui/components/layout/StepAreaShell';

describe('StepAreaShell', () => {
    it('renders the area label inside the nav strip', () => {
        render(<StepAreaShell areaLabel="Commerce">body</StepAreaShell>);
        const label = document.querySelector('.step-nav > .step-nav-area');
        expect(label).toHaveTextContent('Commerce');
    });

    it('renders the rail after the area label when one is given', () => {
        render(
            <StepAreaShell areaLabel="Commerce" rail={<div data-testid="rail" />}>
                body
            </StepAreaShell>,
        );
        const nav = document.querySelector('.step-nav');
        expect(nav?.children).toHaveLength(2);
        expect(nav?.children[0]).toHaveClass('step-nav-area');
        expect(nav?.children[1]).toHaveAttribute('data-testid', 'rail');
    });

    it('renders the strip with only the label when no rail is given (Integrations)', () => {
        render(<StepAreaShell areaLabel="Integrations">body</StepAreaShell>);
        expect(document.querySelector('.step-nav')?.children).toHaveLength(1);
    });

    it('nests the children in .commerce-body > .step-view > .step-view-anim', () => {
        render(<StepAreaShell areaLabel="Commerce">body</StepAreaShell>);
        const anim = document.querySelector('.commerce-body > .step-view > .step-view-anim');
        expect(anim).toHaveTextContent('body');
    });

    it('appends extra view classes after step-view-anim', () => {
        render(
            <StepAreaShell areaLabel="Integrations" viewClassName="int-results int-results--empty">
                body
            </StepAreaShell>,
        );
        expect(document.querySelector('.step-view-anim')?.className).toBe(
            'step-view-anim int-results int-results--empty',
        );
    });

    it('remounts the view when viewKey changes, so the crossfade replays', () => {
        // A stateful child proves a REMOUNT rather than a re-render: its state resets
        // only if React threw the element away.
        function Counter() {
            const [n] = React.useState(() => Counter.instances++);
            return <span data-testid="instance">{n}</span>;
        }
        Counter.instances = 0;

        const { rerender } = render(
            <StepAreaShell areaLabel="Commerce" viewKey="a">
                <Counter />
            </StepAreaShell>,
        );
        expect(screen.getByTestId('instance')).toHaveTextContent('0');

        rerender(
            <StepAreaShell areaLabel="Commerce" viewKey="a">
                <Counter />
            </StepAreaShell>,
        );
        expect(screen.getByTestId('instance')).toHaveTextContent('0');

        rerender(
            <StepAreaShell areaLabel="Commerce" viewKey="b">
                <Counter />
            </StepAreaShell>,
        );
        expect(screen.getByTestId('instance')).toHaveTextContent('1');
    });
});
