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
function titlesFor(
    action: CardAction,
    name: string,
): Pick<ScreenOperation, 'title' | 'failureTitle'> {
    const verb = VERBS[action];
    if (!verb) return { title: name, failureTitle: `${name} did not finish` };
    const suffix = verb.suffix ?? '';
    return {
        title: `${verb.running} ${name}${suffix}`,
        failureTitle: `Couldn't ${verb.base} ${name}${suffix}`,
    };
}

/** An integration's operations: the runner's controls, plus the two cards need. */
export interface ComponentOperationControls extends OperationRunnerControls {
    /** Start an operation and open its modal. `false` when the action is not one. */
    run: (id: string, name: string, action: CardAction) => boolean;
    /** Open the modal for an add the Add flow has just sent. */
    started: (id: string, name: string) => void;
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

    // A failed add persists the integration in an error state, so its Retry is a
    // deploy of what was added. The Add flow has already sent its own message —
    // this only puts the modal in front of it.
    const started = useCallback(
        (id: string, name: string): void => {
            show({
                id,
                name,
                message: 'deployAppBuilderComponent',
                title: `Adding ${name}`,
                failureTitle: `Couldn't add ${name}`,
            });
        },
        [show],
    );

    return useMemo(() => ({ ...runner, run, started }), [runner, run, started]);
}
