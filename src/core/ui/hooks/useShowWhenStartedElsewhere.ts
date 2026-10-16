/**
 * useShowWhenStartedElsewhere — open a screen's progress modal for an operation the
 * screen did not start (PL-59).
 *
 * `useOperationRunner` opens the modal for what the screen itself starts. Configure's
 * Republish is started from the prompt a save raises, a VS Code notification, so the
 * screen learns of it only from its first progress push. This opens the modal on
 * that push, asking where the run is (`getOperationProgress`), since the push that
 * opened it has gone by.
 *
 * Once per run: an SC who closes the modal while the run goes on is not shown it
 * again by the next step. A run's end clears that, so the next run opens it.
 *
 * @module core/ui/hooks/useShowWhenStartedElsewhere
 */

import { useEffect, useRef } from 'react';
import type { OperationRunnerControls, StartableOperation } from '@/core/ui/hooks/useOperationRunner';
import { webviewClient } from '@/core/ui/utils/WebviewClient';
import type { OperationProgressPayload } from '@/types/webviewPayloads';

/**
 * @param runner - the screen's operation runner
 * @param operation - the operation to watch for; a module-level constant, so it is stable
 */
export function useShowWhenStartedElsewhere(
    runner: Pick<OperationRunnerControls, 'show' | 'open'>,
    operation: StartableOperation,
): void {
    const { show, open } = runner;
    /** This run has been shown already; the SC may have closed it since. */
    const shown = useRef(false);
    /** The modal is on this operation already: the screen's own Retry opened it. */
    const showing = useRef(false);
    showing.current = open?.id === operation.id;

    useEffect(
        () =>
            webviewClient.onMessage('operationProgress', (data: unknown) => {
                const push = data as OperationProgressPayload | undefined;
                if (push?.id !== operation.id) return;
                if (push.state !== 'running') {
                    shown.current = false;
                    return;
                }
                if (shown.current || showing.current) {
                    shown.current = true;
                    return;
                }
                shown.current = true;
                // This push has already gone by: the modal asks where the run is.
                show(operation, true);
            }),
        [show, operation],
    );
}
