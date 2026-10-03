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
import type { ErpOwnsEntry, ErpOwnsRule } from '@/types/erpOwnership';

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
    /** Run the ERP reset the integration card's confirmation dialog just agreed to. */
    resetErp: (id: string) => void;
    /** Fill an ERP from Commerce; `id` is the integration it runs through, `erp` which of its ERPs. */
    loadErpData: (id: string, erpName: string, erp?: string) => void;
    /** Add another ERP to the integration `id`, named `erpName`, owning what `owns` says (AB-16, AB-64). */
    addErp: (id: string, erpName: string, owns: ErpOwnsRule, existingOwns: ErpOwnsEntry[]) => void;
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
     * The ERP reset, which the integration card confirms in its own dialog first.
     *
     * Not in `run`: the others are card ACTIONS keyed by CardAction, and this one
     * arrives after a confirmation. It always covers every ERP the integration serves.
     * It was opening a notification of its own until 2026-09-20.
     */
    const resetErp = useCallback(
        (id: string): void => {
            start({
                id,
                name: 'the ERPs',
                message: 'resetErpRecords',
                title: 'Resetting the ERPs',
                failureTitle: "Couldn't reset the ERPs",
                successTitle: 'ERPs reset',
            });
        },
        [start],
    );

    /** The ERP fill: through the integration's id, like the reset, with no confirm (it removes nothing). */
    const loadErpData = useCallback(
        (id: string, erpName: string, erp?: string): void => {
            start({
                id,
                name: erpName,
                message: 'loadErpDemoData',
                ...(erp ? { payload: { erp } } : {}),
                title: `Filling ${erpName} from Commerce`,
                failureTitle: `Couldn't fill ${erpName} from Commerce`,
                successTitle: `${erpName} filled from Commerce`,
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

    /**
     * Add another ERP (AB-16): keyed by the INTEGRATION, whose card asked, because the new
     * ERP's id is chosen by the extension.
     */
    const addErp = useCallback(
        (id: string, erpName: string, owns: ErpOwnsRule, existingOwns: ErpOwnsEntry[]): void => {
            start({
                id,
                name: erpName,
                message: 'addErp',
                payload: { name: erpName, owns, existingOwns },
                title: `Adding ${erpName}`,
                failureTitle: `Couldn't add ${erpName}`,
                successTitle: `${erpName} added`,
            });
        },
        [start],
    );

    return useMemo(
        () => ({ ...runner, run, started, resetErp, loadErpData, addErp }),
        [runner, run, started, resetErp, loadErpData, addErp],
    );
}
