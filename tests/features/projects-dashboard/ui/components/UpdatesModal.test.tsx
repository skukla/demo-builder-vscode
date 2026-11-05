/**
 * UpdatesModal — what the SC sees in Check for Updates on the projects list (PL-80):
 * the rows under their headings, which are ticked and which are locked, the Apply count,
 * and then the run, row by row. Checking and "up to date" are the notification's, not
 * this window's. The controls are handed in, so each view is driven directly.
 */

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import type { ActionButton } from '@/core/ui/components/ui/Modal';
import { ruleFor } from '../../../../helpers/cssRules';
import type { PendingUpdateRow } from '@/types/pendingUpdates';

jest.mock('@/core/ui/components/ui/Modal', () => ({
    Modal: ({
        title,
        status,
        size,
        actionButtons = [],
        onClose,
        closeLabel,
        hideClose,
        children,
    }: {
        title: string;
        status?: string;
        size?: string;
        actionButtons?: ActionButton[];
        onClose: () => void;
        closeLabel?: string;
        hideClose?: boolean;
        children: React.ReactNode;
    }) => (
        <div role="dialog" aria-label={title} data-size={size} data-status={status}>
            {children}
            {!hideClose && <button onClick={onClose}>{closeLabel ?? 'Close'}</button>}
            {actionButtons.map((b) => (
                <button
                    key={b.label}
                    onClick={b.onPress}
                    disabled={b.isDisabled}
                    aria-busy={b.isPending ? 'true' : undefined}
                    data-size-labels={b.sizeLabels?.join('|')}
                >
                    {b.label}
                </button>
            ))}
        </div>
    ),
}));

// Below the mock on purpose: it must register before the component binds to Modal.
import { UpdatesModal } from '@/features/projects-dashboard/ui/components/UpdatesModal';
import { groupStatusOf } from '@/features/projects-dashboard/ui/components/UpdatesRunView';
import type {
    RowStatuses,
    UpdatesModalControls,
    UpdatesView,
} from '@/features/projects-dashboard/ui/hooks/useUpdatesModal';
import type { OperationProgressPayload } from '@/types/webviewPayloads';

const ROWS: PendingUpdateRow[] = [
    {
        id: 'extension',
        kind: 'extension',
        group: { key: 'extension', title: 'Demo Builder' },
        label: 'Demo Builder extension',
        detail: '1.0.0 → 1.1.0',
        ticked: true,
    },
    {
        id: 'blockLibrary:0',
        kind: 'blockLibrary',
        group: { key: '/p/justrite', title: 'JustRite' },
        label: 'Demo Builder Blocks',
        detail: 'Newer version',
        ticked: true,
    },
    {
        id: 'integration:0',
        kind: 'integration',
        group: { key: '/p/justrite', title: 'JustRite' },
        label: 'ERP Integration and Justrite ERP',
        detail: 'update available',
        ticked: false,
        lockedReason: 'This project uses a different Adobe organization',
    },
];

/** One more than the list opens every group for, so each starts closed. Its own group, last. */
const MANY: PendingUpdateRow[] = [
    ...ROWS,
    {
        id: 'blockLibrary:1',
        kind: 'blockLibrary',
        group: { key: '/p/bodea', title: 'Bodea' },
        label: 'Bodea Blocks',
        detail: 'Newer version',
        ticked: true,
    },
];

function controls(view: UpdatesView, ticked: string[] = []): jest.Mocked<UpdatesModalControls> {
    return {
        view,
        ticked: new Set(ticked),
        toggle: jest.fn(),
        toggleGroup: jest.fn(),
        apply: jest.fn(),
        close: jest.fn(),
        statuses: {},
        progress: null,
        answer: jest.fn(),
        onTyped: jest.fn(),
        remaining: 0,
        back: jest.fn(),
        rechecking: false,
    };
}

/** The run of the two open rows: where each is, and where the run is. */
function running(statuses: RowStatuses, progress: Partial<OperationProgressPayload> = {}): jest.Mocked<UpdatesModalControls> {
    return {
        ...controls({ phase: 'applying', rows: [ROWS[0], ROWS[1]] }),
        statuses,
        progress: { id: 'updates', state: 'running', ...progress },
    };
}

const user = () => userEvent.setup({ advanceTimers: jest.advanceTimersByTime });

describe('UpdatesModal', () => {
    it('renders nothing while closed', () => {
        render(<UpdatesModal controls={controls({ phase: 'closed' })} />);

        expect(screen.queryByRole('dialog')).toBeNull();
    });

    it('lists the rows under their headings, ticked as the check said, the locked one unticked with its reason', () => {
        render(<UpdatesModal controls={controls({ phase: 'list', rows: ROWS }, ['extension', 'blockLibrary:0'])} />);

        expect(screen.getByText('Demo Builder')).toBeInTheDocument();
        expect(screen.getByText('JustRite')).toBeInTheDocument();
        // Heading, its row; heading, its two rows.
        const boxes = screen.getAllByRole('checkbox', { hidden: true });
        expect(boxes.map((b) => (b as HTMLInputElement).checked)).toEqual([true, true, true, true, false]);
        expect(boxes.map((b) => (b as HTMLInputElement).disabled)).toEqual([false, false, false, false, true]);
        expect(screen.getByText('This project uses a different Adobe organization')).toBeInTheDocument();
        expect(screen.getByText('Newer version')).toBeInTheDocument();
    });

    it('counts the ticked rows on Apply, and ticks one through the controls', async () => {
        const c = controls({ phase: 'list', rows: MANY }, ['extension', 'blockLibrary:0']);
        render(<UpdatesModal controls={c} />);

        await user().click(screen.getByRole('button', { name: /JustRite/ }));
        // Demo Builder's checkbox, JustRite's, then JustRite's rows: Demo Builder is closed.
        await user().click(screen.getAllByRole('checkbox')[2]);
        await user().click(screen.getByRole('button', { name: 'Apply 2 Updates' }));

        expect(c.toggle).toHaveBeenCalledWith('blockLibrary:0');
        expect(c.apply).toHaveBeenCalledTimes(1);
    });

    it('disables Apply when nothing is ticked', () => {
        render(<UpdatesModal controls={controls({ phase: 'list', rows: ROWS })} />);

        // No number with nothing ticked: "Apply 0 Updates" read as a broken count (2026-11-03).
        expect(screen.getByRole('button', { name: 'Apply Updates' })).toBeDisabled();
    });

    // Ticking a row changed the label's width and moved Close (owner, 2026-11-04).
    it('hands Apply every label it can show, so ticking moves nothing', () => {
        render(<UpdatesModal controls={controls({ phase: 'list', rows: ROWS })} />);

        const unlocked = ROWS.filter((r) => !r.lockedReason).length;
        const apply = screen.getByRole('button', { name: 'Apply Updates' });
        expect(apply).toHaveAttribute('data-size-labels', `Apply 1 Update|Apply ${unlocked} Updates`);
    });

    // Each ticked row as the Prerequisites step draws its checks (owner, 2026-10-21).
    it('shows the run row by row: no checkboxes, the running row saying what it is doing', () => {
        const c = running(
            { extension: { id: 'extension', state: 'done' }, 'blockLibrary:0': { id: 'blockLibrary:0', state: 'running' } },
            { stage: 'Updating add-ons', step: 'Demo Builder Blocks in JustRite' },
        );
        const { container } = render(<UpdatesModal controls={c} />);

        expect(screen.getByRole('dialog', { name: 'Applying Updates' })).not.toHaveAttribute('data-status');
        expect(screen.queryByRole('checkbox')).toBeNull();
        expect(screen.getByText('Demo Builder Blocks in JustRite')).toBeInTheDocument();
        expect(screen.getByText('1.0.0 → 1.1.0')).toBeInTheDocument();
        expect(Array.from(container.querySelectorAll('.work-row')).map((r) => r.getAttribute('data-state'))).toEqual([
            'done',
            'running',
        ]);
        expect(screen.getByRole('button', { name: 'Run in Background' })).toBeInTheDocument();
    });

    it('says under a row why it did not apply, and titles the end by it', () => {
        const c = running(
            {
                extension: { id: 'extension', state: 'done' },
                'blockLibrary:0': { id: 'blockLibrary:0', state: 'failed', message: 'Demo Builder Blocks: rate limited' },
            },
            { state: 'succeeded', warning: '1 update did not apply.' },
        );
        render(<UpdatesModal controls={c} />);

        expect(screen.getByText('Demo Builder Blocks: rate limited')).toHaveClass('work-row-why');
        expect(screen.getByRole('dialog', { name: "Some updates didn't apply" })).toHaveAttribute('data-status', 'warning');
        expect(screen.getByRole('button', { name: 'Close' })).toBeInTheDocument();
    });

    it("says why a row was left alone in grey, not a failure's red", () => {
        const c = running(
            { 'blockLibrary:0': { id: 'blockLibrary:0', state: 'skipped', message: 'Not updated — your blocks were kept.' } },
            { state: 'succeeded', warning: '1 update did not apply.' },
        );
        render(<UpdatesModal controls={c} />);

        expect(screen.getByText('Not updated — your blocks were kept.')).toHaveClass('work-row-note');
    });

    it('titles a run where everything applied "Updates Applied", a note under its row', () => {
        const c = running(
            {
                extension: { id: 'extension', state: 'done' },
                'blockLibrary:0': { id: 'blockLibrary:0', state: 'done', message: 'One block left out.' },
            },
            { state: 'succeeded' },
        );
        render(<UpdatesModal controls={c} />);

        expect(screen.getByRole('dialog', { name: 'Updates Applied' })).toHaveAttribute('data-status', 'success');
        expect(screen.getByText('One block left out.')).toHaveClass('work-row-note');
    });

    // EDS-56, 2026-10-30: the row the SC's AI was fixing turns done when the AI finishes,
    // after the run ended with "1 update did not apply"; the title follows the rows.
    it('titles the run "Updates Applied" once a row that did not apply is done after all', () => {
        const c = running(
            {
                extension: { id: 'extension', state: 'done' },
                'blockLibrary:0': { id: 'blockLibrary:0', state: 'done', message: 'Updated by your AI.' },
            },
            { state: 'succeeded', warning: '1 update did not apply.' },
        );
        render(<UpdatesModal controls={c} />);

        expect(screen.getByRole('dialog', { name: 'Updates Applied' })).toBeInTheDocument();
        expect(screen.getByText('Updated by your AI.')).toHaveClass('work-row-note');
    });

    it('says why a run failed outright, and offers the logs', () => {
        const c = running({}, { state: 'failed', error: 'This list of updates is out of date. Check for updates again.' });
        render(<UpdatesModal controls={c} />);

        expect(screen.getByRole('dialog', { name: "Couldn't Apply the Updates" })).toHaveAttribute('data-status', 'error');
        expect(screen.getByText('This list of updates is out of date. Check for updates again.')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Open Debug Logs' })).toBeInTheDocument();
    });

    it('says a failed run\'s reason once when a row already says it', () => {
        const c = running(
            { extension: { id: 'extension', state: 'failed', message: 'The download failed.' } },
            { state: 'failed', error: 'The download failed.' },
        );
        render(<UpdatesModal controls={c} />);

        expect(screen.getAllByText('The download failed.')).toHaveLength(1);
    });

    it('keeps a failed run\'s reason above the list when no row says the same', () => {
        const c = running(
            { extension: { id: 'extension', state: 'failed', message: 'The download failed.' } },
            { state: 'failed', error: 'The run stopped.' },
        );
        const { container } = render(<UpdatesModal controls={c} />);

        expect(container.querySelector('.updates-group-list')?.firstElementChild).toHaveTextContent('The run stopped.');
    });

    // A question is asked under the row it is about, the list still in view (owner,
    // 2026-10-21); its answers are the only buttons, since a dismiss would repeat one.
    it('asks a question under the row asking it, its answers the only buttons', async () => {
        const prompt = { message: '"Replace Blocks" puts in the new versions.', actions: ['Replace Blocks', 'Keep My Blocks'] };
        const c = running({ 'blockLibrary:0': { id: 'blockLibrary:0', state: 'running' } }, { prompt, step: 'Lib A' });
        const { container } = render(<UpdatesModal controls={c} />);

        const row = container.querySelector('.work-row[data-state="running"]') as HTMLElement;
        expect(row).toHaveTextContent('Demo Builder Blocks');
        expect(row.querySelector('.updates-run-question')).toHaveTextContent('"Replace Blocks" puts in the new versions.');
        expect(screen.getByText('Demo Builder extension')).toBeInTheDocument();
        expect(screen.getByRole('dialog', { name: 'Applying Updates' })).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /cancel|close|run in background/i })).toBeNull();
        await user().click(screen.getByRole('button', { name: 'Keep My Blocks' }));

        expect(c.answer).toHaveBeenCalledWith('Keep My Blocks');
    });

    // A sign-in is a task about no one row (owner, 2026-11-04, layout A): it takes the window,
    // and Cancel is its way out, answering it and keeping the window for the rest.
    it('gives a sign-in the window: its heading, amber, and Cancel', async () => {
        const prompt = {
            title: 'Sign In to DA.live',
            message: 'Your DA.live session has expired.',
            steps: ['Open DA.live and run the bookmarklet.', 'Paste the token it copies.'],
            actions: ['Sign In', 'Open DA.live'],
            fields: [{ id: 'token', label: 'Token', secret: true }],
        };
        const c = running({ 'blockLibrary:0': { id: 'blockLibrary:0', state: 'running' } }, { prompt });
        const { container } = render(<UpdatesModal controls={c} />);

        expect(screen.getByRole('dialog', { name: 'Sign In to DA.live' })).toHaveAttribute('data-status', 'warning');
        expect(container.querySelector('.work-row')).toBeNull();
        expect(screen.getAllByRole('button').map((b) => b.textContent)).toEqual(['Cancel', 'Open DA.live', 'Sign In']);
        await user().click(screen.getByRole('button', { name: 'Cancel' }));

        expect(c.answer).toHaveBeenCalledWith(undefined);
        expect(c.close).not.toHaveBeenCalled();
    });

    // A prompt names its main answer first; a dialog's main button goes last.
    it('puts the main answer of a question last, whatever the prompt lists first', () => {
        const prompt = { message: 'Three ways on.', actions: ['Main', 'Second', 'Third'] };
        const c = running({ 'blockLibrary:0': { id: 'blockLibrary:0', state: 'running' } }, { prompt });
        render(<UpdatesModal controls={c} />);

        expect(screen.getAllByRole('button').map((b) => b.textContent)).toEqual(['Second', 'Third', 'Main']);
    });

    it('asks a question no row is running for above the list', () => {
        const prompt = { message: 'Bodea is running. Stop it to update it?', actions: ['Stop and Update', 'Skip'] };
        const c = running({}, { prompt });
        const { container } = render(<UpdatesModal controls={c} />);

        const list = container.querySelector('.updates-group-list') as HTMLElement;
        expect(list.firstElementChild).toHaveClass('updates-run-question');
        expect(list.firstElementChild).toHaveTextContent('Bodea is running. Stop it to update it?');
        expect(screen.getByText('Demo Builder Blocks')).toBeInTheDocument();
    });

    // After a project's updates, its local copy is brought up to GitHub: one more step
    // in its panel that keeps its outcome (owner, 2026-10-21: a stage line vanished).
    it("shows the local copy as a step in its project's panel, the project running until it ends", () => {
        const c = running({
            'blockLibrary:0': { id: 'blockLibrary:0', state: 'done' },
            'localCopy:/p/justrite': { id: 'localCopy:/p/justrite', state: 'running' },
        });
        const { container } = render(<UpdatesModal controls={c} />);

        const justrite = Array.from(container.querySelectorAll('.updates-group')).find((p) =>
            p.textContent?.includes('JustRite'),
        ) as HTMLElement;
        const step = Array.from(justrite.querySelectorAll('.work-row')).at(-1) as HTMLElement;
        expect(step).toHaveTextContent('Your Local Copy');
        expect(step).toHaveTextContent('Bringing it up to GitHub');
        expect(justrite.querySelector('.updates-run-header [role="progressbar"]')).not.toBeNull();
    });

    it('keeps the local copy step once it ends, with why when it was left as it is', () => {
        const c = running(
            {
                'blockLibrary:0': { id: 'blockLibrary:0', state: 'done' },
                'localCopy:/p/justrite': {
                    id: 'localCopy:/p/justrite',
                    state: 'skipped',
                    message: 'Left as it is — it has commits GitHub does not have.',
                },
            },
            { state: 'succeeded' },
        );
        render(<UpdatesModal controls={c} />);

        expect(screen.getByText('Your Local Copy')).toBeInTheDocument();
        expect(screen.getByText('Left as it is — it has commits GitHub does not have.')).toHaveClass('work-row-note');
    });

    // No sentence under the title: the ticks and the Apply count say it, and what cannot
    // be undone says so on its own row (owner, 2026-10-20). Large, so the longest row
    // ("…, Newer version, redeploys to Adobe") keeps to one line.
    it('opens large, titled "Updates Available", straight onto the list', () => {
        const { container } = render(<UpdatesModal controls={controls({ phase: 'list', rows: ROWS })} />);

        const dialog = screen.getByRole('dialog', { name: 'Updates Available' });
        expect(dialog).toHaveAttribute('data-size', 'L');
        expect(container.querySelector('.updates-group-list')).not.toBeNull();
        expect(container.querySelector('.lead-text')).toBeNull();
    });

    // A project's name is the SC's own, so it is drawn as written, not in the section
    // label's capitals; and it is a checkbox, so one click skips a whole demo (owner,
    // 2026-10-20).
    it("heads each project with a checkbox in the name's own casing that ticks its open rows", async () => {
        const c = controls({ phase: 'list', rows: MANY }, ['extension', 'blockLibrary:0']);
        render(<UpdatesModal controls={c} />);

        // The projects list's own row name, as its list view draws it: the shared toggle's
        // name carries the same rules (`.disclosure-toggle-name`, moved from `.project-row-name`).
        expect(screen.getByText('JustRite')).toHaveClass('disclosure-toggle-name');
        expect(screen.getByText('JustRite')).not.toHaveClass('section-label');
        // Every group closed: Demo Builder's checkbox, then JustRite's.
        await user().click(screen.getAllByRole('checkbox')[1]);

        expect(c.toggleGroup).toHaveBeenCalledWith(['blockLibrary:0']);
        // Ticking a project is not opening it.
        expect(screen.getByRole('button', { name: /JustRite/ })).toHaveAttribute('aria-expanded', 'false');
    });

    // Closed, a project says what it holds: the count, and what still waits for the SC
    // (owner, 2026-10-20). Its name opens it.
    it('starts each project closed when there are more than three updates, and opens it on its name', async () => {
        render(<UpdatesModal controls={controls({ phase: 'list', rows: MANY }, ['extension', 'blockLibrary:0'])} />);

        expect(screen.getByText('Demo Builder Blocks')).not.toBeVisible();
        await user().click(screen.getByRole('button', { name: /JustRite/ }));

        expect(screen.getByText('Demo Builder Blocks')).toBeVisible();
        expect(screen.getByText('Demo Builder extension')).not.toBeVisible();
    });

    // Three fit, so nothing is hidden behind a click (owner, 2026-10-24); the name still closes it.
    it('starts every project open when there are three updates or fewer', async () => {
        render(<UpdatesModal controls={controls({ phase: 'list', rows: ROWS }, ['extension', 'blockLibrary:0'])} />);

        expect(screen.getByText('Demo Builder extension')).toBeVisible();
        expect(screen.getByText('Demo Builder Blocks')).toBeVisible();
        await user().click(screen.getByRole('button', { name: /JustRite/ }));

        expect(screen.getByText('Demo Builder Blocks')).not.toBeVisible();
    });

    // A row that starts unticked is the one a closed project must not hide: the redeploy,
    // or one locked in another org. Once ticked, it no longer waits.
    it('says how many rows in a project wait for the SC, until they are ticked', () => {
        const redeploy: PendingUpdateRow = { ...ROWS[2], id: 'integration:1', lockedReason: undefined };
        const rows = [ROWS[0], ROWS[1], redeploy];
        const { rerender } = render(<UpdatesModal controls={controls({ phase: 'list', rows }, ['extension'])} />);

        expect(screen.getByText('1 needs attention')).toBeInTheDocument();

        rerender(<UpdatesModal controls={controls({ phase: 'list', rows }, ['extension', 'integration:1'])} />);
        expect(screen.queryByText(/waiting for you/)).not.toBeInTheDocument();
    });

    it('shows a project partly ticked as mixed', () => {
        const rows: PendingUpdateRow[] = [ROWS[1], { ...ROWS[1], id: 'template:0', label: 'EDS template' }];
        render(<UpdatesModal controls={controls({ phase: 'list', rows }, ['template:0'])} />);

        const heading = screen.getAllByRole('checkbox')[0];
        expect(heading).toHaveAttribute('aria-checked', 'mixed');
        expect(heading).not.toBeChecked();
    });

    // The checkbox shows all, some or none ticked, so a count beside the name said it twice.
    it("shows no ticked count beside a project's name", () => {
        render(<UpdatesModal controls={controls({ phase: 'list', rows: ROWS }, ['extension', 'blockLibrary:0'])} />);

        expect(screen.queryByText(/\d+ of \d+/)).not.toBeInTheDocument();
        expect(screen.getByText('1 needs attention')).toBeInTheDocument();
    });

    // Owner, 2026-10-22: after applying only some, the SC can go back to the rest.
    describe('once a run leaves updates the SC unticked still waiting', () => {
        const ended = (remaining: number, progress: Partial<OperationProgressPayload> = { state: 'succeeded' }) => ({
            ...running({ extension: { id: 'extension', state: 'done' } }, progress),
            remaining,
        });

        it('says how many inside the list, and offers Back to Updates beside Close', async () => {
            const c = ended(2, { state: 'succeeded', warning: '1 update did not apply.' });
            const { container } = render(<UpdatesModal controls={c} />);

            const list = container.querySelector('.updates-group-list') as HTMLElement;
            expect(list.firstElementChild).toHaveTextContent('2 updates pending');
            expect(screen.getByRole('dialog', { name: "Some updates didn't apply" })).toBeInTheDocument();
            expect(screen.getByRole('button', { name: 'Close' })).toBeInTheDocument();
            await user().click(screen.getByRole('button', { name: 'Back to Updates' }));

            expect(c.back).toHaveBeenCalledTimes(1);
        });

        it('says one in the singular', () => {
            render(<UpdatesModal controls={ended(1)} />);

            expect(screen.getByText('1 update pending')).toHaveClass('work-row-note');
            expect(screen.getByRole('dialog', { name: 'Updates Applied' })).toBeInTheDocument();
        });

        it('offers only Close when nothing the SC left is waiting', () => {
            render(<UpdatesModal controls={ended(0)} />);

            expect(screen.queryByText(/still waiting/)).toBeNull();
            expect(screen.queryByRole('button', { name: 'Back to Updates' })).toBeNull();
            expect(screen.getByRole('button', { name: 'Close' })).toBeInTheDocument();
        });

        // The button's spinner, not a "Checking for updates" label (owner, 2026-10-31).
        it('shows the button busy while the check runs, so it cannot be pressed again', () => {
            render(<UpdatesModal controls={{ ...ended(1), rechecking: true }} />);

            expect(screen.getByRole('button', { name: 'Back to Updates' })).toHaveAttribute('aria-busy', 'true');
        });

        it('offers nothing new while the run is still going', () => {
            render(<UpdatesModal controls={ended(1, { state: 'running' })} />);

            expect(screen.queryByRole('button', { name: 'Back to Updates' })).toBeNull();
            expect(screen.queryByText(/still waiting/)).toBeNull();
        });
    });

    it('closes through the controls', async () => {
        const c = controls({ phase: 'list', rows: ROWS });
        render(<UpdatesModal controls={c} />);

        await user().click(screen.getByRole('button', { name: 'Close' }));

        expect(c.close).toHaveBeenCalledTimes(1);
    });
});

// One icon per project: what went wrong first, else whether it is still going.
describe('groupStatusOf', () => {
    it.each([
        [['done', 'failed', 'running'], 'error'],
        [['done', 'running', 'waiting'], 'checking'],
        [['done', 'waiting'], 'pending'],
        [['done', 'skipped'], 'warning'],
        [['done', 'done'], 'success'],
    ] as const)('%j reads as %s', (states, icon) => {
        expect(groupStatusOf([...states])).toBe(icon);
    });
});

// Height fits the content (dialog design rules): a set height left 295px empty under two rows.
// Asserted against the stylesheet: jsdom resolves no layout.
describe('the Updates list', () => {
    // The height, scroll and fade are `.scroll-fade`, shared with the projects batch window
    // (owner, 2026-11-05); the list wears it.
    it('is as tall as its rows, and scrolls past a cap', () => {
        const { container } = render(<UpdatesModal controls={controls({ phase: 'list', rows: ROWS })} />);
        expect(container.querySelector('.updates-group-list')).toHaveClass('scroll-fade');
        const rule = ruleFor('.scroll-fade');

        expect(rule).toMatch(/max-height:\s*[^;]+;/);
        expect(rule).not.toMatch(/(^|[;{\s])height:/);
        expect(rule).toMatch(/overflow-y:\s*auto/);
    });

    // Lines: one rule, under the title. Groups are told apart by the 24 between them.
    it('draws no box around its groups or its questions', () => {
        expect(ruleFor('.updates-group')).not.toMatch(/border|background/);
        expect(ruleFor('.updates-run-question')).not.toMatch(/border/);
        expect(ruleFor('.updates-group-list')).toMatch(/gap:\s*24px/);
    });

    // A cut-off panel at the bottom edge did not read as "more below" (owner, 2026-10-20).
    it('fades its bottom edge by how much is left to scroll, and not at all when it fits', () => {
        const rule = ruleFor('.scroll-fade');

        expect(rule).toMatch(/mask-image:[^;]*var\(--scroll-fade\)/);
        expect(rule).toMatch(/animation-timeline:\s*scroll\(self\)/);
        // No scroll, no running animation: the registered starting value is what shows.
        expect(ruleFor('@property --scroll-fade')).toMatch(/initial-value:\s*0px/);
    });

    // Spectrum's 32px checkbox made the rows tall (owner, 2026-10-20); here alone they
    // take 24px, the box and one line of text.
    it('draws its rows thinner than the checkbox default, and only inside the list', () => {
        expect(ruleFor('.updates-group-rows .checkbox-row')).toMatch(/padding:\s*0;/);
        expect(ruleFor(".updates-group-rows .checkbox-row label[class*='spectrum-Checkbox']")).toMatch(
            /min-height:\s*24px/,
        );
    });
});
