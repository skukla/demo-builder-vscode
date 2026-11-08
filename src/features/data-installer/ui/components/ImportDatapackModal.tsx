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
import { useImportRetry } from '../hooks/useImportRetry';
import { useImportScopes } from '../hooks/useImportScopes';
import { useJobPickup } from '../hooks/useJobPickup';
import { useRemovalConfirm, useRemovalScope } from '../hooks/useRemovalConfirm';
import { useTypeSelection } from '../hooks/useTypeSelection';
import { ImportDatapackModalBody, type BodyContext } from './ImportDatapackModalBody';
import { backgroundTitle, isStartingImport, jobBusyMessage, libraryField } from './importModalJob';
import { buildActions, closeLabel, isRemoving, resolveView, runColumns, targetName, viewFrame, waitOf, watchedActivation } from './importModalView';
import { resolveResult, type LastAction } from './importResult';
import { removeLabel } from './removalConfirm';
import { Modal } from '@/core/ui/components/ui/Modal';
import { webviewClient } from '@/core/ui/utils/WebviewClient';
import { DATAPACK_OPERATION_ID } from '@/core/utils/operationIds';
import type { DatapackId, DatapackStoreName } from '@/types/datapack';

/** How often to re-read the recorded job while one is in flight. */
const STATUS_POLL_MS = 2000;

/** What the open project implies about where this import should go. */
interface ImportTarget {
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
    /** Types this datapack actually stores — from the detail inventory. */
    availableTypes: string[];
    /** Which store holds the pack; a library pack is installed by Demo Builder's engine (DI-5). */
    source?: DatapackStoreName;
    onClose: () => void;
}

export function ImportDatapackModal({
    id,
    displayName,
    availableTypes,
    source,
    onClose,
}: ImportDatapackModalProps): React.JSX.Element {
    const { selected, allSelected, toggle, toggleAll } = useTypeSelection(availableTypes);
    // The removal's confirm, and what the SC changed that it asks about (step 05).
    const removal = useRemovalConfirm();
    /** Which operation's outcome the result view shows. */
    const [lastAction, setLastAction] = useState<LastAction | null>(null);
    /** Back was pressed — the outcome was seen; show the form again. */
    const [dismissed, setDismissed] = useState(false);

    const start = useDataInstallerRequest<{ activationId: string }>('start-datapack-import');
    const reset = useDataInstallerRequest<{ activationId: string; savedNote?: string }>('reset-datapack');
    const dryRun = useDataInstallerRequest<{ valid: boolean; reason?: string }>(
        'validate-datapack-import',
    );
    const status = useDataInstallerRequest<ImportJobRecord | null>('get-datapack-import-status');
    const target = useDataInstallerRequest<ImportTarget>('get-datapack-import-target');
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

    // Simply derived. This used to be seeded into an editable field behind a
    // "touched" guard, so an async answer could not clobber what the user had
    // typed. The field is gone — the project decides the instance — so the guard,
    // the state and the effect went with it.
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

    // Pick the job up as soon as one is accepted. A reset is the same kind of
    // job — same activation id, same runner, same record.
    //
    // Keyed on the LAST ACTION, not `start ?? reset`: `useVSCodeRequest.execute`
    // clears `error` before a request but NOT `data`, and nothing here calls its
    // `reset()`. So a finished import leaves `start.value.activationId` set for
    // the life of the modal, and `??` preferred it forever — an import followed
    // by a reset watched the completed import, never re-read status, and
    // discarded the reset's record at the `activationId` guard below. The modal
    // fell back to the form, Start enabled, while the reset ran server-side.
    // Reset-then-import worked, which is what made it a bug and not a design.
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

    const runImport = useCallback((): void => {
        act('start');
        start.load(requestBody());
    }, [act, start, requestBody]);
    const { retries, startImport, retry, fixWithAi } = useImportRetry(runImport);

    const confirmRemoval = (save: boolean): void => {
        const answer = removal.press(save);
        act('reset');
        // `confirm` is added HERE and nowhere else. The handler refuses
        // without it, so the armed press is the only path that can remove data.
        reset.load({ ...requestBody(), confirm: true, ...answer });
    };

    /** The read names only the pack: what a removal would lose does not depend on the ticks. */
    const armReset = (): void => {
        removal.arm({ datapackName: id.name, version: id.version, ...libraryField(source) });
    };

    const busy = dryRun.loading || start.loading || reset.loading || pickingUp;
    const result =
        !dismissed && !busy
            ? resolveResult(lastAction, {
                  name: displayName,
                  store: targetName(scope, commerceInstance),
                  retries,
                  dryRun,
                  start,
                  reset,
                  record,
                  startedActivation,
              })
            : null;
    const goBack = (): void => {
        if (result?.backToConfirm) removal.reopen();
        setDismissed(true);
    };
    // `scopes.loading` is in here because the target is still resolving while it
    // is true. Without it the user can tick types and press Start during the
    // second or two the pickers show a spinner, and the import lands on the
    // service default (`base`/`default`) instead of the target that was about to
    // arrive — silently, since the request simply omits the pair.
    //
    // Safe to gate on: `useVSCodeRequest` clears `loading` in its catch as well
    // as on success, so a discovery that FAILS re-enables Start rather than
    // stranding it. That matters because targeting is optional — an import with
    // no target is legitimate, and must stay possible when discovery cannot run.
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
    const { recordedKinds, removesAll, settled: scopeSettled } = useRemovalScope(id, view === 'form');

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
        columns: runColumns(availableTypes.length),
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
        result,
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
                waiting={waitOf(view, scope.loading || !target.settled || !scopeSettled, bodyContext.busyMessage)}
                holdSize={frame.holdSize === true}
                onClose={view === 'reading-changes' ? removal.disarm : close}
                closeLabel={closeLabel(view, savingFirst)}
                actionButtons={buildActions({
                    view,
                    canStart,
                    canRemove: ready && (removesAll || selected.length > 0),
                    removesAll,
                    checking: dryRun.loading,
                    starting: start.loading,
                    resetting: reset.loading,
                    validate,
                    armReset,
                    disarmReset: removal.disarm,
                    ...removalButtons(removal, confirmRemoval),
                    startImport,
                    goBack,
                    resultAction: result?.action,
                    retry,
                    fixWithAi,
                })}
            >
                <ImportDatapackModalBody view={view} ctx={bodyContext} />
            </Modal>
        </DialogContainer>
    );
}

/**
 * The confirm's buttons: one Remove, or, with changes to keep, Save and Remove beside Remove
 * Without Saving, the save waiting on a Save As name when it needs one.
 */
function removalButtons(
    removal: Pick<ReturnType<typeof useRemovalConfirm>, 'content' | 'canSave'>,
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
