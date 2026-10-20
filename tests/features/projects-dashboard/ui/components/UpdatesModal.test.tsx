/**
 * UpdatesModal — what the SC sees in Check for Updates on the projects list (PL-80):
 * the rows under their headings, which are ticked and which are locked, the Apply count,
 * and the checking, failed, up-to-date and report views. The controls are handed in, so
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
        actionButtons = [],
        onClose,
        children,
    }: {
        title: string;
        actionButtons?: ActionButton[];
        onClose: () => void;
        children: React.ReactNode;
    }) => (
        <div role="dialog" aria-label={title}>
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
        detail: '1 commit behind',
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
        check: jest.fn(),
        toggle: jest.fn(),
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
        const boxes = screen.getAllByRole('checkbox');
        expect(boxes.map((b) => (b as HTMLInputElement).checked)).toEqual([true, true, false]);
        expect(boxes.map((b) => (b as HTMLInputElement).disabled)).toEqual([false, false, true]);
        expect(screen.getByText('This project uses a different Adobe organization')).toBeInTheDocument();
        expect(screen.getByText('1 commit behind')).toBeInTheDocument();
    });

    it('counts the ticked rows on Apply, and ticks one through the controls', async () => {
        const c = controls({ phase: 'list', rows: ROWS }, ['extension', 'blockLibrary:0']);
        render(<UpdatesModal controls={c} />);

        await user().click(screen.getAllByRole('checkbox')[1]);
        await user().click(screen.getByRole('button', { name: 'Apply 2 updates' }));

        expect(c.toggle).toHaveBeenCalledWith('blockLibrary:0');
        expect(c.apply).toHaveBeenCalledTimes(1);
    });

    it('disables Apply when nothing is ticked', () => {
        render(<UpdatesModal controls={controls({ phase: 'list', rows: ROWS })} />);

        expect(screen.getByRole('button', { name: 'Apply 0 updates' })).toBeDisabled();
    });

    it('says everything is up to date when nothing is waiting, with no Apply', () => {
        render(<UpdatesModal controls={controls({ phase: 'list', rows: [] })} />);

        expect(screen.getByText('Everything is up to date')).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /^Apply/ })).toBeNull();
    });

    it('shows that it is checking', () => {
        render(<UpdatesModal controls={controls({ phase: 'checking' })} />);

        expect(screen.getByText('Checking for updates')).toBeInTheDocument();
    });

    it('says the check failed and offers to check again', async () => {
        const c = controls({ phase: 'failed', error: "Couldn't check for updates. Details are in Debug Logs." });
        render(<UpdatesModal controls={c} />);

        await user().click(screen.getByRole('button', { name: 'Check again' }));

        expect(screen.getByText("Couldn't check for updates. Details are in Debug Logs.")).toBeInTheDocument();
        expect(c.check).toHaveBeenCalledTimes(1);
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

    it('closes through the controls', async () => {
        const c = controls({ phase: 'list', rows: ROWS });
        render(<UpdatesModal controls={c} />);

        await user().click(screen.getByRole('button', { name: 'Close' }));

        expect(c.close).toHaveBeenCalledTimes(1);
    });
});
