/**
 * UpdatesModal — what the SC sees in Check for Updates on the projects list (PL-80):
 * the rows under their headings, which are ticked and which are locked, the Apply count,
 * and the report. Checking and "up to date" are the notification's, not this window's. The controls are handed in, so
 * each view is driven directly.
 */

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import type { ActionButton } from '@/core/ui/components/ui/Modal';
import type { PendingUpdateRow } from '@/types/pendingUpdates';

jest.mock('@/core/ui/components/ui/Modal', () => ({
    Modal: ({
        title,
        size,
        fitContent,
        actionButtons = [],
        onClose,
        children,
    }: {
        title: string;
        size?: string;
        fitContent?: boolean;
        actionButtons?: ActionButton[];
        onClose: () => void;
        children: React.ReactNode;
    }) => (
        <div role="dialog" aria-label={title} data-size={size} data-fit-content={fitContent ? 'yes' : 'no'}>
            {children}
            <button onClick={onClose}>Close</button>
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
import type { UpdatesModalControls, UpdatesView } from '@/features/projects-dashboard/ui/hooks/useUpdatesModal';

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

    it('reports what applied, what did not and the notes', () => {
        render(
            <UpdatesModal
                controls={controls({
                    phase: 'report',
                    report: { applied: 2, problems: ['Bodea: merge conflicts'], notes: ['Added 3 blocks to Bodea.'] },
                })}
            />,
        );

        expect(screen.getByText('2 updates applied.')).toBeInTheDocument();
        expect(screen.getByText('Not applied')).toBeInTheDocument();
        expect(screen.getByText('Bodea: merge conflicts')).toBeInTheDocument();
        expect(screen.getByText('Added 3 blocks to Bodea.')).toBeInTheDocument();
    });

    // No sentence under the title: the ticks and the Apply count say it, and what cannot
    // be undone says so on its own row (owner, 2026-10-20). Large, so the longest row
    // ("…, Newer version, redeploys to Adobe") keeps to one line. Not fitted to its
    // content: the window keeps one height and its list scrolls, so opening a project
    // never resizes it (owner, 2026-10-20).
    it('opens large and steady, titled "Updates available", straight onto the list', () => {
        const { container } = render(<UpdatesModal controls={controls({ phase: 'list', rows: ROWS })} />);

        const dialog = screen.getByRole('dialog', { name: 'Updates available' });
        expect(dialog).toHaveAttribute('data-size', 'L');
        expect(dialog).toHaveAttribute('data-fit-content', 'no');
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

        expect(screen.getByText('0 of 2, 1 waiting for you')).toBeInTheDocument();
        expect(screen.getByText('1 of 1')).toBeInTheDocument();

        rerender(<UpdatesModal controls={controls({ phase: 'list', rows }, ['extension', 'integration:1'])} />);
        expect(screen.getByText('1 of 2')).toBeInTheDocument();
    });

    it('shows a project partly ticked as mixed', () => {
        const rows: PendingUpdateRow[] = [ROWS[1], { ...ROWS[1], id: 'template:0', label: 'EDS template' }];
        render(<UpdatesModal controls={controls({ phase: 'list', rows }, ['template:0'])} />);

        const heading = screen.getAllByRole('checkbox')[0];
        expect(heading).toHaveAttribute('aria-checked', 'mixed');
        expect(heading).not.toBeChecked();
        expect(screen.getByText('1 of 2')).toBeInTheDocument();
    });

    // A locked row is not counted: it can be neither ticked nor applied from here.
    it("counts a project's ticked rows beside its name, leaving out a locked one", () => {
        render(<UpdatesModal controls={controls({ phase: 'list', rows: ROWS }, ['extension', 'blockLibrary:0'])} />);

        expect(screen.getByText('1 of 1')).toBeInTheDocument();
        expect(screen.getByText('1 of 1, 1 waiting for you')).toBeInTheDocument();
    });

    it('titles the report "Update results"', () => {
        render(<UpdatesModal controls={controls({ phase: 'report', report: { applied: 1, problems: [], notes: [] } })} />);

        expect(screen.getByRole('dialog', { name: 'Update results' })).toBeInTheDocument();
    });

    it('closes through the controls', async () => {
        const c = controls({ phase: 'list', rows: ROWS });
        render(<UpdatesModal controls={c} />);

        await user().click(screen.getByRole('button', { name: 'Close' }));

        expect(c.close).toHaveBeenCalledTimes(1);
    });
});
