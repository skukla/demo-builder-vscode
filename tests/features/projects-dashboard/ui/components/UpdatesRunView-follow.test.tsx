/**
 * The Updates run follows the work (walk F290, owner 2026-11-18), and says where each
 * project's running step is among its steps (walk F291, 2026-11-19). Each project is a card,
 * the running card is outlined, and each time a row starts the list scrolls just enough to
 * show that row's card. In between it leaves the list where the SC put it.
 *
 * jsdom lays nothing out, so the list's and cards' sizes are set on the elements after
 * render, before the scroll's short delay runs (fake timers, `tests/setup/react.ts`).
 */

import { act, render, screen } from '@testing-library/react';
import React from 'react';
import {
    runningRowOf,
    UpdatesRunView,
} from '@/features/projects-dashboard/ui/components/UpdatesRunView';
import type { RowFixControls, RowStatuses } from '@/features/projects-dashboard/ui/hooks/useUpdatesModal';
import { groupsOf } from '@/features/projects-dashboard/ui/components/updateGroups';
import { AI_HAS_IT } from '@/features/projects-dashboard/ui/components/UpdateRowFix';
import type { PendingUpdateRow } from '@/types/pendingUpdates';
import type { OperationProgressPayload } from '@/types/webviewPayloads';
import { plain } from '@/core/utils/plainText';

/** Three projects, one update each. */
const ROWS: PendingUpdateRow[] = ['Scratch 1028', 'Bodea', 'Scratch 1028 C'].map((title, i) => ({
    id: `blockLibrary:${i}`,
    kind: 'blockLibrary',
    group: { key: `/p/${i}`, title },
    label: `${title} Blocks`,
    detail: 'Newer version',
    ticked: true,
}));

const PROGRESS = { state: 'running' } as OperationProgressPayload;

/** No row being fixed: the run's own buttons are its own suite's. */
const ROW_FIX: RowFixControls = { fixes: {}, retry: jest.fn(), fixWithAi: jest.fn(), checkAgain: jest.fn() };

/** Row i running, the ones before it done, the rest waiting. */
function at(i: number): RowStatuses {
    return Object.fromEntries(
        ROWS.map((row, n) => [
            row.id,
            { id: row.id, state: n < i ? 'done' : n === i ? 'running' : 'waiting' },
        ])
    );
}

/** A list 100px tall, its three cards 80px each, stacked from the top. */
function layOut(container: HTMLElement): { list: HTMLElement; scrollTo: jest.Mock } {
    const list = container.querySelector('.updates-group-list') as HTMLElement;
    const scrollTo = jest.fn();
    Object.defineProperty(list, 'clientHeight', { value: 100, configurable: true });
    Object.defineProperty(list, 'scrollTop', { value: 0, configurable: true });
    list.scrollTo = scrollTo as unknown as HTMLElement['scrollTo'];
    container.querySelectorAll('.updates-group').forEach((card, n) => {
        Object.defineProperty(card, 'offsetTop', { value: n * 88, configurable: true });
        Object.defineProperty(card, 'offsetHeight', { value: 80, configurable: true });
    });
    return { list, scrollTo };
}

function view(statuses: RowStatuses) {
    return (
        <UpdatesRunView
            rows={ROWS}
            statuses={statuses}
            progress={PROGRESS}
            onTyped={jest.fn()}
            remaining={0} rowFix={ROW_FIX}
        />
    );
}

describe('the Updates run follows the work', () => {
    // No outline on the running card: its spinner marks it (owner, 2026-11-19).
    it('draws each project as a card, the running one marked only by its spinner', () => {
        const { container } = render(view(at(1)));

        const cards = Array.from(container.querySelectorAll('.updates-group'));
        expect(cards).toHaveLength(3);
        // Prerequisites' tile, in Prerequisites' box (owner, 2026-11-19).
        expect(cards.map((c) => c.className)).toEqual(['updates-group step-tile', 'updates-group step-tile', 'updates-group step-tile']);
        expect(container.querySelector('.updates-run-list')).toHaveClass('step-tiles');
    });

    it('scrolls the running card into view when it is below the edge', () => {
        const { container, rerender } = render(view(at(0)));
        const { scrollTo } = layOut(container);
        act(() => jest.runOnlyPendingTimers());
        expect(scrollTo).not.toHaveBeenCalled();

        rerender(view(at(2)));
        layOut(container);
        const { scrollTo: after } = layOut(container);
        act(() => jest.runOnlyPendingTimers());

        // Card 3 spans 176 to 256; the list shows 100, so it scrolls to 256 - 100 + 10.
        expect(after).toHaveBeenCalledWith({ top: 166, behavior: 'smooth' });
    });

    it('does not scroll again while the same row is still running', () => {
        const { container, rerender } = render(view(at(2)));
        const { scrollTo } = layOut(container);
        act(() => jest.runOnlyPendingTimers());
        expect(scrollTo).toHaveBeenCalledTimes(1);

        rerender(view(at(2)));
        act(() => jest.runOnlyPendingTimers());

        expect(scrollTo).toHaveBeenCalledTimes(1);
    });
});

describe('runningRowOf', () => {
    it('names the running row and its card, and nothing when no row runs', () => {
        const groups = groupsOf(ROWS);
        expect(runningRowOf(groups, at(1))).toEqual({ id: 'blockLibrary:1', card: 1 });
        expect(runningRowOf(groups, at(3))).toBeUndefined();
    });
});

/** One project with two updates; its local copy told ahead as a third step. */
const TWO: PendingUpdateRow[] = ['Lib A', 'Lib B'].map((label, i) => ({
    id: `blockLibrary:t${i}`,
    kind: 'blockLibrary',
    group: { key: '/p/t', title: 'Tailspin' },
    label,
    detail: 'Newer version',
    ticked: true,
}));
const COPY = 'localCopy:/p/t';

function rowsOf(container: HTMLElement): HTMLElement[] {
    return Array.from(container.querySelectorAll<HTMLElement>('.work-row'));
}

// As Prerequisites says it (owner, 2026-11-19): the running step's place among its project's
// steps, over the shared bar, the local copy counted from the first.
describe("the running step says where it is among its project's steps", () => {
    it('counts the local copy told ahead, and says the step in the bar in place of the line', () => {
        const statuses: RowStatuses = {
            'blockLibrary:t0': { id: 'blockLibrary:t0', state: 'running' },
            [COPY]: { id: COPY, state: 'waiting' },
        };
        const { container } = render(
            <UpdatesRunView
                rows={TWO}
                statuses={statuses}
                progress={{ state: 'running', stage: 'Updating add-ons' } as OperationProgressPayload}
                onTyped={jest.fn()}
                remaining={0} rowFix={ROW_FIX}
            />,
        );

        const [first, second, copy] = rowsOf(container);
        expect(first).toHaveTextContent('Step 1/3: Updating add-ons');
        expect(first.querySelector('[data-testid="spectrum-progressbar"]')).toHaveAttribute('aria-valuenow', '0');
        expect(first.querySelector('.work-row-detail')).toBeNull();
        expect(second).not.toHaveTextContent('Step');
        expect(copy).toHaveTextContent('Your Local Copy');
    });

    it('says the local copy as the last step', () => {
        const statuses: RowStatuses = {
            'blockLibrary:t0': { id: 'blockLibrary:t0', state: 'done' },
            'blockLibrary:t1': { id: 'blockLibrary:t1', state: 'done' },
            [COPY]: { id: COPY, state: 'running' },
        };
        const { container } = render(
            <UpdatesRunView rows={TWO} statuses={statuses} progress={PROGRESS} onTyped={jest.fn()} remaining={0} rowFix={ROW_FIX} />,
        );

        expect(rowsOf(container)[2]).toHaveTextContent('Step 3/3: Updating your local copy');
    });

    it('gives a project with one step no count, only the step', () => {
        const { container } = render(
            <UpdatesRunView
                rows={ROWS.slice(0, 1)}
                statuses={at(0)}
                progress={{ state: 'running', stage: 'Updating add-ons' } as OperationProgressPayload}
                onTyped={jest.fn()}
                remaining={0} rowFix={ROW_FIX}
            />,
        );

        const [row] = rowsOf(container);
        expect(row).toHaveTextContent('Updating add-ons');
        expect(row).not.toHaveTextContent('Step');
        expect(row.querySelector('[data-testid="spectrum-progressbar"]')).toBeNull();
    });

    it('draws no local copy step the run ended without reaching', () => {
        const statuses: RowStatuses = {
            'blockLibrary:t0': { id: 'blockLibrary:t0', state: 'failed', message: plain('No.') },
            'blockLibrary:t1': { id: 'blockLibrary:t1', state: 'failed', message: plain('No.') },
            [COPY]: { id: COPY, state: 'waiting' },
        };
        render(
            <UpdatesRunView
                rows={TWO}
                statuses={statuses}
                progress={{ state: 'succeeded' } as OperationProgressPayload}
                onTyped={jest.fn()}
                remaining={0} rowFix={ROW_FIX}
            />,
        );

        expect(screen.queryByText('Your Local Copy')).toBeNull();
    });

    // A long step says which part is in flight on its own line under the bar, in the house
    // words for a part (`stageLine`; owner, 2026-11-19).
    it('says which part of the step is in flight under the bar', () => {
        const statuses: RowStatuses = {
            'blockLibrary:t0': { id: 'blockLibrary:t0', state: 'done' },
            'blockLibrary:t1': { id: 'blockLibrary:t1', state: 'running' },
            [COPY]: { id: COPY, state: 'waiting' },
        };
        const progress = {
            state: 'running',
            stage: 'Updating integrations',
            step: 'Installing dependencies',
            position: { index: 2, total: 4, name: 'Justrite ERP' },
        } as OperationProgressPayload;
        const { container } = render(
            <UpdatesRunView rows={TWO} statuses={statuses} progress={progress} onTyped={jest.fn()} remaining={0} rowFix={ROW_FIX} />,
        );

        const row = rowsOf(container)[1];
        expect(row.querySelector('[data-testid="spectrum-progressbar"]')).toHaveTextContent(/^Step 2\/3: Updating integrations$/);
        expect(row.querySelector('.step-progress-detail')).toHaveTextContent('Installing dependencies: Justrite ERP');
    });

    it('says the part in place of the step when there is no count', () => {
        const progress = {
            state: 'running',
            stage: 'Updating integrations',
            step: 'Installing dependencies',
            position: { index: 1, total: 2, name: 'ERP Integration' },
        } as OperationProgressPayload;
        const { container } = render(
            <UpdatesRunView rows={ROWS.slice(0, 1)} statuses={at(0)} progress={progress} onTyped={jest.fn()} remaining={0} rowFix={ROW_FIX} />,
        );

        expect(rowsOf(container)[0]).toHaveTextContent('Installing dependencies: ERP Integration');
    });
});

// Fixed in place, as Prerequisites installs a missing tool (owner, 2026-11-19): the button on an
// update that did not apply, once the run has ended.
describe('an update that did not apply carries its button once the run ends', () => {
    const FAILED: RowStatuses = {
        'blockLibrary:0': { id: 'blockLibrary:0', state: 'failed', message: plain('Could not merge.') },
    };
    const ENDED = { state: 'succeeded', warning: '1 update did not apply.' } as OperationProgressPayload;
    const fixing = (fixes: RowFixControls['fixes']): RowFixControls => ({
        fixes,
        retry: jest.fn(),
        fixWithAi: jest.fn(),
        checkAgain: jest.fn(),
    });
    const draw = (rowFix: RowFixControls, progress = ENDED) =>
        render(<UpdatesRunView rows={ROWS.slice(0, 1)} statuses={FAILED} progress={progress} onTyped={jest.fn()} remaining={0} rowFix={rowFix} />);

    it('offers Retry first, and presses it for that row', () => {
        const rowFix = fixing({});
        draw(rowFix);

        screen.getByRole('button', { name: 'Retry' }).click();

        expect(rowFix.retry).toHaveBeenCalledWith('blockLibrary:0');
        expect(screen.getByText('Could not merge.')).toHaveClass('work-row-why');
    });

    it('offers Fix with AI once retrying has not helped', () => {
        const rowFix = fixing({ 'blockLibrary:0': { retries: 2, withAi: false, checking: false } });
        draw(rowFix);

        screen.getByRole('button', { name: 'Fix with AI' }).click();

        expect(rowFix.fixWithAi).toHaveBeenCalledWith('blockLibrary:0');
    });

    it('offers Check Again while the AI has it, saying so in place of why it failed', () => {
        const rowFix = fixing({ 'blockLibrary:0': { retries: 2, withAi: true, checking: false } });
        draw(rowFix);

        screen.getByRole('button', { name: 'Check Again' }).click();

        expect(rowFix.checkAgain).toHaveBeenCalledWith('blockLibrary:0');
        expect(screen.getByText(AI_HAS_IT)).not.toHaveClass('work-row-why');
        expect(screen.queryByText('Could not merge.')).toBeNull();
    });

    it('offers nothing while a run is still going', () => {
        draw(fixing({}), PROGRESS);

        expect(screen.queryByRole('button')).toBeNull();
    });
});

