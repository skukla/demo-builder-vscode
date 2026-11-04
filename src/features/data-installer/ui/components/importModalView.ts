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

import type { ImportScopes } from '../hooks/useImportScopes';
import type { ModalView } from './ImportDatapackModalBody';
import { type LastAction, type ResultContent, resultStatus } from './importResult';
import type { ModalStatus } from '@/core/ui/components/ui/Modal';

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
    // No write yet (a dry run): whichever exists is the job
    // this modal was reopened onto.
    return startId ?? resetId;
}

/**
 * The job was accepted and its first status read has not answered. Having nothing to show yet is
 * still a wait: this fell through to the import form, at the form's width, mid-removal. A read that
 * answers with no record lets go, so the dialog cannot hang on a spinner.
 */
export function isPickingUp(
    activation: string | undefined,
    record: { activationId?: string } | null,
    askedAbout: string | undefined,
    reading: boolean,
): boolean {
    if (!activation || record?.activationId === activation) return false;
    return askedAbout !== activation || reading;
}

/** One view at a time; this precedence IS the state machine. */
export function resolveView(state: {
    busy: boolean;
    /** The SC pressed Remove and the read of what they changed is out. */
    readingChanges?: boolean;
    resetArmed: boolean;
    running: boolean;
    /** The SC is still following the running job; false once they press Close. */
    watching: boolean;
    result: ResultContent | null;
    /** The project named no Commerce instance, and the target request settled. */
    noInstance: boolean;
}): ModalView {
    if (state.busy) {
        return 'busy';
    }
    if (state.readingChanges) {
        return 'reading-changes';
    }
    if (state.resetArmed) {
        return 'confirm-reset';
    }
    if (state.running) {
        return state.watching ? 'watching' : 'stopped-watching';
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

/**
 * "Remove …" while a removal starts or runs, so the wait's title says what the window is doing
 * (owner, 2026-10-31), including a reopened watch of one. The confirm asks its own question and a
 * result's title is its outcome (`viewFrame`); the form is always the import's.
 */
export function isRemoving(a: { armed: boolean; lastAction: LastAction | null; view: ModalView; operation?: 'import' | 'reset' }): boolean {
    return a.armed || (a.lastAction === 'reset' && a.view !== 'form') || (a.view === 'watching' && a.operation === 'reset');
}

/**
 * Which in-flight operation the one busy spinner is narrating.
 *
 * @param savingStage - the stage of saving the SC's changes first, while a removal waits on it
 */
export function busyMessage(starting: boolean, resetting: boolean, savingStage?: string): string {
    if (savingStage) {
        return savingStage;
    }
    if (starting) {
        return 'Starting import';
    }
    if (resetting) {
        // "removal", matching the button and the progress verb.
        return 'Starting removal';
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
    stopWatching: () => void;
    validate: () => void;
    armReset: () => void;
    disarmReset: () => void;
    confirmReset: () => void;
    startImport: () => void;
    goBack: () => void;
    /** The confirm's main button: `removeLabel`. */
    removeLabel?: string;
    /** With changes to keep: the confirm's second way on, which loses them. */
    removeWithoutSaving?: () => void;
    /** Saving first makes a new pack (Save As), since the demo's pack is not the SC's. */
    removeSavesAs?: boolean;
    /** The main button waits on a Save As name. */
    removeDisabled?: boolean;
    /** A removal takes all the record lists, whatever is ticked, so the form's button says all. */
    removesAll?: boolean;
    /** Whether the form's removal may be pressed; as `canStart` when it does not say. */
    canRemove?: boolean;
}): {
    label: string;
    variant: 'secondary' | 'accent' | 'negative' | 'quiet';
    onPress: () => void;
    isDisabled?: boolean;
}[] {
    if (a.view === 'watching') {
        // NOT "Cancel" — no endpoint exists to cancel with.
        return [{ label: 'Close', variant: 'secondary', onPress: a.stopWatching }];
    }
    if (a.view === 'confirm-reset') {
        // Cancel stands in for Close here (the frame hides Close): two buttons that both
        // backed out was one too many (dialog design rules).
        if (a.removeWithoutSaving) {
            // Changes to keep: saving is the likely intent, so it is the main button; losing them
            // is its own button rather than a box to untick (owner, 2026-11-03).
            return [
                { label: 'Cancel', variant: 'secondary', onPress: a.disarmReset },
                { label: 'Remove Without Saving', variant: 'negative', onPress: a.removeWithoutSaving },
                { label: a.removeSavesAs ? 'Save As New and Remove' : 'Save and Remove', variant: 'accent', onPress: a.confirmReset, isDisabled: a.removeDisabled === true },
            ];
        }
        return [
            { label: 'Cancel', variant: 'secondary', onPress: a.disarmReset },
            { label: a.removeLabel ?? 'Remove', variant: 'negative', onPress: a.confirmReset },
        ];
    }
    if (a.view === 'result') {
        return [{ label: 'Back', variant: 'secondary', onPress: a.goBack }];
    }
    // Nothing left to press but the way out: the job goes on by itself, or there is no instance
    // to import to.
    if (a.view === 'stopped-watching' || a.view === 'no-instance') {
        return [];
    }
    // form and busy share the row. While busy the body shows the spinner, so every button keeps
    // its label and stops taking presses: one spinner per wait, and no "-ing" label (owner,
    // 2026-10-31).
    return [
        // Arms only. Removing data always takes a second, explicit press.
        //
        // "Remove data…", not "Reset…": a project RESET restores the pack —
        // deletes it and imports the same one again — so the same word meant
        // opposite things one menu apart, and this modal's own confirm text
        // ("cannot be undone") was true here and false there.
        //
        // "Remove all data" when Demo Builder's engine installed it: the removal takes what its
        // record lists, so the button must not read as acting on the ticks above it.
        { label: a.removesAll ? 'Remove All Data' : 'Remove Data', variant: 'quiet', onPress: a.armReset, isDisabled: !(a.canRemove ?? a.canStart) },
        { label: 'Dry Run', variant: 'quiet', onPress: a.validate, isDisabled: !a.canStart },
        {
            label: 'Import',
            variant: 'accent',
            onPress: a.startImport,
            isDisabled: !a.canStart,
        },
    ];
}

/** The chosen target by name, "Justrite Test Store US (Justrite Test)", or the instance when unnamed. */
export function targetName(scope: ImportScopes, commerceInstance: string): string {
    const website = scope.websites.find((w) => w.code === scope.websiteCode);
    const store = website?.storeViews.find((v) => v.code === scope.storeCode);
    if (website && store) return `${store.name} (${website.name})`;
    return website?.name ?? commerceInstance;
}

/** The dialog around the view: its title, the title's status, its width, and whether Close shows. */
export interface ViewFrame {
    title: string;
    status?: ModalStatus;
    size: 'S' | 'M' | 'L';
    wide: boolean;
    hideClose: boolean;
}

/**
 * The way out: closing a job still being followed hands it to a progress notification, and so does
 * closing a removal that is saving the SC's changes first (`handsOver`). While the confirm's read
 * is out it is the Cancel the confirm is about to show.
 */
export function closeLabel(view: ModalView, handsOver = false): string {
    if (view === 'reading-changes') return 'Cancel';
    return view === 'watching' || (view === 'busy' && handsOver) ? 'Run in Background' : 'Close';
}

/**
 * The form's width, from how many data types it lists: one column at medium, two at large, three
 * extra-wide (`.datapack-type-grid` takes columns of at least 260px). Decided by the pack, so it is
 * fixed for the dialog's life; the dialog was extra-wide for every pack until 2026-10-31, which
 * left a one-type pack's form floating in a 980px box.
 */
function formWidth(typeCount: number): Pick<ViewFrame, 'size' | 'wide'> {
    if (typeCount <= 6) return { size: 'M', wide: false };
    if (typeCount <= 12) return { size: 'L', wide: false };
    return { size: 'L', wide: true };
}

/**
 * Each view's frame, by the dialog design rules (`docs/development/sop/dialog-design.md`): the
 * form takes the width its types need; the confirm, the wait and the result are small, and the
 * dialog eases between widths. The confirm asks its question as the title, naming the store, so
 * a removal aimed at the wrong store is hard to miss (owner, 2026-10-31: one nearly went to the
 * real website). A result's title is the outcome, with its status icon.
 */
export function viewFrame(a: {
    view: ModalView;
    displayName: string;
    removing: boolean;
    store: string;
    typeCount: number;
    result: ResultContent | null;
}): ViewFrame {
    const small = { size: 'S' as const, wide: false, hideClose: false };
    // Amber: nothing failed, and the next move is the SC's.
    if (a.view === 'no-instance') return { ...small, title: 'This project has no Commerce instance', status: 'warning' };
    if (a.view === 'stopped-watching') return { ...small, title: 'Running in Background' };
    switch (a.view) {
        // One title for the read and the confirm it leads to, so the wait does not retitle the dialog.
        case 'reading-changes':
            return { ...small, title: `Remove from ${a.store}?`, status: 'warning' };
        case 'confirm-reset':
            return { ...small, title: `Remove from ${a.store}?`, status: 'warning', hideClose: true };
        case 'result':
            return a.result
                ? {
                      ...small,
                      // The Admin path reads as one line at medium, not as several steps.
                      size: a.result.keptRoot ? ('M' as const) : small.size,
                      title: a.result.title,
                      status: resultStatus(a.result),
                  }
                : { ...small, title: `Import ${a.displayName}` };
        case 'busy':
        case 'watching':
            return { ...small, title: `${a.removing ? 'Remove' : 'Import'} ${a.displayName}` };
        default:
            return { ...formWidth(a.typeCount), hideClose: false, title: `Import ${a.displayName}` };
    }
}
