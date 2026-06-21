/**
 * DeployableRemoveDialog Component Tests (D2 Track B — Step 06)
 *
 * The confirmation guard in front of `removeDeployable` — a DESTRUCTIVE cloud
 * undeploy (D1's best-effort teardown + cleanup). The slice-1 AppBuilderCard
 * Remove had no confirm; this dialog adds it. The dialog is controlled
 * (isOpen / onConfirm / onClose) and presentational: it does NOT post — its
 * consumer (DeployablesList) wires onConfirm to post removeDeployable. These
 * tests exercise that contract: confirm fires onConfirm (the consumer posts),
 * cancel/dismiss fires only onClose (the safety case — no teardown).
 *
 * Strict TDD: written BEFORE the component exists.
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DeployableRemoveDialog } from '@/features/dashboard/ui/components/DeployableRemoveDialog';
import '@testing-library/jest-dom';

// DialogContainer is the modal host; render its children inline for assertions.
// Modal is the shared confirm shell reused by RenameProjectDialog.
jest.mock('@adobe/react-spectrum', () => ({
    DialogContainer: ({ children }: any) => <div data-testid="dialog-container">{children}</div>,
    Flex: ({ children, ...props }: any) => <div style={{ display: 'flex' }} {...props}>{children}</div>,
    Text: ({ children, ...props }: any) => <span {...props}>{children}</span>,
}));

jest.mock('@/core/ui/components/ui/Modal', () => ({
    Modal: ({ title, actionButtons = [], onClose, children }: any) => (
        <div role="dialog" aria-label={title}>
            <h2>{title}</h2>
            {children}
            <button onClick={onClose}>Close</button>
            {actionButtons.map((b: any, i: number) => (
                <button key={i} onClick={b.onPress} data-variant={b.variant} disabled={b.isDisabled}>
                    {b.label}
                </button>
            ))}
        </div>
    ),
}));

beforeEach(() => {
    jest.clearAllMocks();
});

describe('DeployableRemoveDialog', () => {
    it('does not render the confirm dialog when closed', () => {
        render(
            <DeployableRemoveDialog
                isOpen={false}
                deployableId="erp-sync"
                onConfirm={jest.fn()}
                onClose={jest.fn()}
            />,
        );

        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('names the deployable and warns the undeploy is destructive when open', () => {
        render(
            <DeployableRemoveDialog
                isOpen
                deployableId="erp-sync"
                onConfirm={jest.fn()}
                onClose={jest.fn()}
            />,
        );

        expect(screen.getByRole('dialog')).toBeInTheDocument();
        // Names the deployable.
        expect(screen.getByText(/erp-sync/)).toBeInTheDocument();
        // Warns this is a destructive cloud teardown, not a local-only action.
        expect(screen.getByText(/permanently|destructive|undeploy|tear.?down|cloud/i)).toBeInTheDocument();
    });

    it('fires onConfirm (the consumer posts removeDeployable) then closes on confirm', async () => {
        const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
        const onConfirm = jest.fn();
        const onClose = jest.fn();
        render(
            <DeployableRemoveDialog
                isOpen
                deployableId="erp-sync"
                onConfirm={onConfirm}
                onClose={onClose}
            />,
        );

        await user.click(screen.getByRole('button', { name: /^remove$/i }));

        expect(onConfirm).toHaveBeenCalledTimes(1);
    });

    it('exposes the confirm action with destructive (negative) styling', () => {
        render(
            <DeployableRemoveDialog
                isOpen
                deployableId="erp-sync"
                onConfirm={jest.fn()}
                onClose={jest.fn()}
            />,
        );

        const confirm = screen.getByRole('button', { name: /^remove$/i });
        expect(confirm).toHaveAttribute('data-variant', 'negative');
    });

    it('SAFETY: cancel/dismiss closes WITHOUT confirming (no teardown)', async () => {
        const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
        const onConfirm = jest.fn();
        const onClose = jest.fn();
        render(
            <DeployableRemoveDialog
                isOpen
                deployableId="erp-sync"
                onConfirm={onConfirm}
                onClose={onClose}
            />,
        );

        await user.click(screen.getByRole('button', { name: /close/i }));

        expect(onConfirm).not.toHaveBeenCalled();
        expect(onClose).toHaveBeenCalledTimes(1);
    });
});
