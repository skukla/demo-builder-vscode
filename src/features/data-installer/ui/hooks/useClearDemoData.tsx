/**
 * "Clear demo data" from the catalog's header (datapack-engine step 10): the message that starts
 * the clearing, and the house progress window that follows it (`OperationProgressModal`, through
 * `useOperationRunner`), as `useSaveStoreChanges` hosts the store-changes save beside it. The window
 * ends on the clearing's one sentence; closing it tells the catalog to read again.
 *
 * @module features/data-installer/ui/hooks/useClearDemoData
 */

import React, { useCallback } from 'react';
import { OperationProgressModal } from '@/core/ui/components/feedback/OperationProgressModal';
import { useOperationRunner } from '@/core/ui/hooks/useOperationRunner';
import { DEMO_DATA_CLEAR_OPERATION_ID } from '@/core/utils/operationIds';
import type { DemoDataRequest } from '@/types/demoDataWipe';

export interface ClearDemoData {
    /** Clear what the list with this token showed, on these websites (by code: the window's name). */
    clear: (token: string, websites: string[]) => void;
    /** The progress window; mount it once. */
    progressWindow: React.JSX.Element;
}

/**
 * @param onClosed - called when the window closes. Must be stable.
 */
export function useClearDemoData(onClosed: () => void): ClearDemoData {
    const { start, open, retry, close } = useOperationRunner();

    const clear = useCallback(
        (token: string, websites: string[]): void => {
            const payload: Omit<DemoDataRequest, 'progress'> = { token, confirm: true };
            start({
                id: DEMO_DATA_CLEAR_OPERATION_ID,
                name: websites.join(', '),
                message: 'clear-demo-data',
                payload: { ...payload },
                title: 'Clearing Demo Data',
                subject: websites.join(', '),
                // Named by the button's thing, Demo Data: a list of website codes would put a comma in the title.
                failureTitle: "Couldn't Clear Demo Data",
                successTitle: 'Demo Data Cleared',
            });
        },
        [start],
    );

    const closeWindow = useCallback((): void => {
        close();
        onClosed();
    }, [close, onClosed]);

    return { clear, progressWindow: <OperationProgressModal operation={open} onRetry={retry} onClose={closeWindow} /> };
}
