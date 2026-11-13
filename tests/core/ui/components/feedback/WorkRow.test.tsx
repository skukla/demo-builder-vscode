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

    // Decisions Phase 1b (J1-3d build item, owner 2026-11-11): a warning's note is orange, as the
    // dialog rules say ("Orange for a warning, red for a failure"), not grey.
    it("draws a warning row's note orange, as the house's warning line", () => {
        render(<WorkRow status="warning" label="Website Settings" note="Left as it is." />);

        const note = screen.getByText('Left as it is.');
        expect(note).toHaveClass('dialog-problem', 'text-notice');
        expect(note).not.toHaveClass('work-row-note');
    });

    it("CONTROL: a finished row's note stays the quiet grey one", () => {
        render(<WorkRow status="success" label="Blocks" note="One block left out." />);

        expect(screen.getByText('One block left out.')).toHaveClass('work-row-note');
        expect(screen.getByText('One block left out.')).not.toHaveClass('text-notice');
    });

    it('CONTROL: a failed warning-iconed row still says why in red', () => {
        render(<WorkRow status="warning" label="A" note="Refused." why />);

        expect(screen.getByText('Refused.')).toHaveClass('work-row-why');
    });
});

// Decisions Phase 1b (J1-3d growth, owner 2026-11-11): the progress window keeps one height from
// first frame to last, so a row's problem takes the room its progress line held, never a line of
// its own, and fits one line. jsdom has no layout: this pins the slot and the rule that clips it.
describe("a work row's problem", () => {
    it('takes the second line in place of the progress line, never beside it', () => {
        const { container } = render(
            <WorkRow status="warning" label="Website Settings" detail="Resetting 4 of 7" problem={{ text: '2 list settings need resetting.', failed: false }} />,
        );

        const text = container.querySelector('.work-row-text') as HTMLElement;
        expect(Array.from(text.children).map((child) => child.textContent)).toEqual([
            'Website Settings',
            '2 list settings need resetting.',
        ]);
        expect(screen.queryByText('Resetting 4 of 7')).not.toBeInTheDocument();
    });

    it('is orange when it went in with a problem and red when it failed', () => {
        render(
            <>
                <WorkRow status="warning" label="A" problem={{ text: 'Some skipped.', failed: false }} />
                <WorkRow status="error" label="B" problem={{ text: 'Commerce refused.', failed: true }} />
            </>,
        );

        expect(screen.getByText('Some skipped.')).toHaveClass('dialog-problem', 'text-notice', 'work-row-problem');
        expect(screen.getByText('Commerce refused.')).toHaveClass('dialog-problem', 'text-negative', 'work-row-problem');
    });

    it('fits one line, cut short with its whole text on hover', () => {
        render(<WorkRow status="warning" label="A" problem={{ text: 'A long reason.', failed: false }} />);

        expect(screen.getByText('A long reason.')).toHaveAttribute('title', 'A long reason.');
        const rule = ruleFor('.work-row:not(.work-row--dense) .work-row-problem');
        expect(rule).toMatch(/white-space:\s*nowrap/);
        expect(rule).toMatch(/overflow:\s*hidden/);
        expect(rule).toMatch(/text-overflow:\s*ellipsis/);
    });

    it('CONTROL: a row without a problem keeps its progress line', () => {
        render(<WorkRow status="checking" label="Products" detail="Removing 1,026 of 2,052" />);

        expect(screen.getByText('Removing 1,026 of 2,052')).toHaveClass('work-row-detail');
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

// A dense row is the import's data types under Install (owner, 2026-11-10, walks F132, F133, F135):
// the name alone, and the working row's words on a second line under it.
describe('a dense row', () => {
    it('puts its detail on a second line under the name, never beside it', () => {
        const { container } = render(<WorkRow status="checking" label="Products" detail="Installing 1,200 of 2,046" dense />);

        const text = container.querySelector('.work-row-text') as HTMLElement;
        expect(Array.from(text.children).map((child) => [child.className, child.textContent])).toEqual([
            ['checkbox-row-label', 'Products'],
            ['work-row-doing', 'Installing 1,200 of 2,046'],
        ]);
    });

    it('is the name alone without a detail', () => {
        const { container } = render(<WorkRow status="success" label="Categories" dense />);

        expect(container.querySelector('.work-row-text')?.children).toHaveLength(1);
    });

    it('never wraps or cuts a line short, and holds room for the second line in every column', () => {
        expect(ruleFor('.work-row--dense .work-row-text')).toMatch(/white-space:\s*nowrap/);
        expect(ruleFor('.work-row--dense .work-row-text')).not.toMatch(/overflow|ellipsis/);
        expect(ruleFor('.work-row-doing')).toMatch(/line-height:\s*16px/);
        expect(ruleFor('.work-row-columns--dense > .work-row-column')).toMatch(/padding-bottom:\s*16px/);
        expect(ruleFor('.work-row-columns--dense > .work-row-column--working')).toMatch(/padding-bottom:\s*0/);
        expect(ruleFor('.work-row-columns--dense')).toMatch(/grid-auto-columns:\s*minmax\(max-content, 1fr\)/);
    });
});
