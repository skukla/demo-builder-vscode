/**
 * WorkRow: every row is two lines, its name and then where it stands, so a list of work keeps one
 * height from start to end (owner, 2026-11-04: a running row grew a line and shifted the rows under
 * it, and a step beside the name was the only row of a different shape).
 */

import { render, screen } from '@testing-library/react';
import React from 'react';
import { WorkRow } from '@/core/ui/components/feedback/WorkRow';
import { ruleFor } from '../../../../helpers/cssRules';

jest.mock('@/core/ui/components/feedback/StepStatusIcon', () => ({
    StepStatusIcon: ({ status }: { status: string }) => <span data-testid="icon">{status}</span>,
}));

describe('WorkRow', () => {
    it('draws the detail as its own line under the name', () => {
        const { container } = render(<WorkRow status="checking" label="scratch-1028" detail="Publishing code" />);

        const text = container.querySelector('.work-row-text') as HTMLElement;
        expect(Array.from(text.children).map((child) => [child.className, child.textContent])).toEqual([
            ['checkbox-row-label', 'scratch-1028'],
            ['work-row-detail', 'Publishing code'],
        ]);
    });

    // Beside the name it times, not at the dialog's far edge (owner, 2026-11-04: in a one-row
    // window the time floated 700px from its name).
    it('draws a time right after the name, on its line', () => {
        const { container } = render(<WorkRow status="checking" label="A" detail="Working" time="12 seconds" />);

        const name = container.querySelector('.checkbox-row-label') as HTMLElement;
        expect(name.nextElementSibling).toHaveClass('work-row-time');
        expect(name.nextElementSibling).toHaveTextContent('12 seconds');
    });

    it('puts a failure on the line under the name, in its own colour', () => {
        render(<WorkRow status="error" label="justrite" note="The sign-in was cancelled." why />);

        expect(screen.getByText('The sign-in was cancelled.')).toHaveClass('work-row-why');
    });
});

// A hairline between rows, as the integration flyout draws its rows, and a finished row's name in
// the grey of its line (owner, 2026-11-04). Asserted against the stylesheet: jsdom has no layout.
describe('a list of work rows', () => {
    it('draws a hairline between rows, never above the first', () => {
        expect(ruleFor('.work-row + .work-row, .work-row-list > li + li > .work-row')).toMatch(/border-top:\s*1px solid/);
        expect(ruleFor('.work-row')).not.toMatch(/border/);
    });

    it("greys a finished row's name", () => {
        expect(ruleFor(".work-row[data-state='done'] .checkbox-row-label")).toMatch(/color:\s*var\(--spectrum-global-color-gray-600\)/);
    });
});
