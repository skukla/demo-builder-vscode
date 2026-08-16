/**
 * The webview end of the progress push.
 *
 * The extension sends one message per poll; this hook decides which of them
 * belong to the job on screen. That filter is the whole reason the hook exists
 * rather than a raw subscription in the modal: a reset started while an import
 * is still being watched pushes under a different activation, and an unfiltered
 * listener would drive the ring from the wrong job.
 *
 * Strict TDD: written BEFORE the hook exists.
 */

import React from 'react';
import { render, screen, act } from '@testing-library/react';
import '@testing-library/jest-dom';

jest.mock('@/core/ui/utils/WebviewClient', () => ({
    webviewClient: { onMessage: jest.fn() },
}));

// Below the mock on purpose — see webview-test-authoring §3.
import { webviewClient } from '@/core/ui/utils/WebviewClient';
import { useImportProgress } from '@/features/data-installer/ui/hooks/useImportProgress';
import { IMPORT_PROGRESS_MESSAGE } from '@/features/data-installer/types';

const mockOnMessage = webviewClient.onMessage as jest.Mock;

/** Captures the subscribed handler so a test can push a message through it. */
function captureHandler(): () => (data: unknown) => void {
    return () => mockOnMessage.mock.calls.find((c) => c[0] === IMPORT_PROGRESS_MESSAGE)?.[1];
}

function Probe({ activationId }: { activationId?: string }): React.JSX.Element {
    const progress = useImportProgress(activationId);
    return <div data-testid="seen">{JSON.stringify(progress?.perType ?? null)}</div>;
}

const handlerFor = captureHandler();
let unsubscribe: jest.Mock;

beforeEach(() => {
    mockOnMessage.mockReset();
    unsubscribe = jest.fn();
    mockOnMessage.mockReturnValue(unsubscribe);
});

describe('useImportProgress', () => {
    it('keeps the latest poll for the job it was given', () => {
        render(<Probe activationId="act-1" />);

        act(() => {
            handlerFor()({
                activationId: 'act-1',
                perType: { categories: 'processing' },
            });
        });

        expect(screen.getByTestId('seen')).toHaveTextContent('processing');
    });

    /** The reason this is a hook and not a raw subscription. */
    it('ignores a push belonging to another job', () => {
        render(<Probe activationId="act-1" />);

        act(() => {
            handlerFor()({
                activationId: 'act-OTHER',
                perType: { categories: 'processing' },
            });
        });

        expect(screen.getByTestId('seen')).toHaveTextContent('null');
    });

    it('replaces the previous poll rather than accumulating', () => {
        render(<Probe activationId="act-1" />);

        act(() => {
            handlerFor()({ activationId: 'act-1', perType: { categories: 'processing' } });
        });
        act(() => {
            handlerFor()({ activationId: 'act-1', perType: { categories: 'success' } });
        });

        const seen = screen.getByTestId('seen');
        expect(seen).toHaveTextContent('success');
        expect(seen).not.toHaveTextContent('processing');
    });

    it('subscribes to nothing until there is a job to watch', () => {
        render(<Probe />);

        expect(mockOnMessage).not.toHaveBeenCalled();
    });

    /** A leaked listener would outlive the modal and update an unmounted tree. */
    it('unsubscribes when the modal goes away', () => {
        const { unmount } = render(<Probe activationId="act-1" />);

        unmount();

        expect(unsubscribe).toHaveBeenCalled();
    });

    /** Starting a second job must not inherit the first one's progress. */
    it('forgets the previous job when the activation changes', () => {
        const { rerender } = render(<Probe activationId="act-1" />);
        act(() => {
            handlerFor()({ activationId: 'act-1', perType: { categories: 'success' } });
        });

        rerender(<Probe activationId="act-2" />);

        expect(screen.getByTestId('seen')).toHaveTextContent('null');
    });
});
