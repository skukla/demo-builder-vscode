/**
 * useComponentOperation Hook
 *
 * The integrations screen's operations, in ITS words: which message each card
 * action sends, and what the action is called while it runs and when it fails.
 *
 * Everything that is not integration-specific — what the modal is showing,
 * reopening a running one, Retry — belongs to `useOperationRunner` in core, which
 * the dashboard and the projects list use directly. This is the vocabulary layer
 * over it (PL-59).
 *
 * Owned by the SCREEN rather than the grid because two places start operations:
 * the grid's tiles, and the Add flow the screen hosts. Both must open the same
 * modal.
 *
 * @module features/dashboard/ui/hooks/useComponentOperation
 */

import { useCallback, useMemo } from 'react';
import type { CardAction } from '../components/integrations/integrationCardModel';
import {
    useOperationRunner,
    type OperationRunnerControls,
    type ScreenOperation,
} from '@/core/ui/hooks/useOperationRunner';

/** What the modal and the runner know about one operation. */
export type ComponentOperation = ScreenOperation;

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
 * What each action is called while it runs, when it fails, and when it is done.
 *
 * The running form is the modal's title and, word for word, the title of the
 * notification it hands over to on "Run in background" — the same "-ing" title the
 * operation's own notification has always used ("Deploying ERP Sync",
 * `withComponentProgress`). So moving to the background reads as the same thing
 * carrying on.
 */
const VERBS: Partial<
    Record<CardAction, { running: string; base: string; done: string; suffix?: string }>
> = {
    deploy: { running: 'Deploying', base: 'deploy', done: 'deployed' },
    retry: { running: 'Deploying', base: 'deploy', done: 'deployed' },
    redeploy: { running: 'Redeploying', base: 'redeploy', done: 'redeployed' },
    update: { running: 'Updating', base: 'update', done: 'updated' },
    install: { running: 'Installing', base: 'install', done: 'installed', suffix: ' into Commerce' },
    remove: { running: 'Removing', base: 'remove', done: 'removed' },
};

/** The running title and the failure title for an action on a named integration. */
function titlesFor(
    action: CardAction,
    name: string,
): Pick<ScreenOperation, 'title' | 'failureTitle' | 'successTitle'> {
    const verb = VERBS[action];
    if (!verb) {
        return { title: name, failureTitle: `${name} did not finish`, successTitle: `${name} finished` };
    }
    const suffix = verb.suffix ?? '';
    return {
        title: `${verb.running} ${name}${suffix}`,
        failureTitle: `Couldn't ${verb.base} ${name}${suffix}`,
        successTitle: `${name}${suffix} ${verb.done}`,
    };
}

/** An integration's operations: the runner's controls, plus the two cards need. */
export interface ComponentOperationControls extends OperationRunnerControls {
    /** Start an operation and open its modal. `false` when the action is not one. */
    run: (id: string, name: string, action: CardAction) => boolean;
    /** Open the modal for an add the Add flow has just sent; Retry re-sends it. */
    started: (id: string, name: string, payload?: Record<string, unknown>) => void;
    /** Run the ERP reset the card's confirmation dialog just agreed to. */
    resetErp: (id: string, erpName: string) => void;
}

/** The integrations screen's operation controls. */
export function useComponentOperation(): ComponentOperationControls {
    const runner = useOperationRunner();
    const { start, show } = runner;

    const run = useCallback(
        (id: string, name: string, action: CardAction): boolean => {
            const message = OPERATION_MESSAGES[action];
            if (!message) return false;
            start({ id, name, message, ...titlesFor(action, name) });
            return true;
        },
        [start],
    );

    /**
     * The ERP reset, which the card confirms in its own dialog first.
     *
     * Not in `run`: the others are card ACTIONS keyed by CardAction, and this one
     * arrives after a confirmation with the ERP's name already resolved. It was
     * opening a notification of its own until 2026-09-20.
     */
    const resetErp = useCallback(
        (id: string, erpName: string): void => {
            start({
                id,
                name: erpName,
                message: 'resetErpRecords',
                title: `Resetting ${erpName} records`,
                failureTitle: `Couldn't reset ${erpName} records`,
                successTitle: `${erpName} records reset`,
            });
        },
        [start],
    );

    /**
     * Put the modal in front of an add the Add flow has already sent.
     *
     * Retry re-sends the ADD, with the payload that started it. It used to send a
     * DEPLOY, on the reasoning that a failed add leaves the integration persisted
     * in an error state — true when the add got that far, and false when it did
     * not. An add that fails at its BOUND SYSTEM persists nothing, so Retry asked
     * to deploy something that did not exist and answered `AppBuilderComponent
     * "erp-integration" not found` (owner, 2026-09-20).
     *
     * Re-adding is also what the add handler itself documents as the recovery: an
     * error-state component is exempt from its already-added refusal precisely so
     * that adding again works.
     */
    const started = useCallback(
        (id: string, name: string, payload?: Record<string, unknown>): void => {
            show({
                id,
                name,
                message: 'addAppBuilderComponent',
                payload,
                title: `Adding ${name}`,
                failureTitle: `Couldn't add ${name}`,
                successTitle: `${name} added`,
            });
        },
        [show],
    );

    return useMemo(
        () => ({ ...runner, run, started, resetErp }),
        [runner, run, started, resetErp],
    );
}
