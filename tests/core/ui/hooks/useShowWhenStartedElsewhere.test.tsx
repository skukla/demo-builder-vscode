/**
 * useShowWhenStartedElsewhere — open the progress modal for an operation the screen did
 * not start (Configure's Republish, started from a save's prompt; 2026-10-15).
 *
 * Asserted: it opens on the first progress push of the run, asking where the run is
 * (resume), and once per run — closing it mid-run keeps it closed, the run's end lets
 * the next run open it; it ignores other operations, and a modal already on this
 * operation (the screen's own Retry) is not opened twice.
 */

import { webviewClientHandlers } from '../../../helpers/webviewClientMock';
import { act, renderHook } from '@testing-library/react';
import type { ScreenOperation, StartableOperation } from '@/core/ui/hooks/useOperationRunner';
import { useShowWhenStartedElsewhere } from '@/core/ui/hooks/useShowWhenStartedElsewhere';

const OPERATION: StartableOperation = {
    id: 'configure-republish-storefront',
    name: 'storefront',
    message: 'republish-storefront',
    title: 'Republishing storefront',
    failureTitle: "Couldn't republish the storefront",
    successTitle: 'Storefront republished',
};

function push(payload: Record<string, unknown>): void {
    act(() => webviewClientHandlers.get('operationProgress')?.(payload));
}

const running = { id: OPERATION.id, state: 'running', stage: 'Publishing the config' };

beforeEach(() => {
    jest.clearAllMocks();
});

describe('useShowWhenStartedElsewhere', () => {
    it('opens the modal on the run\'s first push, asking where the run is', () => {
        const show = jest.fn();
        renderHook(() => useShowWhenStartedElsewhere({ show, open: null }, OPERATION));

        push(running);

        expect(show).toHaveBeenCalledWith(OPERATION, true);
    });

    it('opens it once per run, so closing it mid-run keeps it closed', () => {
        const show = jest.fn();
        renderHook(() => useShowWhenStartedElsewhere({ show, open: null }, OPERATION));

        push(running);
        push({ ...running, stage: 'Publishing the block list' });

        expect(show).toHaveBeenCalledTimes(1);
    });

    it('opens it again for the next run, once the last one ended', () => {
        const show = jest.fn();
        renderHook(() => useShowWhenStartedElsewhere({ show, open: null }, OPERATION));

        push(running);
        push({ id: OPERATION.id, state: 'succeeded' });
        push(running);

        expect(show).toHaveBeenCalledTimes(2);
    });

    it('ignores other operations — control', () => {
        const show = jest.fn();
        renderHook(() => useShowWhenStartedElsewhere({ show, open: null }, OPERATION));

        push({ ...running, id: 'block-library' });

        expect(show).not.toHaveBeenCalled();
    });

    it('does not open a modal already on this operation (the screen\'s own Retry)', () => {
        const show = jest.fn();
        const open = { ...OPERATION, run: 1, resume: false } as ScreenOperation;
        renderHook(() => useShowWhenStartedElsewhere({ show, open }, OPERATION));

        push(running);

        expect(show).not.toHaveBeenCalled();
    });
});
