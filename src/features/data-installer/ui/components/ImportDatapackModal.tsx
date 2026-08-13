/**
 * Configure, start and watch one import.
 *
 * A composition of the shared vocabulary, per `reuse-first`: `core/ui/Modal` for
 * the shell, `forms/FormField` for the instance input, `ui/StatusDot` for the
 * per-type rows (the same dot-plus-label treatment `IntegrationCard` uses, so a
 * status reads identically wherever it appears), and the feature's own
 * `useDataInstallerRequest` so a guard refusal cannot read as success.
 *
 * Spectrum `Checkbox` direct: there is no shared checkbox-group component, and
 * one consumer does not justify inventing one.
 *
 * **The `DialogContainer` is load-bearing, not decoration.** `core/ui/Modal` is a
 * Spectrum `Dialog` with no overlay of its own, and a bare `Dialog` renders
 * NOTHING — so without this wrapper pressing Import did nothing at all. Every
 * working modal in this repo has a container somewhere up its tree; the parent
 * mounts this component only while open, so the container lives here rather than
 * being a thing each caller must remember.
 *
 * **The instance field starts EMPTY, and stays the user's.** No prefill, no
 * derivation, no trimming or reformatting on the way out. The spike that would
 * have justified deriving it from the project's ACCS tenant could not be answered
 * — only 16 instances have ever had Data Installer activity and none matched a
 * local project — so any prefill would be a guess, and an import writes into
 * whatever this names.
 *
 * **"Stop watching" is not cancel.** There is no cancel endpoint. Stopping ends
 * the WATCH; the job keeps running server-side, which the copy says outright.
 * Both strings are pinned by tests, because softening either turns "we stopped
 * looking" into "we cancelled your import".
 *
 * Closing the modal stops nothing either: the handler's watch is detached and
 * records into `TransientStateManager`, so reopening picks the job back up.
 *
 * @module features/data-installer/ui/components/ImportDatapackModal
 */

import { Checkbox, DialogContainer } from '@adobe/react-spectrum';
import React, { useCallback, useEffect, useState } from 'react';
import type { DataTypeStatus, DatapackId, ImportJobRecord } from '../../types';
import { useDataInstallerRequest } from '../hooks/useDataInstallerRequest';
import { FormField } from '@/core/ui/components/forms/FormField';
import { Modal } from '@/core/ui/components/ui/Modal';
import { StatusDot } from '@/core/ui/components/ui/StatusDot';

/** How often to re-read the recorded job while one is in flight. */
const STATUS_POLL_MS = 2000;

/** Per-type status → the shared dot vocabulary. */
const DOT_VARIANT: Record<DataTypeStatus, 'success' | 'error' | 'info' | 'neutral'> = {
    success: 'success',
    error: 'error',
    processing: 'info',
    pending: 'neutral',
};

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
    const [commerceInstance, setCommerceInstance] = useState('');
    const [selected, setSelected] = useState<string[]>([]);
    const [watching, setWatching] = useState(true);
    // Pressing Reset arms this; only the armed press may send `confirm`.
    const [resetArmed, setResetArmed] = useState(false);

    const start = useDataInstallerRequest<{ activationId: string }>('start-datapack-import');
    const reset = useDataInstallerRequest<{ activationId: string }>('reset-datapack');
    const dryRun = useDataInstallerRequest<{ valid: boolean; reason?: string }>(
        'validate-datapack-import',
    );
    const status = useDataInstallerRequest<ImportJobRecord | null>('get-datapack-import-status');

    const loadStatus = status.load;
    useEffect(() => {
        loadStatus({});
    }, [loadStatus]);

    const record = status.value ?? null;
    const running = record?.outcome === 'watching';

    // Re-read while a job is in flight; stops on its own once terminal, and when
    // the user stops watching.
    useEffect(() => {
        if (!running || !watching) {
            return undefined;
        }
        const timer = setInterval(() => loadStatus({}), STATUS_POLL_MS);
        return () => clearInterval(timer);
    }, [running, watching, loadStatus]);

    // Pick the job up as soon as one is accepted. A reset is the same kind of job
    // — same activation id, same runner, same record — so it is watched the same.
    const startedActivation = start.value?.activationId ?? reset.value?.activationId;
    useEffect(() => {
        if (startedActivation) {
            loadStatus({});
        }
    }, [startedActivation, loadStatus]);

    const toggle = useCallback((type: string, isSelected: boolean): void => {
        setSelected((current) =>
            isSelected ? [...current, type] : current.filter((t) => t !== type),
        );
    }, []);

    /** The one body both paths send, so a dry run checks what a start would do. */
    const requestBody = useCallback(
        () => ({
            datapackName: id.name,
            version: id.version,
            // Verbatim — not trimmed, not normalised. See the module docstring.
            commerceInstance,
            dataTypes: selected,
        }),
        [id, commerceInstance, selected],
    );

    const validate = useCallback((): void => {
        dryRun.load(requestBody());
    }, [dryRun, requestBody]);

    const startImport = useCallback((): void => {
        setWatching(true);
        start.load(requestBody());
    }, [start, requestBody]);

    const confirmReset = useCallback((): void => {
        setResetArmed(false);
        setWatching(true);
        // `confirm` is added HERE and nowhere else. The handler refuses without
        // it, so the armed press is the only path that can remove data.
        reset.load({ ...requestBody(), confirm: true });
    }, [reset, requestBody]);

    const canStart = commerceInstance.length > 0 && selected.length > 0 && !start.loading;

    return (
        <DialogContainer type="modal" onDismiss={onClose}>
            <Modal
                title={`Import ${displayName}`}
                size="M"
                fitContent
                onClose={onClose}
                closeLabel="Close"
                actionButtons={buildActions({
                    running,
                    watching,
                    resetArmed,
                    canStart,
                    stopWatching: () => setWatching(false),
                    validate,
                    armReset: () => setResetArmed(true),
                    disarmReset: () => setResetArmed(false),
                    confirmReset,
                    startImport,
                })}
            >
                <div className="datapack-import-body">
                    {record ? <ImportProgress record={record} watching={watching} /> : null}

                    {resetArmed ? (
                        <div className="datapack-import-danger">
                            {`Remove ${displayName}'s ${selected.join(', ')} from ${commerceInstance}. This cannot be undone — the Data Installer has no restore.`}
                        </div>
                    ) : null}

                    {!running && !resetArmed ? (
                        <>
                            <FormField
                                fieldKey="commerceInstance"
                                label="Commerce instance"
                                type="text"
                                value={commerceInstance}
                                onChange={setCommerceInstance}
                                required
                                description="Where this data will be written. There is no undo — check it with whoever owns the target."
                            />
                            <div className="datapack-import-types">
                                <span className="datapack-import-label">Data types</span>
                                {availableTypes.map((type) => (
                                    <Checkbox
                                        key={type}
                                        isSelected={selected.includes(type)}
                                        onChange={(isSelected) => toggle(type, isSelected)}
                                    >
                                        {type}
                                    </Checkbox>
                                ))}
                            </div>
                        </>
                    ) : null}

                    {dryRun.value ? (
                        <div className="datapack-import-verdict">
                            {dryRun.value.valid
                                ? 'Dry run passed — the service says this request would be accepted. Nothing has been written.'
                                : 'The service refused this request:'}
                            {dryRun.value.reason ? (
                                <div className="datapack-import-reason">{dryRun.value.reason}</div>
                            ) : null}
                        </div>
                    ) : null}

                    {dryRun.failure ? (
                        <div className="datapack-import-error">{dryRun.failure.message}</div>
                    ) : null}

                    {start.failure ? (
                        <div className="datapack-import-error">{start.failure.message}</div>
                    ) : null}

                    {reset.failure ? (
                        <div className="datapack-import-error">{reset.failure.message}</div>
                    ) : null}
                </div>
            </Modal>
        </DialogContainer>
    );
}

/** What each action button does, so the three-state footer stays readable. */
interface ActionInputs {
    running: boolean;
    watching: boolean;
    resetArmed: boolean;
    canStart: boolean;
    stopWatching: () => void;
    validate: () => void;
    armReset: () => void;
    disarmReset: () => void;
    confirmReset: () => void;
    startImport: () => void;
}

/**
 * The footer has three states, and the destructive one is deliberately separate.
 *
 * Arming replaces the whole footer rather than adding a second button beside
 * Start: with both on screen, "Remove the data" is one mis-click from "Start
 * import", and the service has no undo.
 */
function buildActions(
    a: ActionInputs,
): {
    label: string;
    variant: 'secondary' | 'accent' | 'negative';
    onPress: () => void;
    isDisabled?: boolean;
}[] {
    if (a.running && a.watching) {
        // NOT "Cancel" — no endpoint exists to cancel with.
        return [{ label: 'Stop watching', variant: 'secondary', onPress: a.stopWatching }];
    }
    if (a.resetArmed) {
        return [
            { label: 'Keep the data', variant: 'secondary', onPress: a.disarmReset },
            { label: 'Remove the data', variant: 'negative', onPress: a.confirmReset },
        ];
    }
    return [
        // "Dry run", not "Validate": the start handler already validates
        // server-side before it starts, so this is a REHEARSAL of the same
        // request, not a gate the user must pass through first. Two peer labels
        // invited "must I press this before importing?" — the answer is no.
        { label: 'Dry run', variant: 'secondary', onPress: a.validate, isDisabled: !a.canStart },
        // Arms only. Removing data always takes a second, explicit press.
        { label: 'Reset…', variant: 'secondary', onPress: a.armReset, isDisabled: !a.canStart },
        {
            label: 'Start import',
            variant: 'accent',
            onPress: a.startImport,
            isDisabled: !a.canStart,
        },
    ];
}

/** Where the job stands, plus a row per reported type. */
function ImportProgress({
    record,
    watching,
}: {
    record: ImportJobRecord;
    watching: boolean;
}): React.JSX.Element {
    return (
        <div className="datapack-import-progress">
            <div className="datapack-import-outcome">{describeOutcome(record, watching)}</div>
            {record.reason ? <div className="datapack-import-reason">{record.reason}</div> : null}
            {Object.entries(record.perType).map(([type, state]) => (
                <div key={type} className="datapack-import-type">
                    <StatusDot variant={DOT_VARIANT[state] ?? 'neutral'} size={6} />
                    <span>{type}</span>
                    <span className="datapack-import-state">{state}</span>
                </div>
            ))}
        </div>
    );
}

/**
 * One line saying where the job stands.
 *
 * `partial` gets its own wording rather than being folded into failure: a re-run
 * legitimately skips items that already exist, so a mix is the expected result of
 * importing twice, not a fault.
 */
function describeOutcome(record: ImportJobRecord, watching: boolean): string {
    switch (record.outcome) {
        case 'watching':
            // The reassurance belongs here, while Stop watching is on screen —
            // not after it is pressed. Learning that stopping does not cancel
            // AFTER you stopped is too late to have informed the decision.
            return watching
                ? 'Importing… this can take several minutes. Closing this or stopping the watch continues on the server.'
                : 'Stopped watching. The import continues on the server.';
        case 'success':
            return 'Import finished. All requested data types succeeded.';
        case 'partial':
            return 'Import finished, but some data types did not. Re-running skips what already exists.';
        case 'error':
            return 'Import failed. No data type succeeded.';
        case 'never-registered':
            return 'The import never started — the service did not register it.';
        case 'stopped':
            return 'Stopped watching. The import continues on the server.';
        case 'still-running':
            return 'Still running after the watch window. The import continues on the server.';
        default:
            return String(record.outcome);
    }
}
