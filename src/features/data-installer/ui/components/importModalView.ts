/**
 * What the import modal shows for the state it is in: which view, which job it
 * watches, the busy line, and the footer row for each view.
 *
 * Pure: no React, no requests. Split out of `ImportDatapackModal` (EDS-8,
 * 2026-10-09) so the component keeps the state and the requests, and the
 * decisions it derives from them can be read and tested on their own, the same
 * way `importResult` decides which outcome the result view shows.
 *
 * @module features/data-installer/ui/components/importModalView
 */

import type { ModalView } from './ImportDatapackModalBody';
import type { LastAction, ResultContent } from './importResult';

/**
 * Which job to watch: the one the LAST action started.
 *
 * `useVSCodeRequest.execute` clears `error` before a request but NOT `data`, and
 * nothing in this modal calls its `reset()`. So a finished import leaves
 * `start.value.activationId` set for the modal's lifetime, and the previous
 * `start ?? reset` preferred it forever — an import followed by a reset watched
 * the completed import, never re-read status, and discarded the reset's record
 * at the activation-id guard, dropping the user back on the form with Start
 * enabled while a destructive reset ran server-side. Reset-then-import worked,
 * which is what made it a bug and not a design.
 *
 * Exported for its own test: driving two full operations through the rendered
 * modal proved far more expensive than the rule is complex.
 */
export function watchedActivation(
    lastAction: LastAction | null,
    startId: string | undefined,
    resetId: string | undefined,
): string | undefined {
    if (lastAction === 'reset') {
        return resetId;
    }
    if (lastAction === 'start') {
        return startId;
    }
    // No write yet (a dry run, or provisioning): whichever exists is the job
    // this modal was reopened onto.
    return startId ?? resetId;
}

/** One view at a time; this precedence IS the state machine. */
export function resolveView(state: {
    busy: boolean;
    resetArmed: boolean;
    running: boolean;
    result: ResultContent | null;
    /** The project named no Commerce instance, and the target request settled. */
    noInstance: boolean;
}): ModalView {
    if (state.busy) {
        return 'busy';
    }
    if (state.resetArmed) {
        return 'confirm-reset';
    }
    if (state.running) {
        return 'watching';
    }
    if (state.result) {
        return 'result';
    }
    // Last, so a job or an outcome still shows: the instance only matters when
    // the user is about to choose something. It is no longer typeable, so a
    // project without one would otherwise get a form it cannot submit.
    if (state.noInstance) {
        return 'no-instance';
    }
    return 'form';
}

/** Which in-flight operation the one busy spinner is narrating. */
export function busyMessage(starting: boolean, resetting: boolean, provisioning: boolean): string {
    if (starting) {
        return 'Starting import';
    }
    if (resetting) {
        // "removal", matching the button and the progress verb.
        return 'Starting removal';
    }
    if (provisioning) {
        return 'Setting up credentials';
    }
    return 'Checking with the service';
}

/** The footer, one row per view. */
export function buildActions(a: {
    view: ModalView;
    canStart: boolean;
    checking: boolean;
    starting: boolean;
    resetting: boolean;
    provisioning: boolean;
    offerProvisioning: boolean;
    stopWatching: () => void;
    validate: () => void;
    armReset: () => void;
    disarmReset: () => void;
    confirmReset: () => void;
    startImport: () => void;
    provisionCredentials: () => void;
    goBack: () => void;
}): {
    label: string;
    variant: 'secondary' | 'accent' | 'negative';
    onPress: () => void;
    isDisabled?: boolean;
}[] {
    if (a.view === 'watching') {
        // NOT "Cancel" — no endpoint exists to cancel with.
        return [{ label: 'Stop watching', variant: 'secondary', onPress: a.stopWatching }];
    }
    if (a.view === 'confirm-reset') {
        return [
            { label: 'Keep the data', variant: 'secondary', onPress: a.disarmReset },
            { label: 'Remove the data', variant: 'negative', onPress: a.confirmReset },
        ];
    }
    if (a.view === 'result') {
        return [
            { label: 'Back', variant: 'secondary', onPress: a.goBack },
            ...(a.offerProvisioning
                ? [
                      {
                          label: 'Set up credentials automatically',
                          variant: 'accent' as const,
                          onPress: a.provisionCredentials,
                      },
                  ]
                : []),
        ];
    }
    // form and busy share the row; busy swaps the active label and freezes it —
    // ManageApisModal's 'Applying…' pattern.
    return [
        {
            label: a.checking ? 'Checking' : 'Dry run',
            variant: 'secondary',
            onPress: a.validate,
            isDisabled: !a.canStart,
        },
        // Arms only. Removing data always takes a second, explicit press.
        //
        // "Remove data…", not "Reset…": a project RESET restores the pack —
        // deletes it and imports the same one again — so the same word meant
        // opposite things one menu apart, and this modal's own confirm text
        // ("cannot be undone") was true here and false there.
        { label: 'Remove data', variant: 'secondary', onPress: a.armReset, isDisabled: !a.canStart },
        {
            label: startLabel(a.provisioning, a.starting),
            variant: 'accent',
            onPress: a.startImport,
            isDisabled: !a.canStart,
        },
    ];
}

/**
 * The start button's label for the phase it is in.
 *
 * Provisioning wins over starting: the credential setup runs FIRST and can take
 * ~50s on its own, so a "Starting…" label during it would be describing the
 * wrong wait.
 */
function startLabel(provisioning: boolean, starting: boolean): string {
    if (provisioning) {
        return 'Setting up';
    }
    if (starting) {
        return 'Starting';
    }
    return 'Start import';
}
