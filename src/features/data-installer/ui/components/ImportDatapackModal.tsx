/**
 * Configure, start and watch one import — as an explicit state machine.
 *
 * The modal shows ONE view at a time: `form`, `busy`, `reading-changes`, `confirm-reset`, `watching`,
 * `result` or `no-instance`, with the footer narrating each. An earlier shape let
 * the form, dry-run verdicts, three failure displays and a credentials notice
 * coexist as conditional fragments — and that produced a live bug nobody could
 * localize (a bare error icon whose words were lost somewhere in the pile).
 * One view at a time makes that class of bug unwritable.
 *
 * **Every outcome is a RESULT view with an explicit Back.** Success does not
 * silently restore the form; failures do not stack under it. The result's
 * actions live in the footer with Back.
 *
 * **Which result shows is decided by the LAST ACTION**, not by which request
 * objects happen to hold values: request state persists after settling, so
 * fixed precedence would replay an old outcome over a new one (an earlier
 * import's failure would outrank the dry run the user just ran).
 *
 * **The target comes from the project, and is shown rather than typed.** An
 * editable `ImportTargetField` was retired for it — the instance is decided by the
 * project, and its 22-character id was not something anyone could check by eye.
 * **"Close" is not cancel** — there is no
 * cancel endpoint; the job continues server-side and the copy says so. Closing
 * the modal stops nothing either: the handler's watch is detached and records
 * into `TransientStateManager`, so reopening picks a RUNNING job back up — but
 * a TERMINAL record from a previous session is history and never greets a
 * fresh modal.
 *
 * **The `DialogContainer` is load-bearing, not decoration.** `core/ui/Modal`
 * is a Spectrum `Dialog` with no overlay of its own, and a bare `Dialog`
 * renders NOTHING — the modal shipped without one and never rendered once.
 *
 * What each state SHOWS (the view, the busy line, the footer row, which job is
 * watched) is decided in `importModalView`; this component keeps the state and
 * the requests that feed it.
 *
 * @module features/data-installer/ui/components/ImportDatapackModal
 */

import { DialogContainer } from '@adobe/react-spectrum';
import React, { useCallback, useEffect, useState } from 'react';
import type { ImportJobRecord } from '../../types';
import { useDataInstallerRequest } from '../hooks/useDataInstallerRequest';
import { useImportChanges } from '../hooks/useImportChanges';
import { useImportRetry } from '../hooks/useImportRetry';
import { useImportScopes, useLockedScope } from '../hooks/useImportScopes';
import { useJobPickup } from '../hooks/useJobPickup';
import { useRemovalConfirm, useRemovalScope } from '../hooks/useRemovalConfirm';
import { backOnlyCloses, comparesFirst, readsRecord, ticksAll, useClosesAfterRemoval, useRemovalWindow } from '../hooks/useRemovalWindow';
import { type HeldPack, replacesHeldPack, useReplacement } from '../hooks/useReplacement';
import { useRunColumns } from '../hooks/useRunColumns';
import { useTypeSelection } from '../hooks/useTypeSelection';
import { useVersionTypes } from '../hooks/useVersionTypes';
import { ImportDatapackModalBody, type BodyContext } from './ImportDatapackModalBody';
import { backgroundTitle, isStartingImport, jobBusyMessage, libraryField, STATUS_POLL_MS, targetName } from './importModalJob';
import { buildActions, closeLabel, isRemoving, removalButtons, resolveView, viewFrame, waitOf, watchedActivation } from './importModalView';
import { checkPassed, resolveResult, type LastAction } from './importResult';
import type { RemovalAnswer } from './removalConfirm';
import { Modal } from '@/core/ui/components/ui/Modal';
import { webviewClient } from '@/core/ui/utils/WebviewClient';
import { DATAPACK_OPERATION_ID } from '@/core/utils/operationIds';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';
import { WAIT_STAGES } from '@/core/utils/waitStages';
import type { DatapackId, DatapackStoreName } from '@/types/datapack';

/** A start or removal that saves the SC's changes first answers after the save (walk F105). */
const SAVE_THEN_WRITE = { timeout: TIMEOUTS.DATAPACK_SAVE_THEN_WRITE };

/** Reading the version's own data types comes before any other wait (`useVersionTypes`). */
function typesFirst(readingTypes: boolean, wait: ReturnType<typeof useImportChanges>['wait']): ReturnType<typeof useImportChanges>['wait'] {
    return readingTypes ? WAIT_STAGES.readingPack : wait;
}

/** What the open project implies about where this import should go, and the pack it holds. */
interface ImportTarget extends HeldPack {
    instance?: string;
    /** The open project's name — the only human-readable handle on this target. */
    projectName?: string;
    /**
     * The website/store view the project's Business Structure recorded. Seeds
     * the pickers, so the dialog opens on the scope the project is configured
     * for rather than on whatever the instance happens to call `base`.
     */
    scope?: { websiteCode: string; storeCode: string };
}

export interface ImportDatapackModalProps {
    id: DatapackId;
    displayName: string;
    /** Types this version stores, from the detail inventory; read here when absent (`useVersionTypes`). */
    availableTypes?: string[];
    /** Which store holds the pack; a library pack is installed by Demo Builder's engine (DI-5). */
    source?: DatapackStoreName;
    /** Opened by Remove Data: straight to the removal's confirm, and closed when it is done (walk F118). */
    opensOn?: 'remove';
    onClose: () => void;
}

export function ImportDatapackModal({
    id,
    displayName,
    availableTypes: givenTypes,
    source,
    opensOn,
    onClose,
}: ImportDatapackModalProps): React.JSX.Element {
    const { types: availableTypes, reading: readingTypes } = useVersionTypes(id, source, givenTypes);
    const columns = useRunColumns(availableTypes.length);
    // The removal's confirm, and what the SC changed that it asks about (step 05).
    const removal = useRemovalConfirm();
    /** Which operation's outcome the result view shows. */
    const [lastAction, setLastAction] = useState<LastAction | null>(null);
    /** Back was pressed — the outcome was seen; show the form again. */
    const [dismissed, setDismissed] = useState(false);

    // Either may save the SC's changes before it answers (walk F105): the wait covers the save.
    const start = useDataInstallerRequest<{ activationId: string }>('start-datapack-import', SAVE_THEN_WRITE);
    const reset = useDataInstallerRequest<{ activationId: string; savedNote?: string }>('reset-datapack', SAVE_THEN_WRITE);
    const dryRun = useDataInstallerRequest<{ valid: boolean; reason?: string }>(
        'validate-datapack-import',
    );
    const status = useDataInstallerRequest<ImportJobRecord | null>('get-datapack-import-status');
    const target = useDataInstallerRequest<ImportTarget>('get-datapack-import-target');
    const { selected, allSelected, toggle, toggleAll } = useTypeSelection(availableTypes, ticksAll(replacesHeldPack(id, target.value), opensOn));
    // Owns the discovered scopes AND the user's choice within them — see the hook.
    // Seeded from what the PROJECT recorded, so the dialog opens on the scope the
    // project is configured for instead of on `base`.
    const scope = useImportScopes(target.value?.scope);

    const loadStatus = status.load;
    useEffect(() => {
        loadStatus({});
    }, [loadStatus]);
    const loadTarget = target.load;
    useEffect(() => {
        loadTarget({});
    }, [loadTarget]);

    // Simply derived: the project decides the instance, and nothing here edits it.
    const commerceInstance = target.value?.instance ?? '';
    const record = status.value ?? null;
    const running = record?.outcome === 'watching';

    // Re-read while a job is in flight; stops on its own once terminal.
    useEffect(() => {
        if (!running) {
            return undefined;
        }
        const timer = setInterval(() => loadStatus({}), STATUS_POLL_MS);
        return () => clearInterval(timer);
    }, [running, loadStatus]);

    // Pick the job up as soon as one is accepted, keyed on the LAST ACTION, not `start ?? reset`:
    // request data persists after settling, so `??` once watched a finished import forever while a
    // later reset ran unseen and the form came back with Start enabled.
    const startedActivation = watchedActivation(
        lastAction,
        start.value?.activationId,
        reset.value?.activationId,
    );
    const pickingUp = useJobPickup(startedActivation, record, status.loading, loadStatus);

    /** The one body both paths send, so a dry run checks what a start would do. */
    const requestBody = useCallback(
        () => ({
            datapackName: id.name,
            version: id.version,
            // Verbatim — not trimmed, not normalised. See ImportTargetField.
            commerceInstance,
            dataTypes: selected,
            // Spread: an unchosen target contributes NO keys. See useImportScopes.
            ...scope.targetFields(),
            // Only a library pack names its store; the handler reads absent as the Data Installer.
            ...libraryField(source),
        }),
        [id, commerceInstance, selected, scope, source],
    );

    const act = useCallback((action: LastAction): void => {
        setLastAction(action);
        setDismissed(false);
    }, []);

    const validate = useCallback((): void => {
        act('dryRun');
        dryRun.load(requestBody());
    }, [act, dryRun, requestBody]);

    // An answer about the SC's changes rides along when the import replaces the demo's pack (walk F97).
    const startWith = useCallback((answer?: RemovalAnswer): void => {
        act('start');
        start.load({ ...requestBody(), ...answer });
    }, [act, start, requestBody]);
    const replacement = useReplacement(id, displayName, target.value, removal, startWith);
    const { retries, startImport, retry, fixWithAi, fixDryRunWithAi } = useImportRetry(replacement.begin);

    const confirmRemoval = (save: boolean): void => {
        const answer = removal.press(save);
        if (replacement.forImport) return replacement.answered(answer);
        act('reset');
        // `confirm` is added HERE and nowhere else. The handler refuses
        // without it, so the armed press is the only path that can remove data.
        reset.load({ ...requestBody(), confirm: true, ...answer });
    };

    /** The read names only the pack: what a removal would lose does not depend on the ticks. */
    const armRemoval = removal.arm;
    const armReset = useCallback((): void => {
        armRemoval({ datapackName: id.name, version: id.version, ...libraryField(source) });
    }, [armRemoval, id.name, id.version, source]);
    // Remove Data opens here, straight to its confirm, and leaving it closes the window (F118).
    const leave = useRemovalWindow(opensOn, armReset, replacement.disarm, () => close());

    const busy = dryRun.loading || start.loading || reset.loading || pickingUp;
    const result =
        !dismissed && !busy
            ? resolveResult(lastAction, {
                  name: displayName,
                  retries,
                  dryRun,
                  start,
                  reset,
                  record,
                  startedActivation,
                  ...replacement.resultSource(selected),
              })
            : null;
    const goBack = (): void => {
        if (backOnlyCloses(leave.closesOnBack, result)) return close();
        if (result?.backToConfirm) replacement.reopen(lastAction === 'start');
        setDismissed(true);
    };
    // Not ready while the scopes load, or a Start pressed then lands on the service default (`base`)
    // silently; a discovery that FAILS clears `loading` too, so an untargeted import stays possible.
    const ready = commerceInstance.length > 0 && !busy && !scope.loading;
    const canStart = ready && selected.length > 0;
    const view = resolveView({
        busy,
        starting: isStartingImport({ start: start.loading, reset: reset.loading, pickingUp, lastAction }),
        readingChanges: removal.reading,
        resetArmed: removal.armed,
        running,
        result,
        noInstance: !commerceInstance && target.settled,
    });
    const { recordedKinds, removesAll, settled: scopeSettled, installedAt } = useRemovalScope(id, readsRecord(view, opensOn));
    useLockedScope(scope.lockTo, installedAt);
    // What the project holds moves with every import or removal: the form's "Replaces …" reads it again.
    const showingForm = view === 'form';
    useEffect(() => {
        if (showingForm && lastAction !== null) loadTarget({});
    }, [showingForm, lastAction, loadTarget]);
    const changes = useImportChanges({ id, source, types: availableTypes, installed: removesAll, active: comparesFirst(view, opensOn), used: lastAction !== null });
    useClosesAfterRemoval(opensOn, view, lastAction, onClose);

    const bodyContext: BodyContext = {
        displayName,
        commerceInstance,
        availableTypes,
        selected,
        allSelected,
        recordedKinds,
        record,
        result,
        // Saving first has stages of its own (step 05), in the same wait, before the removal's.
        busyMessage: jobBusyMessage({ reset: reset.loading, pickingUp, lastAction, stage: removal.stage }),
        scope,
        removal,
        toggle,
        toggleAll,
        installing: { name: displayName, version: id.version },
        columns,
        changes,
        replacement: { name: replacement.name, sentence: replacement.sentence, confirming: replacement.forImport, savingStage: replacement.savingStage },
    };

    // Closing a job that is still RUNNING hands it to a progress notification,
    // so the SC keeps seeing where it is — the same handover every progress
    // modal offers (PL-59 R8). Nothing is cancelled: the watcher carries on. A
    // removal saving the SC's changes first is already going the same way, and so
    // does an import still starting: the notice opens only once its job runs.
    const savingFirst = reset.loading && removal.stage !== undefined;
    const close = (): void => {
        if (running || savingFirst || view === 'starting') {
            webviewClient.postMessage('backgroundOperation', {
                id: DATAPACK_OPERATION_ID,
                title: backgroundTitle(record?.operation === 'reset' || savingFirst, displayName),
            });
        }
        onClose();
    };

    const frame = viewFrame({
        view,
        displayName,
        removing: isRemoving({ armed: removal.armed, lastAction, view, operation: record?.operation }),
        store: targetName(scope, commerceInstance),
        typeCount: availableTypes.length,
        columns,
        result,
        record,
        checkFailed: removal.content.kind === 'read-failed',
        ...replacement.frame,
    });

    const footer = buildActions({
        view,
        canStart,
        checking: dryRun.loading,
        starting: start.loading,
        resetting: reset.loading,
        validate,
        disarmReset: leave.disarm,
        ...removalButtons(removal, confirmRemoval),
        confirmsImport: replacement.forImport,
        startImport,
        goBack,
        ranToEnd: result?.finished === true,
        backCloses: backOnlyCloses(leave.closesOnBack, result),
        checkPassed: checkPassed(lastAction, dryRun.value),
        resultAction: result?.action,
        retry,
        // A Dry Run's problem is fixed from the recorded dry run, not the last install (step 03, S5).
        fixWithAi: lastAction === 'dryRun' ? fixDryRunWithAi : fixWithAi,
    });

    return (
        <DialogContainer type="modal" onDismiss={close}>
            <Modal
                title={frame.title}
                status={frame.status}
                size={frame.size}
                wide={frame.wide}
                hideClose={frame.hideClose}
                fitContent
                waiting={waitOf(view, scope.loading || !target.settled || !scopeSettled, bodyContext.busyMessage, typesFirst(readingTypes, changes.wait))}
                holdSize={frame.holdSize === true}
                onClose={view === 'reading-changes' ? leave.disarm : close}
                closeLabel={closeLabel(view, savingFirst)}
                startButtons={footer.filter((button) => button.start)}
                actionButtons={footer.filter((button) => !button.start)}
            >
                <ImportDatapackModalBody view={view} ctx={bodyContext} />
            </Modal>
        </DialogContainer>
    );
}
