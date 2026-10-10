/**
 * Configure, start and watch one import — as an explicit state machine.
 *
 * The modal shows ONE view at a time: `form`, `busy`, `confirm-reset`,
 * `watching`, or `result`, with the footer narrating each. An earlier shape let
 * the form, dry-run verdicts, three failure displays and a provisioning notice
 * coexist as conditional fragments — and that produced a live bug nobody could
 * localize (a bare error icon whose words were lost somewhere in the pile).
 * One view at a time makes that class of bug unwritable.
 *
 * **Every outcome is a RESULT view with an explicit Back.** Success does not
 * silently restore the form; failures do not stack under it. The result's
 * contextual actions live in the footer with Back — e.g. the credentials
 * refusal offers "Set up credentials automatically", the console-free loop
 * proven live 2026-08-13.
 *
 * **Which result shows is decided by the LAST ACTION**, not by which request
 * objects happen to hold values: request state persists after settling, so
 * fixed precedence would replay an old outcome over a new one (a provisioning
 * success would outrank the dry run the user just ran).
 *
 * **The target comes from the project, and is shown rather than typed.** An
 * editable `ImportTargetField` was retired for it — the instance is decided by the
 * project, and its 22-character id was not something anyone could check by eye.
 * **"Stop watching" is not cancel** — there is no
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
import type { DatapackId, ImportJobRecord } from '../../types';
import { useDataInstallerRequest } from '../hooks/useDataInstallerRequest';
import { useImportScopes } from '../hooks/useImportScopes';
import { deselectType, selectType, type TypeSelection } from '../importDependencies';
import { ImportDatapackModalBody, type BodyContext } from './ImportDatapackModalBody';
import { buildActions, busyMessage, resolveView, watchedActivation } from './importModalView';
import { resolveResult, type LastAction } from './importResult';
import { Modal } from '@/core/ui/components/ui/Modal';
import { webviewClient } from '@/core/ui/utils/WebviewClient';
import { DATAPACK_OPERATION_ID } from '@/core/utils/operationIds';

/**
 * Provisioning talks to the Console three times; the subscribe PUT alone took
 * 46 seconds live. Three minutes is headroom, not hope.
 */
const PROVISION_TIMEOUT_MS = 180_000;

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
    onClose: () => void;
}

export function ImportDatapackModal({
    id,
    displayName,
    availableTypes,
    onClose,
}: ImportDatapackModalProps): React.JSX.Element {
    // One state, not two: the provenance record only means anything alongside
    // the selection it describes, and splitting them invites an update that
    // moves one without the other.
    const [selection, setSelection] = useState<TypeSelection>({ selected: [], auto: [] });
    const selected = selection.selected as string[];
    const [watching, setWatching] = useState(true);
    const [resetArmed, setResetArmed] = useState(false);
    /** Which operation's outcome the result view shows. */
    const [lastAction, setLastAction] = useState<LastAction | null>(null);
    /** Back was pressed — the outcome was seen; show the form again. */
    const [dismissed, setDismissed] = useState(false);

    const start = useDataInstallerRequest<{ activationId: string }>('start-datapack-import');
    const reset = useDataInstallerRequest<{ activationId: string }>('reset-datapack');
    const dryRun = useDataInstallerRequest<{ valid: boolean; reason?: string }>(
        'validate-datapack-import',
    );
    // Sized to the MEASURED loop, not the default: provisioning took ~50s live
    // (the Console subscribe PUT alone was 46s), and the default timeout gave
    // up first — the modal showed a failure over an operation that succeeded.
    const provision = useDataInstallerRequest<never>('provision-accs-credentials', {
        timeout: PROVISION_TIMEOUT_MS,
    });
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

    // Re-read while a job is in flight; stops on its own once terminal, and
    // when the user stops watching.
    useEffect(() => {
        if (!running || !watching) {
            return undefined;
        }
        const timer = setInterval(() => loadStatus({}), STATUS_POLL_MS);
        return () => clearInterval(timer);
    }, [running, watching, loadStatus]);

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
    useEffect(() => {
        if (startedActivation) {
            loadStatus({});
        }
    }, [startedActivation, loadStatus]);

    const toggle = useCallback(
        (type: string, isSelected: boolean): void => {
            // Both transitions are pure and live in `importDependencies` — the
            // provenance rule they implement is the whole reason this is not a
            // one-line filter, and it is worth testing without React.
            setSelection((current) =>
                isSelected
                    ? selectType(current, type, availableTypes)
                    : deselectType(current, type),
            );
        },
        [availableTypes],
    );

    // A pack ships up to 14 types (Bodea does), so ticking them one at a time
    // is a chore for what is usually "all of it".
    const allSelected = availableTypes.length > 0 && selected.length === availableTypes.length;
    const toggleAll = useCallback((): void => {
        // Everything or nothing, and either way the user chose all of it — so
        // nothing is `auto` and Clear all genuinely clears.
        setSelection(
            allSelected ? { selected: [], auto: [] } : { selected: [...availableTypes], auto: [] },
        );
    }, [allSelected, availableTypes]);

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
        }),
        [id, commerceInstance, selected, scope],
    );

    const act = useCallback((action: LastAction): void => {
        setLastAction(action);
        setDismissed(false);
    }, []);

    const validate = useCallback((): void => {
        act('dryRun');
        dryRun.load(requestBody());
    }, [act, dryRun, requestBody]);

    const startImport = useCallback((): void => {
        act('start');
        setWatching(true);
        start.load(requestBody());
    }, [act, start, requestBody]);

    const confirmReset = useCallback((): void => {
        setResetArmed(false);
        act('reset');
        setWatching(true);
        // `confirm` is added HERE and nowhere else. The handler refuses
        // without it, so the armed press is the only path that can remove data.
        reset.load({ ...requestBody(), confirm: true });
    }, [act, reset, requestBody]);

    const provisionCredentials = useCallback((): void => {
        act('provision');
        provision.load({});
    }, [act, provision]);

    const goBack = useCallback((): void => setDismissed(true), []);

    const busy = dryRun.loading || start.loading || reset.loading || provision.loading;
    const result =
        !dismissed && !busy
            ? resolveResult(lastAction, { dryRun, start, reset, provision, record, startedActivation })
            : null;
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
    const canStart =
        commerceInstance.length > 0 && selected.length > 0 && !busy && !scope.loading;

    const bodyContext: BodyContext = {
        displayName,
        commerceInstance,
        availableTypes,
        selected,
        allSelected,
        record,
        watching,
        result,
        busyMessage: busyMessage(start.loading, reset.loading, provision.loading),
        scope,
        toggle,
        toggleAll,
    };

    const view = resolveView({
        busy,
        resetArmed,
        running,
        result,
        noInstance: !commerceInstance && target.settled,
    });

    // Closing a job that is still RUNNING hands it to a progress notification,
    // so the SC keeps seeing where it is — the same handover every progress
    // modal offers (PL-59 R8). Nothing is cancelled: the watcher carries on.
    const close = (): void => {
        if (running) {
            webviewClient.postMessage('backgroundOperation', {
                id: DATAPACK_OPERATION_ID,
                title: `${record?.operation === 'reset' ? 'Removing' : 'Importing'} ${displayName}`,
            });
        }
        onClose();
    };

    return (
        <DialogContainer type="modal" onDismiss={close}>
            <Modal
                // Wide, so the type list fits three uniform columns instead of
                // two scrolling ones. The target block's removal freed the rest.
                wide
                title={`Import ${displayName}`}
                size="L"
                fitContent
                onClose={close}
                closeLabel={running ? 'Run in background' : 'Close'}
                actionButtons={buildActions({
                    view,
                    canStart,
                    checking: dryRun.loading,
                    starting: start.loading,
                    resetting: reset.loading,
                    provisioning: provision.loading,
                    offerProvisioning: result?.offerProvisioning ?? false,
                    stopWatching: () => setWatching(false),
                    validate,
                    armReset: () => setResetArmed(true),
                    disarmReset: () => setResetArmed(false),
                    confirmReset,
                    startImport,
                    provisionCredentials,
                    goBack,
                })}
            >
                <ImportDatapackModalBody view={view} ctx={bodyContext} />
            </Modal>
        </DialogContainer>
    );
}
