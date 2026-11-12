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
import { type LastAction, type ResultContent, resultStatus } from './importResult';
import { type ConfirmContent, removeLabel } from './removalConfirm';
import type { ModalStatus, ModalWait } from '@/core/ui/components/ui/Modal';
import { OPERATION_STAGES } from '@/core/utils/operationStages';
import { WAIT_STAGES } from '@/core/utils/waitStages';
import { DRY_RUN, INSTALL, UNINSTALL, installTitle, jobPurpose, jobWords, saveFirstLabel, withoutSavingLabel } from '@/features/data-installer/datapackWords';

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
    /** The busy wait is an import starting: it shows the run's rows, not a spinner. */
    starting?: boolean;
    /** The SC pressed Remove and the read of what they changed is out. */
    readingChanges?: boolean;
    resetArmed: boolean;
    running: boolean;
    result: ResultContent | null;
    /** The project named no Commerce instance, and the target request settled. */
    noInstance: boolean;
}): ModalView {
    if (state.busy) {
        return state.starting ? 'starting' : 'busy';
    }
    if (state.readingChanges) {
        return 'reading-changes';
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

/**
 * "Remove …" while a removal starts or runs, so the wait's title says what the window is doing
 * (owner, 2026-10-31), including a reopened watch of one. The confirm asks its own question and a
 * result's title is its outcome (`viewFrame`); the form is always the import's.
 */
export function isRemoving(a: { armed: boolean; lastAction: LastAction | null; view: ModalView; operation?: 'import' | 'reset' }): boolean {
    return a.armed || (a.lastAction === 'reset' && a.view !== 'form') || (a.view === 'watching' && a.operation === 'reset');
}

/**
 * The wait the busy view shows, as the progress window's three rows (`WAIT_STAGES`, review
 * 2026-11-10: "Starting removal" and "Checking with the service" were bare labels). An import
 * starting has no wait of its own: its steps show at once (the `starting` view).
 *
 * @param savingStage - the stage of saving the SC's changes first, while a removal waits on it
 */
export function busyMessage(resetting: boolean, savingStage?: string): ModalWait {
    if (savingStage) {
        return Object.values(OPERATION_STAGES).find((stage) => stage.label === savingStage) ?? { label: savingStage };
    }
    // The stage the removal itself reports, so nothing changes when its job starts.
    return resetting ? OPERATION_STAGES.removingDatapack : WAIT_STAGES.checkingImport;
}

/** The footer, one row per view. */
export function buildActions(a: {
    view: ModalView;
    canStart: boolean;
    checking: boolean;
    starting: boolean;
    resetting: boolean;
    validate: () => void;
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
    /** The confirm is an import's (walk F106): its buttons import, not remove. */
    confirmsImport?: boolean;
    /** The import ran to its end: the window closes, with nothing to go back to (walk F117). */
    ranToEnd?: boolean;
    /** Back would only close the window (one opened by Uninstall, with no question to return to). */
    backCloses?: boolean;
    /** The Dry Run passed: the next move is the install itself, so Install sits beside Back (Flow 2.14). */
    checkPassed?: boolean;
    /** A result's main action (`ResultContent.action`), and what each one does. */
    resultAction?: 'retry' | 'fix';
    retry?: () => void;
    fixWithAi?: () => void;
}): {
    label: string;
    variant: 'secondary' | 'accent' | 'negative' | 'quiet';
    onPress: () => void;
    isDisabled?: boolean;
    /** At the footer's start, apart from the rest (walk F111): the button that loses the SC's changes. */
    start?: true;
    /** What the button does, on hover, when its label does not say it. */
    hint?: string;
}[] {
    if (a.view === 'watching' || a.view === 'starting') {
        // The way out is Run in Background, the dialog's own close (`closeLabel`): a Close beside it
        // did the same thing, and the dialog rules allow one button per job (owner, 2026-11-07).
        // Nothing cancels: no endpoint exists to cancel with.
        return [];
    }
    if (a.view === 'confirm-reset') {
        // Cancel stands in for Close here (the frame hides Close): two buttons that both
        // backed out was one too many (dialog design rules).
        // An install's confirm asks only about the SC's changes, so its buttons say Install (walk F106).
        const verb = a.confirmsImport ? INSTALL : UNINSTALL;
        if (a.removeWithoutSaving) {
            // Changes to keep: saving is the likely intent, so it is the main button; losing them
            // is its own button rather than a box to untick (owner, 2026-11-03).
            return [
                { label: 'Cancel', variant: 'secondary', onPress: a.disarmReset },
                // At the start, as Don't Save stands apart in a Save dialog (owner, 2026-11-09, F111).
                { label: withoutSavingLabel(verb), variant: a.confirmsImport ? 'secondary' : 'negative', onPress: a.removeWithoutSaving, start: true },
                { label: saveFirstLabel(verb, a.removeSavesAs === true), variant: 'accent', onPress: a.confirmReset, isDisabled: a.removeDisabled === true },
            ];
        }
        return [
            { label: 'Cancel', variant: 'secondary', onPress: a.disarmReset },
            a.confirmsImport
                ? { label: `${INSTALL} Anyway`, variant: 'accent', onPress: a.confirmReset }
                : { label: a.removeLabel ?? UNINSTALL, variant: 'negative', onPress: a.confirmReset },
        ];
    }
    if (a.view === 'result') {
        // A finished import ends on Close alone, as the save window and the Updates run do (walk
        // F117); Back is for a stop or a dry run, where going back to the form is the next move.
        // A window opened by Uninstall has no form behind it: its Back only closed, beside the Close
        // that does the same (review, 2026-11-10), so it ends on Close alone.
        if (a.ranToEnd || a.backCloses) return resultMain(a);
        const back = { label: 'Back', variant: 'secondary' as const, onPress: a.goBack };
        // A check that passed asks for the install next: the same install the form's button starts.
        if (a.checkPassed) return [back, { label: INSTALL, variant: 'accent', onPress: a.startImport, isDisabled: !a.canStart }];
        return [back, ...resultMain(a)];
    }
    // Nothing left to press but the way out: there is no instance to import to.
    if (a.view === 'no-instance') {
        return [];
    }
    // form and busy share the row. While busy the body shows the spinner, so every button keeps
    // its label and stops taking presses: one spinner per wait, and no "-ing" label (owner,
    // 2026-10-31).
    return [
        // Remove Data is not here: it is the flyout's own action, opening this window straight on
        // its confirm (owner, 2026-11-09, walk F118: pressing Import to remove data was strange).
        // Outlined, as Close is: the house's secondary button, not plain text (walk F102).
        { label: DRY_RUN, variant: 'secondary', onPress: a.validate, isDisabled: !a.canStart },
        {
            label: INSTALL,
            variant: 'accent',
            onPress: a.startImport,
            isDisabled: !a.canStart,
        },
    ];
}

/** A result's main button, last in the footer: Retry, or Fix with AI. */
function resultMain(a: { resultAction?: 'retry' | 'fix'; retry?: () => void; fixWithAi?: () => void }): ReturnType<typeof buildActions> {
    if (a.resultAction === 'retry' && a.retry) return [{ label: 'Retry', variant: 'accent', onPress: a.retry }];
    if (a.resultAction === 'fix' && a.fixWithAi) {
        return [{ label: 'Fix with AI', variant: 'accent', onPress: a.fixWithAi, hint: 'Opens your AI assistant on this problem' }];
    }
    return [];
}

/** The dialog around the view: its title, the title's status, its width, and whether Close shows. */
export interface ViewFrame {
    title: string;
    status?: ModalStatus;
    size: 'S' | 'M' | 'L';
    wide: boolean;
    hideClose: boolean;
    /** A wait with its own buttons keeps its box (`Modal.holdSize`): a removal's spinner. */
    holdSize?: true;
}

/**
 * The way out: closing a job still being followed hands it to a progress notification, and so does
 * closing a removal that is saving the SC's changes first (`handsOver`). While the confirm's read
 * is out it is the Cancel the confirm is about to show.
 */
export function closeLabel(view: ModalView, handsOver = false): string {
    if (view === 'reading-changes') return 'Cancel';
    return view === 'watching' || view === 'starting' || (view === 'busy' && handsOver) ? 'Run in Background' : 'Close';
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

/** The run's width: the form's for two columns of data types, medium for one (walk F135). */
function runWidth(typeCount: number, columns: 1 | 2): Pick<ViewFrame, 'size' | 'wide'> {
    return columns === 2 ? formWidth(typeCount) : { size: 'M', wide: false };
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
    /** The data types' columns (`runColumns`): the run, and the check and question before it, take its width. */
    columns: 1 | 2;
    result: ResultContent | null;
    /** The confirm is an import's, replacing the demo's pack (walk F97): it asks about the SC's changes. */
    replacing?: string;
    /** The check for the SC's changes could not run: the confirm's title says so (review, 2026-11-10). */
    checkFailed?: boolean;
    /** The job's record: a running job is titled by what it is for, wherever it was started. */
    record?: Parameters<typeof jobPurpose>[0] | null;
    /** What a start is before its record: a switch over another datapack, else an install. */
    starts?: 'install' | 'switch';
}): ViewFrame {
    const small = { size: 'S' as const, wide: false, hideClose: false };
    // An import's confirm asks only whether to keep the SC's changes (walk F106). Every confirm is
    // wide enough for its buttons on one line, the one that loses changes at the start (F104, F111),
    // and the check before it is the same width, so nothing jumps when the question comes (F109).
    const asked = a.replacing ? 'Save Your Changes First?' : `Uninstall ${a.displayName} from ${a.store}?`;
    const question = a.checkFailed ? "Couldn't Check for Changes" : asked;
    // An import's check and question take the run's own box, so the window keeps one width from the
    // check to the end and the three buttons sit on one line, as the mockup had them (owner,
    // 2026-11-09, walk F127: at medium, Save and Import fell to a second line and the box widened
    // when the steps came). An uninstall's confirm stays medium: nothing runs in its box after.
    const run = runWidth(a.typeCount, a.columns);
    const confirmFrame = a.replacing ? run : { size: 'M' as const, wide: false };
    // While it checks, the title names the work, not a question nothing has asked yet (walk F108).
    const checking = a.replacing ? installTitle(a.displayName, false) : `${UNINSTALL} ${a.displayName}`;
    const running = runningTitle(a);
    // Amber: nothing failed, and the next move is the SC's.
    if (a.view === 'no-instance') return { ...small, title: 'No Commerce Instance', status: 'warning' };
    switch (a.view) {
        case 'reading-changes':
            return { ...small, ...confirmFrame, title: checking };
        case 'confirm-reset':
            return { ...small, ...confirmFrame, title: question, status: 'warning', hideClose: true };
        case 'result':
            // An import that ended with a problem stays on its steps, in the run's box; a clean one
            // has no `run` and hands off to the small result (walk F134).
            if (a.result?.run) return { ...run, hideClose: false, title: a.result.title, status: resultStatus(a.result) };
            return a.result
                ? {
                      ...small,
                      // The Admin path reads as one line at medium, not as several steps.
                      size: a.result.keptRoot ? ('M' as const) : small.size,
                      title: a.result.title,
                      status: resultStatus(a.result),
                  }
                : { ...small, title: installTitle(a.displayName, false) };
        case 'starting':
            return { ...run, hideClose: false, title: running };
        case 'watching':
            // An import's rows take the form's box; a removal still waits on its spinner.
            return a.removing ? { ...small, title: running, holdSize: true } : { ...run, hideClose: false, title: running };
        case 'busy':
            return { ...small, title: a.removing ? running : installTitle(a.displayName, true) };
        default:
            return { ...formWidth(a.typeCount), hideClose: false, title: installTitle(a.displayName, false) };
    }
}

/**
 * A running job's title, by what it is for (`jobWords`, step 03): a removal's, the record's once the
 * job runs (a restore or undo started elsewhere reads as itself), else what the start is.
 */
function runningTitle(a: Pick<Parameters<typeof viewFrame>[0], 'view' | 'displayName' | 'removing' | 'record' | 'starts'>): string {
    if (a.removing) return jobWords('uninstall', a.displayName).running;
    if (a.view === 'watching' && a.record) return jobWords(jobPurpose(a.record), a.displayName).running;
    return jobWords(a.starts ?? 'install', a.displayName).running;
}

/**
 * The dialog's wait: starting or removing, or what it needs before the form can show. `reading` has
 * to cover the first frame, before any request has been sent: a form drawn there set the box the
 * wait then kept (407px).
 */
export function waitOf(view: ModalView, reading: boolean, busy: ModalWait, comparing: ModalWait | false = false): ModalWait | false {
    // A pack the project has: the store compared with it before the form (`useImportChanges`).
    if (comparing) return comparing;
    if (view === 'busy') return busy;
    // The same check before a removal or a replace, in the same words (walk F114).
    if (view === 'reading-changes') return WAIT_STAGES.checkingForChanges;
    return view === 'form' && reading ? WAIT_STAGES.readingWebsites : false;
}

/**
 * The confirm's buttons: one Remove, or, with changes to keep, Save and Remove beside Remove
 * Without Saving, the save waiting on a Save As name when it needs one. The same for a removal and
 * for an import replacing the demo's pack (walk F97).
 */
export function removalButtons(
    removal: { content: ConfirmContent; canSave: boolean },
    confirmRemoval: (save: boolean) => void,
): Pick<Parameters<typeof buildActions>[0], 'confirmReset' | 'removeLabel' | 'removeWithoutSaving' | 'removeSavesAs' | 'removeDisabled'> {
    const base = { confirmReset: () => confirmRemoval(true), removeLabel: removeLabel(removal.content) };
    if (removal.content.kind !== 'changes') return base;
    return {
        ...base,
        removeWithoutSaving: () => confirmRemoval(false),
        removeSavesAs: removal.content.packName === undefined,
        removeDisabled: !removal.canSave,
    };
}
