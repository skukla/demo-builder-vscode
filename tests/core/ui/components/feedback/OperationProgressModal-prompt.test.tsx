/**
 * The progress modal shows a question the work is paused on (PL-59, owner 2026-09-20).
 *
 * Republishing put this modal on screen saying "Checking requirements / Your DA.live
 * sign-in" while a notification asked for that sign-in. The question belongs here,
 * and these assertions are about what the modal RENDERS and what it posts back —
 * the extension half is `tests/core/vscode/operationPrompt.test.ts`.
 */

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import type { OperationProgressPayload } from '@/types/webviewPayloads';

jest.mock('@adobe/react-spectrum', () => ({
    DialogContainer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    Flex: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    Text: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
    TextField: ({ label, type, value, onChange, description }: any) => (
        <label>
            {label}
            <input
                aria-label={label}
                type={type === 'password' ? 'password' : 'text'}
                value={value}
                onChange={(event) => onChange(event.target.value)}
            />
            {description ? <span data-testid={`${label}-description`}>{description}</span> : null}
        </label>
    ),
}));



// The real Modal, reduced to what these assertions read: its title, its buttons and
// its dismiss affordance. Buttons carry their label, which is what a guard supplies.
jest.mock('@/core/ui/components/ui/Modal', () => ({
    Modal: ({ title, actionButtons = [], closeLabel, onClose, children }: any) => (
        <div role="dialog" aria-label={title}>
            {children}
            <button onClick={onClose}>{closeLabel}</button>
            {actionButtons.map((button: any) => (
                <button key={button.label} data-variant={button.variant} onClick={button.onPress}>
                    {button.label}
                </button>
            ))}
        </div>
    ),
}));

jest.mock('@/core/ui/components/feedback/LoadingDisplay', () => ({
    LoadingDisplay: ({ message }: { message: string }) => <div data-testid="loading">{message}</div>,
}));

jest.mock('@/core/ui/components/feedback/StatusDisplay', () => ({
    StatusDisplay: ({ variant, title, message }: any) => (
        <div data-testid="status" data-variant={variant}>
            <span>{title}</span>
            <span>{message}</span>
        </div>
    ),
}));

const mockPostMessage = jest.fn();
jest.mock('@/core/ui/utils/WebviewClient', () => ({
    webviewClient: { postMessage: (...args: unknown[]) => mockPostMessage(...args) },
}));

let progress: OperationProgressPayload | null = null;
jest.mock('@/core/ui/hooks/useOperationProgress', () => ({
    useOperationProgress: () => progress,
}));

// The mocks hoist above this import; the component must bind to them, not the real ones.
import { OperationProgressModal } from '@/core/ui/components/feedback/OperationProgressModal';

const OPERATION = {
    id: 'republish:bodea',
    title: 'Republishing Bodea',
    failureTitle: "Couldn't republish Bodea",
    run: 1,
    resume: false,
};

function renderModal(): { onRetry: jest.Mock; onClose: jest.Mock } {
    const onRetry = jest.fn();
    const onClose = jest.fn();
    render(<OperationProgressModal operation={OPERATION} onRetry={onRetry} onClose={onClose} />);
    return { onRetry, onClose };
}

const user = (): ReturnType<typeof userEvent.setup> =>
    userEvent.setup({ advanceTimers: jest.advanceTimersByTime });

beforeEach(() => {
    jest.clearAllMocks();
    progress = null;
});

it('shows the question in place of the spinner', () => {
    progress = {
        id: OPERATION.id,
        state: 'running',
        stage: 'Checking requirements',
        prompt: { message: 'Your DA.live session has expired.', actions: ['Sign In'] },
    };

    renderModal();

    expect(screen.getByTestId('status')).toHaveAttribute('data-variant', 'warning');
    expect(screen.getByText('Your DA.live session has expired.')).toBeInTheDocument();
    expect(screen.queryByTestId('loading')).not.toBeInTheDocument();
});

it('offers each answer, the one that continues the work first', () => {
    progress = {
        id: OPERATION.id,
        state: 'running',
        prompt: { message: 'Conflicts need your input.', actions: ['Continue', 'Cancel and Reset'] },
    };

    renderModal();

    expect(screen.getByRole('button', { name: 'Continue' })).toHaveAttribute(
        'data-variant',
        'accent',
    );
    expect(screen.getByRole('button', { name: 'Cancel and Reset' })).toHaveAttribute(
        'data-variant',
        'secondary',
    );
});

it('hands the chosen answer back to the work waiting on it', async () => {
    progress = {
        id: OPERATION.id,
        state: 'running',
        prompt: { message: 'Your DA.live session has expired.', actions: ['Sign In'] },
    };
    const { onClose } = renderModal();

    await user().click(screen.getByRole('button', { name: 'Sign In' }));

    expect(mockPostMessage).toHaveBeenCalledWith('answerOperationPrompt', {
        id: OPERATION.id,
        answer: 'Sign In',
        // A question with no fields still carries the (empty) form values, so the
        // extension side reads one shape whatever it asked for.
        values: {},
    });
    // The work carries on and the modal goes back to narrating it, so answering is
    // not closing.
    expect(onClose).not.toHaveBeenCalled();
});

// Backgrounding an unanswered question would leave the work waiting with nothing
// left to answer it, so the dismiss affordance says Cancel and IS the answer.
it('cancels rather than backgrounding while it waits', async () => {
    progress = {
        id: OPERATION.id,
        state: 'running',
        prompt: { message: 'Your DA.live session has expired.', actions: ['Sign In'] },
    };
    const { onClose } = renderModal();

    await user().click(screen.getByRole('button', { name: 'Cancel' }));

    expect(mockPostMessage).toHaveBeenCalledWith('answerOperationPrompt', {
        id: OPERATION.id,
        answer: undefined,
        values: {},
    });
    expect(mockPostMessage).not.toHaveBeenCalledWith('backgroundOperation', expect.anything());
    expect(onClose).toHaveBeenCalled();
});

it('still offers Run in background when nothing is being asked', async () => {
    progress = { id: OPERATION.id, state: 'running', stage: 'Publishing pages' };
    renderModal();

    await user().click(screen.getByRole('button', { name: 'Run in background' }));

    expect(mockPostMessage).toHaveBeenCalledWith('backgroundOperation', {
        id: OPERATION.id,
        title: OPERATION.title,
    });
});

describe('a question that needs something typed', () => {
    const SIGN_IN = {
        message: 'Sign in to DA.live.',
        actions: ['Sign In', 'Open DA.live'],
        fields: [
            { id: 'orgName', label: 'DA.live namespace', value: 'acme' },
            { id: 'token', label: 'Token', secret: true, description: 'That token was refused.' },
        ],
    };

    it('renders the fields, masking the credential', () => {
        progress = { id: OPERATION.id, state: 'running', prompt: SIGN_IN };

        renderModal();

        expect(screen.getByText('Sign in to DA.live.')).toBeInTheDocument();
        expect(screen.getByLabelText('DA.live namespace')).toHaveValue('acme');
        expect(screen.getByLabelText('Token')).toHaveAttribute('type', 'password');
        expect(screen.getByTestId('Token-description')).toHaveTextContent('That token was refused.');
    });

    it('hands back what was typed with the action', async () => {
        progress = { id: OPERATION.id, state: 'running', prompt: SIGN_IN };
        renderModal();

        await user().type(screen.getByLabelText('Token'), 'eyJnew');
        await user().click(screen.getByRole('button', { name: 'Sign In' }));

        expect(mockPostMessage).toHaveBeenCalledWith('answerOperationPrompt', {
            id: OPERATION.id,
            answer: 'Sign In',
            values: { orgName: 'acme', token: 'eyJnew' },
        });
    });

    // Going to da.live must not cost what is already typed: the values ride along,
    // and the extension asks again with them.
    it('carries the values through the trip to da.live', async () => {
        progress = { id: OPERATION.id, state: 'running', prompt: SIGN_IN };
        renderModal();

        await user().click(screen.getByRole('button', { name: 'Open DA.live' }));

        expect(mockPostMessage).toHaveBeenCalledWith('answerOperationPrompt', {
            id: OPERATION.id,
            answer: 'Open DA.live',
            values: { orgName: 'acme', token: '' },
        });
    });
});
