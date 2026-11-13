/**
 * StepRows: a run's steps, one `WorkRow` each, with a step's nested rows (`OperationRow.types`)
 * small, in columns, under it. Moved out of `ImportRunView` (step-04 R3); the job window's suites
 * still pin how the import's window draws them.
 */

import { render, screen } from '@testing-library/react';
import React from 'react';
import { StepRows } from '@/core/ui/components/feedback/StepRows';
import { FAILED_STEP, STEP_WITH_TYPES } from '../../../../helpers/operationRowFixtures';

jest.mock('@/core/ui/components/feedback/StepStatusIcon', () => ({
    StepStatusIcon: ({ status }: { status: string }) => <span data-testid="icon">{status}</span>,
}));

describe('StepRows', () => {
    it('draws one row per step, in order, with its line under its name', () => {
        const { container } = render(
            <StepRows steps={[STEP_WITH_TYPES, FAILED_STEP]} columns={1} />
        );

        const steps = Array.from(container.children).filter((el) =>
            el.classList.contains('work-row')
        );
        expect(steps.map((el) => el.querySelector('.checkbox-row-label')?.textContent)).toEqual([
            'Install My Luma',
            'Verify the Import',
        ]);
        expect(screen.getByText('Installing')).toHaveClass('work-row-detail');
    });

    it("draws a step's nested rows dense, in the columns asked for", () => {
        const { container } = render(<StepRows steps={[STEP_WITH_TYPES]} columns={2} />);

        const nested = container.querySelector('.import-step-types .work-row-columns');
        expect(nested).toHaveClass('work-row-columns--dense');
        expect(nested?.querySelectorAll('.work-row-column')).toHaveLength(2);
        expect(nested?.querySelectorAll('.work-row')).toHaveLength(3);
        // Dense: only the working row keeps its line.
        expect(screen.getByText('Installing 1,200 of 2,046')).toBeInTheDocument();
        expect(screen.queryByText('12 Categories')).not.toBeInTheDocument();
    });

    it('draws no nested block for a step without nested rows, and a failed step its problem in red', () => {
        const { container } = render(
            <StepRows steps={[FAILED_STEP, { ...STEP_WITH_TYPES, types: [] }]} columns={1} />
        );

        expect(container.querySelector('.import-step-types')).toBeNull();
        expect(screen.getByText('Commerce did not answer.')).toHaveClass(
            'dialog-problem',
            'text-negative'
        );
    });

    it('draws a problem that went in orange', () => {
        render(
            <StepRows
                steps={[
                    {
                        ...FAILED_STEP,
                        status: 'warning',
                        problem: { text: 'Some skipped.', failed: false },
                    },
                ]}
                columns={1}
            />
        );

        expect(screen.getByText('Some skipped.')).toHaveClass('dialog-problem', 'text-notice');
    });
});
