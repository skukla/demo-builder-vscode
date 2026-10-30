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
import type { DemoDataRequest, WipeStoreChoice } from '@/types/demoDataWipe';

export interface ClearDemoData {
    /** Clear these stores as the list with this token showed them. */
    clear: (stores: WipeStoreChoice[], token: string) => void;
    /** The progress window; mount it once. */
    progressWindow: React.JSX.Element;
}

/**
 * @param onClosed - called when the window closes. Must be stable.
 */
export function useClearDemoData(onClosed: () => void): ClearDemoData {
    const { start, open, retry, close } = useOperationRunner();

    const clear = useCallback(
        (stores: WipeStoreChoice[], token: string): void => {
            const payload: Omit<DemoDataRequest, 'progress'> = { stores, token, confirm: true };
            start({
                id: DEMO_DATA_CLEAR_OPERATION_ID,
                name: stores.map((s) => s.storeCode ?? s.websiteCode).join(', '),
                message: 'clear-demo-data',
                payload: { ...payload },
                title: 'Clearing demo data',
                subject: stores.map((s) => s.storeCode ?? s.websiteCode).join(', '),
                failureTitle: "Couldn't clear the stores",
                successTitle: 'Stores cleared',
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
