/**
 * useOperationRunner — an operation whose first seconds belong to VS Code.
 *
 * A reset confirms ("are you sure?"), may ask about sample data, and only then
 * starts working. Opening the modal on the click would put a spinner behind a
 * question, so `startWhenItBegins` waits for the run to report (PL-59 slice 2).
 */

import { act, renderHook } from '@testing-library/react';
import { useOperationRunner } from '@/core/ui/hooks/useOperationRunner';
import { webviewClient } from '@/core/ui/utils/WebviewClient';

jest.mock('@/core/ui/utils/WebviewClient', () => ({
    webviewClient: {
        postMessage: jest.fn(),
        request: jest.fn(),
        onMessage: jest.fn(() => jest.fn()),
    },
}));

const request = webviewClient.request as jest.Mock;
const onMessage = webviewClient.onMessage as jest.Mock;

/**
 * Subscribers that have NOT unsubscribed. A mock that hands back every handler
 * it ever saw would deliver to one the hook has already dropped — which is the
 * difference this suite's last test turns on.
 */
const listeners = new Set<(data: unknown) => void>();

const RESET = {
    id: 'reset:bodea',
    name: 'bodea',
    message: 'resetProject',
    title: 'Resetting bodea',
    failureTitle: "Couldn't reset bodea",
    payload: { projectPath: '/projects/bodea' },
};

/** Push a progress payload to every live subscriber. */
function report(id: string): void {
    act(() => {
        for (const listener of listeners) {
            listener({ id, state: 'running', stage: 'Resetting the repository' });
        }
    });
}

beforeEach(() => {
    jest.clearAllMocks();
    listeners.clear();
    request.mockReturnValue(new Promise(() => undefined));
    onMessage.mockImplementation((_type: string, handler: (data: unknown) => void) => {
        listeners.add(handler);
        return () => listeners.delete(handler);
    });
});

describe('startWhenItBegins', () => {
    it('sends the message with the screen it reports to, and shows nothing yet', () => {
        const { result } = renderHook(() => useOperationRunner());

        act(() => result.current.startWhenItBegins(RESET));

        expect(request).toHaveBeenCalledWith('resetProject', {
            projectPath: '/projects/bodea',
            id: 'reset:bodea',
            progress: 'modal',
        });
        expect(result.current.open).toBeNull();
    });

    it('opens the modal once the run reports, asking where it already got to', () => {
        const { result } = renderHook(() => useOperationRunner());
        act(() => result.current.startWhenItBegins(RESET));

        report('reset:bodea');

        expect(result.current.open).toEqual(
            expect.objectContaining({ id: 'reset:bodea', title: 'Resetting bodea', resume: true }),
        );
    });

    it('ignores another operation reporting', () => {
        const { result } = renderHook(() => useOperationRunner());
        act(() => result.current.startWhenItBegins(RESET));

        report('reset:citisignal');

        expect(result.current.open).toBeNull();
    });

    // The SC said no at the confirmation: nothing ran, nothing reported, and the
    // screen must not sit waiting to open a modal for a run that never happens.
    it('stops waiting when the message answers without the run ever reporting', async () => {
        let settle: (value: unknown) => void = () => undefined;
        request.mockReturnValue(new Promise((resolve) => (settle = resolve)));
        const onSettled = jest.fn();
        const { result } = renderHook(() => useOperationRunner());
        act(() => result.current.startWhenItBegins(RESET, onSettled));

        await act(async () => {
            settle({ success: false, cancelled: true });
        });
        report('reset:bodea');

        expect(result.current.open).toBeNull();
        expect(onSettled).toHaveBeenCalled();
    });
});
