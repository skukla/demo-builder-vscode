/**
 * The progress window while it runs: the room for three lines is kept, and what is there sits
 * level, so nothing blank rides under the spinner (measured in a browser, 42 above and 73 below
 * on "Starting", before row 3 stopped being a blank). A browser measures the levelling; this pins
 * the markup it depends on, over the real LoadingDisplay.
 */

import '@testing-library/jest-dom';

import { render, screen } from '@testing-library/react';
import React from 'react';
import { OperationProgressBody, keepsRows, progressFrame } from '@/core/ui/components/feedback/OperationProgressBody';
import type { OperationRow } from '@/types/webviewPayloads';
import { SAVE_WRITING } from '../../../../helpers/operationRowFixtures';
import { plain } from '@/core/utils/plainText';

const STARTED = 1_000_000;

function renderRunning(extra: Partial<React.ComponentProps<typeof OperationProgressBody>> = {}) {
    return render(<OperationProgressBody failed={false} succeeded={false} onTyped={jest.fn()} {...extra} />);
}

describe('OperationProgressBody, running', () => {
    beforeEach(() => {
        jest.setSystemTime(STARTED);
    });

    // Owner, 2026-11-16: "It shouldn't shift." Rows 2 and 3 hold their room before their words come,
    // over the 2026-11-01 rule that kept no blank row under "Starting".
    it('holds rows 2 and 3 under "Starting", before any word from the run, so nothing shifts', () => {
        const { container } = renderRunning();

        expect(screen.getByText('Preparing')).toBeInTheDocument();
        expect(container.querySelectorAll('.loading-display-row')).toHaveLength(3);
    });

    it('holds the time row under a step before its first second', () => {
        const { container } = renderRunning({ progress: { id: 'x', state: 'running', stage: 'Clearing products', step: '240 of 1,284' } });

        expect(screen.getByText('240 of 1,284')).toBeInTheDocument();
        expect(container.querySelector('.text-xs')).not.toBeNull();
    });

    it('CONTROL: draws the third row once it has words', () => {
        const { container } = renderRunning({ progress: { id: 'x', state: 'running', stage: 'Deploying', expectation: 'Usually about 2 minutes' } });

        expect(container.querySelector('.text-xs')).toHaveTextContent('Usually about 2 minutes');
    });

    it('draws what the run acts on inside the wait, so the spinner levels around it', () => {
        const { container } = renderRunning({ subject: 'Tailspin Test Store US' });

        expect(container.querySelector('.modal-wait-progress-subject > .modal-progress-subject')).toHaveTextContent('Tailspin Test Store US');
    });

    it('CONTROL: without a subject the wait is the plain one', () => {
        const { container } = renderRunning();

        expect(container.querySelector('.modal-wait-progress')).not.toBeNull();
        expect(container.querySelector('.modal-wait-progress-subject')).toBeNull();
    });
});

// Walk F91 asked for more than one line over a save's minutes of reading; since 2026-11-16 (owner:
// one project's run is the centred view) the part under way and its count are those lines, and the
// rows come back only for how the run ended.
describe('OperationProgressBody, a run with rows', () => {
    const ROWS: OperationRow[] = [
        { kind: 'categories', label: 'Categories', status: 'success', line: 'Done' },
        { kind: 'products', label: 'Products', status: 'checking', line: 'Reading' },
    ];

    it('says the part under way, centred, in place of a list of rows while it runs', () => {
        const { container } = renderRunning({ progress: { id: 'x', state: 'running', stage: 'Reading from Commerce', step: '0 of 1 data type', rows: ROWS } });

        expect(screen.queryByTestId('operation-rows')).not.toBeInTheDocument();
        expect(container.querySelector('.modal-wait-progress')).toHaveTextContent('Reading');
        // The row done is not listed while it runs.
        expect(screen.queryByText('Categories')).not.toBeInTheDocument();
    });

    // Review, 2026-11-10: a clean run's rows say nothing the outcome does not. Owner, 2026-11-17
    // (walk F222): the window keeps the run's size, so its "Took …" stays under the sentence.
    it('ends a clean run on its outcome and sentence, no rows, with Took', () => {
        const ended = ROWS.map((row) => ({ ...row, status: 'success' as const, line: 'Done' }));
        render(<OperationProgressBody failed={false} succeeded onTyped={jest.fn()} ending={{ status: 'success', outcome: 'Saved' }} successMessage="Saved a new version of My Luma." progress={{ id: 'x', state: 'succeeded', rows: ended, tookMs: 240_000 }} />);

        expect(screen.getByText('Saved')).toHaveClass('result-outcome');
        expect(screen.getByText('Saved a new version of My Luma.')).toHaveClass('result-reason');
        expect(screen.queryByText('Products')).not.toBeInTheDocument();
        expect(screen.getByText('Took 4 minutes')).toBeInTheDocument();
    });

    it('CONTROL: a run that ends with a warning keeps its rows', () => {
        const ended = ROWS.map((row) => ({ ...row, status: 'success' as const, line: 'Done' }));
        render(<OperationProgressBody failed={false} succeeded onTyped={jest.fn()} successMessage="Saved, with a gap." progress={{ id: 'x', state: 'succeeded', warning: plain('Saved, with a gap.'), rows: ended }} />);

        expect(screen.getByText('Products')).toBeInTheDocument();
    });

    // Plan step-03 S1: the save's rule looked only at `warning`, so a row's problem with no
    // warning ended small and hid the problem.
    it('keeps the rows of a run that ends with a problem on one row and no warning', () => {
        const ended: OperationRow[] = [
            { kind: 'categories', label: 'Categories', status: 'success', line: 'Done' },
            { kind: 'products', label: 'Products', status: 'warning', problem: { text: plain('3 products had no price'), failed: false } },
        ];
        render(<OperationProgressBody failed={false} succeeded onTyped={jest.fn()} successMessage="Saved a new version of My Luma." progress={{ id: 'x', state: 'succeeded', rows: ended, tookMs: 240_000 }} />);

        expect(screen.getByText('Products')).toBeInTheDocument();
        expect(screen.getByText('Took 4 minutes')).toBeInTheDocument();
    });

    // Decisions Phase 1b (J1-3d growth, owner 2026-11-11): one height from first frame to last. The
    // closing sentence under the rows repeated the row's problem and grew the window; it is gone,
    // and the problem sits on its row, in the room the row's line held.
    it('ends with a row carrying its problem and no closing sentence under the rows', () => {
        const ended: OperationRow[] = [
            { kind: 'products', label: 'Products', status: 'success', line: 'Done' },
            { kind: 'settings', label: 'Website Settings', status: 'warning', problem: { text: plain('1 list setting needs resetting in the Commerce Admin.'), failed: false } },
        ];
        const { container } = render(
            <OperationProgressBody failed={false} succeeded onTyped={jest.fn()} successMessage="Some of it needs the Commerce Admin. Cleared My Luma." progress={{ id: 'x', state: 'succeeded', warning: plain('Some of it needs the Commerce Admin.'), rows: ended, tookMs: 240_000 }} />,
        );

        expect(screen.queryByText('Some of it needs the Commerce Admin. Cleared My Luma.')).not.toBeInTheDocument();
        expect(container.querySelector('.lead-text')).toBeNull();
        expect(screen.getByText('1 list setting needs resetting in the Commerce Admin.')).toHaveClass('work-row-problem');
        expect(screen.getByText('Took 4 minutes')).toBeInTheDocument();
    });

    it('CONTROL: a warning no row carries still says itself under the rows', () => {
        const ended = ROWS.map((row) => ({ ...row, status: 'success' as const, line: 'Done' }));
        render(<OperationProgressBody failed={false} succeeded onTyped={jest.fn()} successMessage="Saved, with a gap." progress={{ id: 'x', state: 'succeeded', warning: plain('Saved, with a gap.'), rows: ended }} />);

        expect(screen.getByText('Saved, with a gap.')).toBeInTheDocument();
    });

    it('CONTROL: a run with no rows keeps its one spinner and its line', () => {
        renderRunning({ progress: { id: 'x', state: 'running', stage: 'Reading from Commerce', step: '0 of 1 data type' } });

        expect(screen.queryByTestId('operation-rows')).not.toBeInTheDocument();
        expect(screen.getByText('0 of 1 data type')).toBeInTheDocument();
    });
});

// Owner, 2026-11-17 (walk F222): a result names the thing in the title and draws what happened in
// the body, the wizard's way: a large mark, the outcome in bold, the reason under it.
describe('OperationProgressBody, how it ended', () => {
    it('draws the outcome under its large mark', () => {
        const { container } = render(<OperationProgressBody failed={false} succeeded onTyped={jest.fn()} ending={{ status: 'success', outcome: 'Republished' }} progress={{ id: 'x', state: 'succeeded' }} />);

        expect(container.querySelector('.result-mark')).toHaveAttribute('data-status', 'success');
        expect(screen.getByText('Republished')).toHaveClass('result-outcome');
    });

    it('draws a failure red, its reason centred under the outcome', () => {
        const { container } = render(<OperationProgressBody failed succeeded={false} onTyped={jest.fn()} ending={{ status: 'error', outcome: "Couldn't Republish" }} progress={{ id: 'x', state: 'failed', error: plain('Adobe refused this.') }} />);

        expect(container.querySelector('.result-mark')).toHaveAttribute('data-status', 'error');
        expect(screen.getByText("Couldn't Republish")).toHaveClass('result-outcome');
        expect(screen.getByText('Adobe refused this.')).toHaveClass('result-reason');
    });

    it('frames the end with the thing as the title and the outcome for the body', () => {
        const base = { title: 'Republishing Storefront', thing: 'Storefront', successTitle: 'Storefront Republished', failureTitle: "Couldn't Republish the Storefront", ending: { rows: [] } };

        expect(progressFrame({ ...base, failed: false, succeeded: true })).toEqual({ title: 'Storefront', status: 'success', outcome: 'Republished' });
        expect(progressFrame({ ...base, failed: true, succeeded: false })).toEqual({ title: 'Storefront', status: 'error', outcome: "Couldn't Republish" });
        expect(progressFrame({ ...base, failed: false, succeeded: false })).toEqual({ title: 'Republishing Storefront' });
    });
});

// Phase 7b (decisions.md): the save is two steps, the data types nested under Export from Commerce,
// drawn as the import's window draws its steps (`StepRows`).
describe('OperationProgressBody, a run whose rows are steps with rows under them', () => {
    it('says the step under way, centred, while it runs: no list of steps or their data types', () => {
        const { container } = renderRunning({ progress: { id: 'x', state: 'running', rows: SAVE_WRITING } });

        expect(container.querySelector('.modal-wait-progress')).toHaveTextContent('Saving to My Datapacks');
        expect(screen.queryByText('Export from Commerce')).not.toBeInTheDocument();
        expect(container.querySelector('.step-rows-nested')).toBeNull();
    });

    // Walk F194 (2026-11-17): a save of categories alone reads them, then passes the reads it has no
    // types for, with no step under way and the run's stage set: line 2 went blank for a second or
    // two before "Saving to My Datapacks".
    it('keeps both lines through a push with no step under way, though the run names its stage', () => {
        const save: OperationRow = { kind: 'save', label: 'Save My Luma', status: 'pending', line: 'Waiting' };
        const reading: OperationRow[] = [
            { kind: 'export', label: 'Export from Commerce', status: 'checking', line: '0 of 1 data type', types: [{ kind: 'categories', label: 'Categories', status: 'checking', line: 'Exporting' }] },
            save,
        ];
        const between: OperationRow[] = [
            { kind: 'export', label: 'Export from Commerce', status: 'success', line: 'Exported', types: [{ kind: 'categories', label: 'Categories', status: 'success', line: 'Done' }] },
            save,
        ];
        const { container, rerender } = renderRunning({ progress: { id: 'x', state: 'running', stage: 'Exporting from Commerce', rows: reading } });
        const before = container.querySelector('.modal-wait-progress')?.textContent;

        rerender(<OperationProgressBody failed={false} succeeded={false} onTyped={jest.fn()} progress={{ id: 'x', state: 'running', stage: 'Exporting from Commerce', rows: between }} />);

        expect(before).toContain('Categories');
        expect(container.querySelector('.modal-wait-progress')?.textContent).toBe(before);
    });

    // Decisions Phase 1b (J1-3d growth): the reason was a sentence under the steps, a line nothing
    // held. It takes the stopped step's line instead, once, red.
    it('ends a failed run on its steps, the reason on the stopped step in place of its line', () => {
        const stopped: OperationRow[] = [SAVE_WRITING[0] as OperationRow, { kind: 'save', label: 'Save My Luma', status: 'error', line: 'Stopped' }];
        const { container } = render(<OperationProgressBody failed succeeded={false} onTyped={jest.fn()} progress={{ id: 'x', state: 'failed', error: plain('My Luma could not be saved.'), rows: stopped }} />);

        expect(screen.queryByText('Stopped')).not.toBeInTheDocument();
        expect(screen.getAllByText('My Luma could not be saved.')).toHaveLength(1);
        expect(screen.getByText('My Luma could not be saved.')).toHaveClass('work-row-problem', 'text-negative');
        expect(container.querySelector('.lead-text')).toBeNull();
    });

    it('CONTROL: a failure a row already says is not said again', () => {
        const stopped: OperationRow[] = [{ kind: 'save', label: 'Save My Luma', status: 'error', problem: { text: plain('Commerce refused.'), failed: true } }];
        render(<OperationProgressBody failed succeeded={false} onTyped={jest.fn()} progress={{ id: 'x', state: 'failed', error: plain('My Luma could not be saved.'), rows: stopped }} />);

        expect(screen.getByText('Commerce refused.')).toBeInTheDocument();
        expect(screen.queryByText('My Luma could not be saved.')).not.toBeInTheDocument();
    });

    it('keeps the rows of a run that succeeded with a problem on a nested row', () => {
        const [exported, save] = SAVE_WRITING as [OperationRow, OperationRow];
        const ended: OperationRow[] = [
            { ...exported, types: [{ kind: 'products', label: 'Products', status: 'warning', problem: { text: plain('3 products had no price'), failed: false } }] },
            { ...save, status: 'success', line: 'Saved' },
        ];

        expect(keepsRows({ id: 'x', state: 'succeeded', rows: ended })).toBe(true);
    });

    it('CONTROL: a clean run of steps leaves its rows out', () => {
        const [exported, save] = SAVE_WRITING as [OperationRow, OperationRow];

        expect(keepsRows({ id: 'x', state: 'succeeded', rows: [exported, { ...save, status: 'success', line: 'Saved' }] })).toBe(false);
    });
});
