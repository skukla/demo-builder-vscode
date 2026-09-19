/**
 * useComponentOperation Hook
 *
 * Starts an integration operation from the integrations screen and keeps what its
 * progress modal needs: which integration, what it is called, and which action to
 * run again on Retry (PL-59).
 *
 * Owned by the SCREEN rather than the grid because two places start operations: the
 * grid's tiles, and the Add flow the screen hosts. Both must open the same modal.
 *
 * @module features/dashboard/ui/hooks/useComponentOperation
 */

import { useCallback, useMemo, useState } from 'react';
import type { CardAction } from '../components/integrations/integrationCardModel';
import { webviewClient } from '@/core/ui/utils/WebviewClient';

/**
 * The message each operation action sends. Update rides Redeploy (a redeploy pulls
 * the latest source) and Retry rides Deploy.
 */
const OPERATION_MESSAGES: Partial<Record<CardAction, string>> = {
    deploy: 'deployAppBuilderComponent',
    retry: 'deployAppBuilderComponent',
    redeploy: 'redeployAppBuilderComponent',
    update: 'redeployAppBuilderComponent',
    // Re-run the Commerce install pass WITHOUT a redeploy (AB-5).
    install: 'installAppBuilderComponent',
    remove: 'removeAppBuilderComponent',
};

export interface ComponentOperation {
    id: string;
    name: string;
    action: CardAction;
    /**
     * Which run this is. A new run of the same integration must start the modal
     * clean, not on the previous run's failure.
     */
    run: number;
    /** Reopened mid-run: ask the extension where it is, since the pushes so far were missed. */
    resume: boolean;
}

export interface ComponentOperationControls {
    /** The operation the modal shows, or `null` when it is closed. */
    open: ComponentOperation | null;
    /** Start an operation and open its modal. `false` when the action is not one. */
    run: (id: string, name: string, action: CardAction) => boolean;
    /** Open the modal for an add the Add flow has just sent. */
    started: (id: string, name: string) => void;
    /** Reopen the modal for the operation last started here. `false` for any other id. */
    reopen: (id: string) => boolean;
    /** Run the last operation again. */
    retry: () => void;
    /** Close the modal; the operation carries on. */
    close: () => void;
}

/** The screen's one set of operation controls. */
export function useComponentOperation(): ComponentOperationControls {
    const [last, setLast] = useState<ComponentOperation | null>(null);
    const [isOpen, setIsOpen] = useState(false);

    const run = useCallback((id: string, name: string, action: CardAction): boolean => {
        const message = OPERATION_MESSAGES[action];
        if (!message) return false;
        webviewClient.postMessage(message, { id, progress: 'modal' });
        setLast((previous) => ({ id, name, action, run: (previous?.run ?? 0) + 1, resume: false }));
        setIsOpen(true);
        return true;
    }, []);

    // A failed add persists the integration in an error state, so its Retry is a
    // deploy of what was added.
    const started = useCallback((id: string, name: string): void => {
        setLast((previous) => ({
            id,
            name,
            action: 'deploy',
            run: (previous?.run ?? 0) + 1,
            resume: false,
        }));
        setIsOpen(true);
    }, []);

    const reopen = useCallback(
        (id: string): boolean => {
            if (last?.id !== id) return false;
            setLast({ ...last, resume: true });
            setIsOpen(true);
            return true;
        },
        [last],
    );

    const retry = useCallback((): void => {
        if (last) run(last.id, last.name, last.action);
    }, [last, run]);

    const close = useCallback((): void => setIsOpen(false), []);

    return useMemo(
        () => ({ open: isOpen ? last : null, run, started, reopen, retry, close }),
        [isOpen, last, run, started, reopen, retry, close],
    );
}
