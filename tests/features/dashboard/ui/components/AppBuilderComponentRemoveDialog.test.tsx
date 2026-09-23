/**
 * AppBuilderComponentRemoveDialog Component Tests (D2 Track B — Step 06)
 *
 * The confirmation guard in front of `removeAppBuilderComponent` — a DESTRUCTIVE cloud
 * undeploy (D1's best-effort teardown + cleanup). The slice-1 AppBuilderCard
 * Remove had no confirm; this dialog adds it. The dialog is controlled
 * (isOpen / onConfirm / onClose) and presentational: it does NOT post — its
 * consumer (AppBuilderComponentsList) wires onConfirm to post removeAppBuilderComponent. These
 * tests exercise that contract: confirm fires onConfirm (the consumer posts),
 * cancel/dismiss fires only onClose (the safety case — no teardown).
 *
 * Strict TDD: written BEFORE the component exists.
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AppBuilderComponentRemoveDialog } from '@/features/dashboard/ui/components/AppBuilderComponentRemoveDialog';
import '@testing-library/jest-dom';

// DialogContainer is the modal host; render its children inline for assertions.
// Modal is the shared confirm shell.
jest.mock('@adobe/react-spectrum', () => ({
    DialogContainer: ({ children }: any) => <div data-testid="dialog-container">{children}</div>,
    Flex: ({ children, ...props }: any) => (
        <div style={{ display: 'flex' }} {...props}>
            {children}
        </div>
    ),
    // Tagged so a test can count the LINES the dialog body renders — an extra
    // empty one and a consequence rendered as bare text both read identically to
    // getByText, and both are wrong.
    Text: ({ children, ...props }: any) => (
        <span data-testid="dialog-line" {...props}>
            {children}
        </span>
    ),
}));

jest.mock('@/core/ui/components/ui/Modal', () => ({
    Modal: ({ title, actionButtons = [], onClose, children }: any) => (
        <div role="dialog" aria-label={title}>
            <h2>{title}</h2>
            {children}
            <button onClick={onClose}>Close</button>
            {actionButtons.map((b: any, i: number) => (
                <button
                    key={i}
                    onClick={b.onPress}
                    data-variant={b.variant}
                    disabled={b.isDisabled}
                >
                    {b.label}
                </button>
            ))}
        </div>
    ),
}));

beforeEach(() => {
    jest.clearAllMocks();
});

describe('AppBuilderComponentRemoveDialog', () => {
    it('does not render the confirm dialog when closed', () => {
        render(
            <AppBuilderComponentRemoveDialog
                isOpen={false}
                componentName="ERP sync"
                onConfirm={jest.fn()}
                onClose={jest.fn()}
            />
        );

        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('names the component as its card does, and says what happens to it', () => {
        render(
            <AppBuilderComponentRemoveDialog
                isOpen
                componentName="ERP sync"
                onConfirm={jest.fn()}
                onClose={jest.fn()}
            />
        );

        expect(screen.getByRole('dialog')).toBeInTheDocument();
        // The card's name, not the id: "erp-integration" meant nothing to the person
        // clicking (owner, 2026-09-21).
        expect(screen.getByRole('dialog', { name: 'Remove ERP sync' })).toBeInTheDocument();
        // Says it leaves Adobe, not just this screen.
        expect(screen.getByTestId('dialog-line')).toHaveTextContent(
            'ERP sync will be undeployed from Adobe and removed from this project.',
        );
    });

    it('renders the extra consequence as its OWN line when one is supplied', () => {
        // The mesh is the case that needs it: removing it also strips MESH_ENDPOINT
        // from the storefront config, which the generic warning does not say.
        render(
            <AppBuilderComponentRemoveDialog
                isOpen
                componentName="API Mesh"
                consequence="This also removes MESH_ENDPOINT from the storefront config."
                onConfirm={jest.fn()}
                onClose={jest.fn()}
            />
        );

        const lines = screen.getAllByTestId('dialog-line');
        expect(lines).toHaveLength(2);
        expect(lines[1]).toHaveTextContent('This also removes MESH_ENDPOINT');
    });

    it('renders ONE line when the teardown reaches no further than itself', () => {
        // Without the guard the second line still renders, empty — a blank gap under
        // the warning on every component that has no extra consequence.
        render(
            <AppBuilderComponentRemoveDialog
                isOpen
                componentName="ERP sync"
                onConfirm={jest.fn()}
                onClose={jest.fn()}
            />
        );

        expect(screen.getAllByTestId('dialog-line')).toHaveLength(1);
    });

    it('fires onConfirm (the consumer posts removeAppBuilderComponent) then closes on confirm', async () => {
        const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
        const onConfirm = jest.fn();
        const onClose = jest.fn();
        render(
            <AppBuilderComponentRemoveDialog
                isOpen
                componentName="ERP sync"
                onConfirm={onConfirm}
                onClose={onClose}
            />
        );

        await user.click(screen.getByRole('button', { name: /^remove$/i }));

        expect(onConfirm).toHaveBeenCalledTimes(1);
    });

    it('exposes the confirm action with destructive (negative) styling', () => {
        render(
            <AppBuilderComponentRemoveDialog
                isOpen
                componentName="ERP sync"
                onConfirm={jest.fn()}
                onClose={jest.fn()}
            />
        );

        const confirm = screen.getByRole('button', { name: /^remove$/i });
        expect(confirm).toHaveAttribute('data-variant', 'negative');
    });

    it('SAFETY: cancel/dismiss closes WITHOUT confirming (no teardown)', async () => {
        const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
        const onConfirm = jest.fn();
        const onClose = jest.fn();
        render(
            <AppBuilderComponentRemoveDialog
                isOpen
                componentName="ERP sync"
                onConfirm={onConfirm}
                onClose={onClose}
            />
        );

        await user.click(screen.getByRole('button', { name: /close/i }));

        expect(onConfirm).not.toHaveBeenCalled();
        expect(onClose).toHaveBeenCalledTimes(1);
    });
});
