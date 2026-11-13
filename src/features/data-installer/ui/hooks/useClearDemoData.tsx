/**
 * "Clear demo data" from the catalog's header (datapack-engine step 10): the message that starts
 * the clearing, and the house progress window that follows it (`OperationProgressModal`, through
 * `useOperationRunner`), as `useSaveStoreChanges` hosts the store-changes save beside it. The save
 * question's answer, when the datapack the clearing uninstalls first was asked about, travels with
 * the request (step 06, C3). The window draws the run's rows and ends on the clearing's sentence; a
 * run that left orders or list settings to the Admin offers Open Commerce Admin. Closing it tells the
 * catalog to read again.
 *
 * @module features/data-installer/ui/hooks/useClearDemoData
 */

import React, { useCallback } from 'react';
import type { RemovalAnswer } from './useSwitchChanges';
import { OperationProgressModal, type ProgressModalNextStep } from '@/core/ui/components/feedback/OperationProgressModal';
import { useOperationRunner } from '@/core/ui/hooks/useOperationRunner';
import { webviewClient } from '@/core/ui/utils/WebviewClient';
import { DEMO_DATA_CLEAR_OPERATION_ID } from '@/core/utils/operationIds';
import type { DemoDataRequest } from '@/types/demoDataWipe';
import { ErrorCode } from '@/types/errorCodes';
import type { OperationOffer } from '@/types/webviewPayloads';

export interface ClearDemoData {
    /**
     * Clear what the list with this token showed, on these websites (by code: the window's name), with
     * the save question's answer when one was asked. Resolves `true` when the host refused for an
     * answer about the datapack's changes (`CHANGES_NEED_ANSWER`): the window asks its question, and
     * no progress window opens.
     */
    clear: (token: string, websites: string[], answer?: RemovalAnswer) => Promise<boolean>;
    /** The progress window is open: the run began (or failed before it could). */
    running: boolean;
    /** The progress window; mount it once. */
    progressWindow: React.JSX.Element;
}

/** The run's Open Commerce Admin offer as the window's button: the Admin opens through `open-commerce-admin`. */
export function clearOfferStep(offer: OperationOffer): ProgressModalNextStep | undefined {
    if (offer.action !== 'open-commerce-admin') return undefined;
    return { action: 'Open Commerce Admin', onPress: () => void webviewClient.request('open-commerce-admin').catch(() => undefined) };
}

/** Whether the clearing's answer is a refusal asking about the datapack's changes. */
const needsAnswer = (response: unknown): boolean => (response as { code?: string } | undefined)?.code === ErrorCode.CHANGES_NEED_ANSWER;

/**
 * @param onClosed - called when the window closes. Must be stable.
 */
export function useClearDemoData(onClosed: () => void): ClearDemoData {
    const { startWhenItBegins, open, retry, close } = useOperationRunner();

    // Sent as a request, the window open until the run begins: a refusal for an answer about the
    // datapack's changes comes back to the window, which asks it (C3 review, 2026-11-13).
    const clear = useCallback(
        (token: string, websites: string[], answer?: RemovalAnswer): Promise<boolean> => {
            const payload: Omit<DemoDataRequest, 'progress'> = { token, confirm: true, ...answer };
            return new Promise((resolve) => startWhenItBegins({
                id: DEMO_DATA_CLEAR_OPERATION_ID,
                name: websites.join(', '),
                message: 'clear-demo-data',
                payload: { ...payload },
                title: 'Clearing Demo Data',
                subject: websites.join(', '),
                // Named by the button's thing, Demo Data: a list of website codes would put a comma in the title.
                failureTitle: "Couldn't Clear Demo Data",
                successTitle: 'Demo Data Cleared',
            }, (response) => resolve(needsAnswer(response))));
        },
        [startWhenItBegins],
    );

    const closeWindow = useCallback((): void => {
        close();
        onClosed();
    }, [close, onClosed]);

    return {
        clear,
        running: open !== null,
        progressWindow: <OperationProgressModal operation={open} onRetry={retry} onClose={closeWindow} offerStep={clearOfferStep} />,
    };
}
