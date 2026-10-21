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
        size,
        actionButtons = [],
        onClose,
        closeLabel,
        children,
    }: {
        title: string;
        size?: string;
        actionButtons?: ActionButton[];
        onClose: () => void;
        closeLabel?: string;
        children: React.ReactNode;
    }) => (
        <div role="dialog" aria-label={title} data-size={size}>
            {children}
            <button onClick={onClose}>{closeLabel ?? 'Close'}</button>
            {actionButtons.map((b) => (
                <button key={b.label} onClick={b.onPress} disabled={b.isDisabled}>
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
        // Heading, its row; heading, its two rows (closed, so hidden, but there).
        const boxes = screen.getAllByRole('checkbox', { hidden: true });
        expect(boxes.map((b) => (b as HTMLInputElement).checked)).toEqual([true, true, true, true, false]);
        expect(boxes.map((b) => (b as HTMLInputElement).disabled)).toEqual([false, false, false, false, true]);
        expect(screen.getByText('This project uses a different Adobe organization')).toBeInTheDocument();
        expect(screen.getByText('Newer version')).toBeInTheDocument();
    });

    it('counts the ticked rows on Apply, and ticks one through the controls', async () => {
        const c = controls({ phase: 'list', rows: ROWS }, ['extension', 'blockLibrary:0']);
        render(<UpdatesModal controls={c} />);

        await user().click(screen.getByRole('button', { name: /JustRite/ }));
        // Demo Builder's checkbox, JustRite's, then JustRite's rows: Demo Builder is closed.
        await user().click(screen.getAllByRole('checkbox')[2]);
        await user().click(screen.getByRole('button', { name: 'Apply 2 updates' }));

        expect(c.toggle).toHaveBeenCalledWith('blockLibrary:0');
        expect(c.apply).toHaveBeenCalledTimes(1);
    });

    it('disables Apply when nothing is ticked', () => {
        render(<UpdatesModal controls={controls({ phase: 'list', rows: ROWS })} />);

        expect(screen.getByRole('button', { name: 'Apply 0 updates' })).toBeDisabled();
    });

    // Each ticked row as the Prerequisites step draws its checks (owner, 2026-10-21).
    it('shows the run row by row: no checkboxes, the running row saying what it is doing', () => {
        const c = running(
            { extension: { id: 'extension', state: 'done' }, 'blockLibrary:0': { id: 'blockLibrary:0', state: 'running' } },
            { stage: 'Updating add-ons', step: 'Demo Builder Blocks in JustRite' },
        );
        const { container } = render(<UpdatesModal controls={c} />);

        expect(screen.getByRole('dialog', { name: 'Applying updates' })).toBeInTheDocument();
        expect(screen.queryByRole('checkbox')).toBeNull();
        expect(screen.getByText('Demo Builder Blocks in JustRite')).toBeInTheDocument();
        expect(screen.getByText('1.0.0 → 1.1.0')).toBeInTheDocument();
        expect(Array.from(container.querySelectorAll('.updates-run-row')).map((r) => r.getAttribute('data-state'))).toEqual([
            'done',
            'running',
        ]);
        expect(screen.getByRole('button', { name: 'Run in background' })).toBeInTheDocument();
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

        expect(screen.getByText('Demo Builder Blocks: rate limited')).toHaveClass('updates-run-why');
        expect(screen.getByRole('dialog', { name: "Some updates didn't apply" })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Close' })).toBeInTheDocument();
    });

    it('titles a run where everything applied "Updates applied", a note under its row', () => {
        const c = running(
            {
                extension: { id: 'extension', state: 'done' },
                'blockLibrary:0': { id: 'blockLibrary:0', state: 'done', message: 'One block left out.' },
            },
            { state: 'succeeded' },
        );
        render(<UpdatesModal controls={c} />);

        expect(screen.getByRole('dialog', { name: 'Updates applied' })).toBeInTheDocument();
        expect(screen.getByText('One block left out.')).toHaveClass('updates-run-note');
    });

    it('says why a run failed outright, and offers the logs', () => {
        const c = running({}, { state: 'failed', error: 'This list of updates is out of date. Check for updates again.' });
        render(<UpdatesModal controls={c} />);

        expect(screen.getByRole('dialog', { name: "Couldn't apply the updates" })).toBeInTheDocument();
        expect(screen.getByText('This list of updates is out of date. Check for updates again.')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Open Debug Logs' })).toBeInTheDocument();
    });

    // A question takes the list's place, as it does in the progress modal.
    it('asks a question the run is paused on in place of the list, its answers as the buttons', async () => {
        const prompt = { message: 'Bodea is running. Stop it to update it?', actions: ['Stop and update', 'Skip'] };
        const c = running({}, { prompt });
        render(<UpdatesModal controls={c} />);

        expect(screen.getByText('Bodea is running. Stop it to update it?')).toBeInTheDocument();
        expect(screen.queryByText('Demo Builder Blocks')).toBeNull();
        await user().click(screen.getByRole('button', { name: 'Skip' }));
        await user().click(screen.getByRole('button', { name: 'Cancel' }));

        expect(c.answer).toHaveBeenCalledWith('Skip');
        expect(c.close).toHaveBeenCalledTimes(1);
    });

    // No sentence under the title: the ticks and the Apply count say it, and what cannot
    // be undone says so on its own row (owner, 2026-10-20). Large, so the longest row
    // ("…, Newer version, redeploys to Adobe") keeps to one line.
    it('opens large, titled "Updates available", straight onto the list', () => {
        const { container } = render(<UpdatesModal controls={controls({ phase: 'list', rows: ROWS })} />);

        const dialog = screen.getByRole('dialog', { name: 'Updates available' });
        expect(dialog).toHaveAttribute('data-size', 'L');
        expect(container.querySelector('.updates-group-list')).not.toBeNull();
        expect(container.querySelector('.lead-text')).toBeNull();
    });

    // A project's name is the SC's own, so it is drawn as written, not in the section
    // label's capitals; and it is a checkbox, so one click skips a whole demo (owner,
    // 2026-10-20).
    it("heads each project with a checkbox in the name's own casing that ticks its open rows", async () => {
        const c = controls({ phase: 'list', rows: ROWS }, ['extension', 'blockLibrary:0']);
        render(<UpdatesModal controls={c} />);

        // The projects list's own row name, as its list view draws it.
        expect(screen.getByText('JustRite')).toHaveClass('project-row-name');
        expect(screen.getByText('JustRite')).not.toHaveClass('section-label');
        // Both groups closed: Demo Builder's checkbox, then JustRite's.
        await user().click(screen.getAllByRole('checkbox')[1]);

        expect(c.toggleGroup).toHaveBeenCalledWith(['blockLibrary:0']);
        // Ticking a project is not opening it.
        expect(screen.getByRole('button', { name: /JustRite/ })).toHaveAttribute('aria-expanded', 'false');
    });

    // Closed, a project says what it holds: the count, and what still waits for the SC
    // (owner, 2026-10-20). Its name opens it.
    it('starts each project closed, and opens it on its name', async () => {
        render(<UpdatesModal controls={controls({ phase: 'list', rows: ROWS }, ['extension', 'blockLibrary:0'])} />);

        expect(screen.getByText('Demo Builder Blocks')).not.toBeVisible();
        await user().click(screen.getByRole('button', { name: /JustRite/ }));

        expect(screen.getByText('Demo Builder Blocks')).toBeVisible();
        expect(screen.getByText('Demo Builder extension')).not.toBeVisible();
    });

    // A row that starts unticked is the one a closed project must not hide: the redeploy,
    // or one locked in another org. Once ticked, it no longer waits.
    it('says how many rows in a project wait for the SC, until they are ticked', () => {
        const redeploy: PendingUpdateRow = { ...ROWS[2], id: 'integration:1', lockedReason: undefined };
        const rows = [ROWS[0], ROWS[1], redeploy];
        const { rerender } = render(<UpdatesModal controls={controls({ phase: 'list', rows }, ['extension'])} />);

        expect(screen.getByText('1 waiting for you')).toBeInTheDocument();

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
        expect(screen.getByText('1 waiting for you')).toBeInTheDocument();
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

// The window keeps one height and its list scrolls, so opening a project never resizes it
// (owner, 2026-10-20). Asserted against the stylesheet: jsdom resolves no layout. Leaving
// the house modal's "fit to content" off was tried first and changed nothing on screen;
// the height has to be on the list.
describe('the Updates list', () => {
    it('has a set height and scrolls, rather than growing', () => {
        const rule = ruleFor('.updates-group-list');

        expect(rule).toMatch(/(^|[;{\s])height:\s*[^;]+;/);
        expect(rule).not.toMatch(/max-height/);
        expect(rule).toMatch(/overflow-y:\s*auto/);
    });

    // A cut-off panel at the bottom edge did not read as "more below" (owner, 2026-10-20).
    it('fades its bottom edge by how much is left to scroll, and not at all when it fits', () => {
        const rule = ruleFor('.updates-group-list');

        expect(rule).toMatch(/mask-image:[^;]*var\(--updates-fade\)/);
        expect(rule).toMatch(/animation-timeline:\s*scroll\(self\)/);
        // No scroll, no running animation: the registered starting value is what shows.
        expect(ruleFor('@property --updates-fade')).toMatch(/initial-value:\s*0px/);
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
