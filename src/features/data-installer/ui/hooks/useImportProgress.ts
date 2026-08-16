/**
 * The webview end of the import progress push.
 *
 * The extension sends one message per poll. This keeps the latest one for the
 * job on screen and discards the rest — which is the whole reason it is a hook
 * rather than a subscription inline in the modal. A reset started while an
 * import is still being watched pushes under a different activation id, and an
 * unfiltered listener would drive the ring from the wrong job.
 *
 * @module features/data-installer/ui/hooks/useImportProgress
 */

import { useEffect, useState } from 'react';
import { IMPORT_PROGRESS_MESSAGE, type ImportProgressMessage } from '../../types';
import { webviewClient } from '@/core/ui/utils/WebviewClient';

/**
 * The most recent poll for `activationId`, or null before one arrives.
 *
 * Resets to null whenever the activation changes: a second job inheriting the
 * first one's ring would show it starting at wherever the last one stopped.
 */
export function useImportProgress(activationId?: string): ImportProgressMessage | null {
    const [progress, setProgress] = useState<ImportProgressMessage | null>(null);

    useEffect(() => {
        setProgress(null);
        if (!activationId) {
            return;
        }

        return webviewClient.onMessage(IMPORT_PROGRESS_MESSAGE, (data) => {
            const message = data as ImportProgressMessage;
            if (message?.activationId === activationId) {
                setProgress(message);
            }
        });
    }, [activationId]);

    return progress;
}
