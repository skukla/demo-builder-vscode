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
 * The message each operation action sends. Retry rides Deploy. Update has its own
 * message, which fetches the newer code before it redeploys (a redeploy alone
 * deploys the folder as it is).
 */
const OPERATION_MESSAGES: Partial<Record<CardAction, string>> = {
    deploy: 'deployAppBuilderComponent',
    retry: 'deployAppBuilderComponent',
    redeploy: 'redeployAppBuilderComponent',
    update: 'updateAppBuilderComponent',
    // Re-run the Commerce install pass WITHOUT a redeploy (AB-5).
    install: 'installAppBuilderComponent',
    remove: 'removeAppBuilderComponent',
};

/**
 * What each action is called while it runs, and in the sentence when it fails.
 *
 * The running form is the modal's title and, word for word, the title of the
 * notification it hands over to on "Run in background" — the same "-ing" title the
 * operation's own notification has always used ("Deploying ERP Sync",
 * `withComponentProgress`). So moving to the background reads as the same thing
 * carrying on.
 */
const VERBS: Partial<Record<CardAction, { running: string; base: string; suffix?: string }>> = {
    deploy: { running: 'Deploying', base: 'deploy' },
    retry: { running: 'Deploying', base: 'deploy' },
    redeploy: { running: 'Redeploying', base: 'redeploy' },
    update: { running: 'Updating', base: 'update' },
    install: { running: 'Installing', base: 'install', suffix: ' into Commerce' },
    remove: { running: 'Removing', base: 'remove' },
};

/** The running title and the failure title for an action on a named integration. */
function titlesFor(action: CardAction, name: string): Pick<ComponentOperation, 'title' | 'failureTitle'> {
    const verb = VERBS[action];
    if (!verb) return { title: name, failureTitle: `${name} did not finish` };
    const suffix = verb.suffix ?? '';
    return { title: `${verb.running} ${name}${suffix}`, failureTitle: `Couldn't ${verb.base} ${name}${suffix}` };
}

export interface ComponentOperation {
    id: string;
    name: string;
    action: CardAction;
    /** The modal's title, and the notification's when it runs in the background. */
    title: string;
    /** The failure view's title: "Couldn't redeploy ERP integration". */
    failureTitle: string;
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
        const titles = titlesFor(action, name);
        setLast((previous) => ({ id, name, action, ...titles, run: (previous?.run ?? 0) + 1, resume: false }));
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
            title: `Adding ${name}`,
            failureTitle: `Couldn't add ${name}`,
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
