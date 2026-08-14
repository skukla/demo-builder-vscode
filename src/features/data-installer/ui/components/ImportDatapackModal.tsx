/**
 * Configure, start and watch one import.
 *
 * A composition of the shared vocabulary, per `reuse-first`: `core/ui/Modal` for
 * the shell, `forms/FormField` for the instance input, `LoadingDisplay` and
 * `StatusDisplay` (with their `subMessage`/`details` slots carrying the per-type
 * states), and the feature's own `useDataInstallerRequest` so a guard refusal
 * cannot read as success.
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
 * **The target comes from the project, and is shown rather than typed.** When the
 * project supplies one, a read-only summary stands in for the field: it leads with
 * the project NAME, because a 22-character nanoid is not something anyone can
 * confirm is right, and keeps the id visible underneath because the id is what
 * actually decides where the data lands. `Change` swaps in the editable field for
 * an override, and a project that derives nothing gets that field directly — or it
 * could not be imported into at all.
 *
 * In the editable path the value is seeded once, only into an untouched field, and
 * sent verbatim — never trimmed or reformatted on the way out.
 *
 * It started empty, on the reasoning that a prefilled write target with no undo
 * would be a guess: the spike could not confirm the target was derivable, because
 * none of the instances with Data Installer history matched a local project. Both
 * halves of that expired. `checkCredentials` now tests an instance read-only, so a
 * derived value is checkable before anything is written; and the derivation already
 * existed — `ACCS_ENDPOINT_PATTERN` has been extracting the tenant id from
 * `ACCS_GRAPHQL_ENDPOINT` all along to build the admin URL, and that id is the
 * 21–22 character base62 shape the spike measured for `commerce_instance`.
 *
 * A PaaS target is seeded from the project's Commerce URL. The service DERIVES the
 * site type rather than being told it, and a URL-shaped instance is accepted — but
 * no PaaS project has ever run through it, so that seed is a shape that should work
 * rather than one known to.
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

import { ActionButton, Checkbox, DialogContainer } from '@adobe/react-spectrum';
import React, { useCallback, useEffect, useState } from 'react';
import type { DatapackId, ImportJobRecord } from '../../types';
import { useDataInstallerRequest, type DataInstallerRequest } from '../hooks/useDataInstallerRequest';
import { LoadingDisplay } from '@/core/ui/components/feedback/LoadingDisplay';
import { StatusCard } from '@/core/ui/components/feedback/StatusCard';
import { StatusDisplay } from '@/core/ui/components/feedback/StatusDisplay';
import { FormField } from '@/core/ui/components/forms/FormField';
import { Modal } from '@/core/ui/components/ui/Modal';

/** How often to re-read the recorded job while one is in flight. */
const STATUS_POLL_MS = 2000;

/** What the open project implies about where this import should go. */
interface ImportTarget {
    instance?: string;
    /** The open project's name — the only human-readable handle on this target. */
    projectName?: string;
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
    const provision = useDataInstallerRequest<never>('provision-accs-credentials');
    const target = useDataInstallerRequest<ImportTarget>('get-datapack-import-target');

    const loadStatus = status.load;
    useEffect(() => {
        loadStatus({});
    }, [loadStatus]);

    const loadTarget = target.load;
    useEffect(() => {
        loadTarget({});
    }, [loadTarget]);

    // Seed ONCE, and only into a field the user has not touched. `touched` is the
    // load-bearing half: the target request is async, so it can answer AFTER the
    // user has started typing, and seeding on arrival would silently replace their
    // value with a derived one — in a field that names a write target with no undo.
    // A `seeded` flag alone does not prevent that, which a test caught.
    const derived = target.value?.instance;
    const [touched, setTouched] = useState(false);
    useEffect(() => {
        if (derived && !touched) {
            setCommerceInstance(derived);
        }
    }, [derived, touched]);

    const editInstance = useCallback((value: string): void => {
        setTouched(true);
        setCommerceInstance(value);
    }, []);


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

    // A pack ships up to 14 types (Bodea does), so ticking them one at a time is a
    // chore for what is usually "all of it".
    const allSelected = availableTypes.length > 0 && selected.length === availableTypes.length;
    const toggleAll = useCallback((): void => {
        setSelected(allSelected ? [] : [...availableTypes]);
    }, [allSelected, availableTypes]);

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

    // One in-flight operation freezes the whole footer: the labels swap on the
    // active one (ManageApisModal's 'Applying…' pattern) and everything disables,
    // because a second request mid-flight has no meaning here.
    const busy = dryRun.loading || start.loading || reset.loading;
    const canStart = commerceInstance.length > 0 && selected.length > 0 && !busy;

    return (
        <DialogContainer type="modal" onDismiss={onClose}>
            <Modal
                title={`Import ${displayName}`}
                size="L"
                fitContent
                onClose={onClose}
                closeLabel="Close"
                actionButtons={buildActions({
                    running,
                    watching,
                    resetArmed,
                    canStart,
                    checking: dryRun.loading,
                    starting: start.loading,
                    resetting: reset.loading,
                    stopWatching: () => setWatching(false),
                    validate,
                    armReset: () => setResetArmed(true),
                    disarmReset: () => setResetArmed(false),
                    confirmReset,
                    startImport,
                })}
            >
                <div className="datapack-import-body">
                    {/* A RUNNING record always shows — the watch is detached and a
                        reopened modal must pick it back up. A TERMINAL record shows
                        only for a job THIS modal started: anything else is a previous
                        session's history, and history must not greet a fresh modal
                        wearing a success icon (live verification did exactly that). */}
                    {record &&
                    (record.outcome === 'watching' || record.activationId === startedActivation) ? (
                        <ImportProgress record={record} watching={watching} />
                    ) : null}

                    {resetArmed ? (
                        <div className="datapack-import-danger">
                            {`Remove ${displayName}'s ${selected.join(', ')} from ${commerceInstance}. This cannot be undone — the Data Installer has no restore.`}
                        </div>
                    ) : null}

                    {/* One visual for every in-flight state: form out, centered
                        spinner in — the ManageApisModal/AiCapabilitiesModal
                        treatment, and what Start/Reset here already did. The dry
                        run briefly had its own small inline row instead. */}
                    {/* Size L on purpose: LoadingDisplay's own source keys the
                        wizard treatment off it — `shouldCenter = size === 'L'`.
                        M left-aligns the text and drops a size; it is not a
                        smaller version of the same look. */}
                    {busy ? <LoadingDisplay size="L" message={busyMessage(start.loading, reset.loading)} /> : null}

                    {!running && !resetArmed && !busy ? (
                        <>
                            <ImportTargetField
                                projectName={target.value?.projectName}
                                instance={commerceInstance}
                                onChange={editInstance}
                            />
                            <div className="datapack-import-types">
                                <div className="datapack-import-types-head">
                                    <span className="datapack-import-label">Data types</span>
                                    <ActionButton isQuiet onPress={toggleAll}>
                                        {allSelected ? 'Clear all' : 'Select all'}
                                    </ActionButton>
                                </div>
                                {/* Two columns: a pack ships up to 14 types, and one
                                    column turns a glanceable choice into a scroll. */}
                                <div className="datapack-import-type-grid">
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
                            </div>
                        </>
                    ) : null}

                    <RequestFeedback dryRun={dryRun} start={start} reset={reset} provision={provision} />

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
    checking: boolean;
    starting: boolean;
    resetting: boolean;
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
    if (a.resetArmed || a.resetting) {
        return [
            { label: 'Keep the data', variant: 'secondary', onPress: a.disarmReset, isDisabled: a.resetting },
            {
                // ManageApisModal's 'Applying…' pattern: swap the label, disable.
                label: a.resetting ? 'Removing…' : 'Remove the data',
                variant: 'negative',
                onPress: a.confirmReset,
                isDisabled: a.resetting,
            },
        ];
    }
    return [
        // "Dry run", not "Validate": the start handler already validates
        // server-side before it starts, so this is a REHEARSAL of the same
        // request, not a gate the user must pass through first. Two peer labels
        // invited "must I press this before importing?" — the answer is no.
        {
            label: a.checking ? 'Checking…' : 'Dry run',
            variant: 'secondary',
            onPress: a.validate,
            isDisabled: !a.canStart,
        },
        // Arms only. Removing data always takes a second, explicit press.
        { label: 'Reset…', variant: 'secondary', onPress: a.armReset, isDisabled: !a.canStart },
        {
            label: a.starting ? 'Starting…' : 'Start import',
            variant: 'accent',
            onPress: a.startImport,
            isDisabled: !a.canStart,
        },
    ];
}

/**
 * Where the import will be written — shown, not typed, when the project knows.
 *
 * Its own component because the choice between a read-only summary and an input is
 * self-contained, and inlining it pushed the modal past the complexity ceiling.
 * The override state lives here for the same reason: nothing else needs it.
 *
 * The summary leads with the project NAME because a 22-character nanoid is not
 * something anyone can confirm is right, and keeps the id underneath because the
 * id is what actually decides where data lands. No project name means nothing
 * human to lead with, so the field shows instead — as it does for a project that
 * derives no target at all, which would otherwise be unimportable.
 */
function ImportTargetField({
    projectName,
    instance,
    onChange,
}: {
    projectName?: string;
    instance: string;
    onChange: (value: string) => void;
}): React.JSX.Element {
    const [overriding, setOverriding] = useState(false);

    if (!projectName || !instance || overriding) {
        return (
            <FormField
                fieldKey="commerceInstance"
                label="Commerce instance"
                type="text"
                value={instance}
                onChange={onChange}
                required
                description="Where this data will be written. There is no undo — check it with whoever owns the target."
            />
        );
    }

    return (
        <div className="datapack-import-target">
            <div className="datapack-import-types-head">
                <span className="datapack-import-label">Target</span>
                <ActionButton isQuiet onPress={() => setOverriding(true)}>
                    Change
                </ActionButton>
            </div>
            <div className="datapack-import-target-name">{projectName}</div>
            <div className="datapack-import-target-id">Commerce instance {instance}</div>
            <div className="datapack-import-target-warning">
                There is no undo — check the target with whoever owns it.
            </div>
        </div>
    );
}

/**
 * Where the job stands.
 *
 * **Success gets out of the way; problems stand in it.** A terminal success is a
 * MIDPOINT of the reuse flow (reset → pick types → import), so it renders as a
 * compact StatusCard — the dashboard's ambient-status vocabulary — with the form
 * usable beneath it. `partial` and failures keep the full StatusDisplay, because
 * they end the flow until read. Live review found a full-bleed success block
 * displacing the form the user needed next.
 *
 * The wording follows `record.operation` — the modal announced a completed reset
 * as "Import finished" before the record carried it.
 */
function ImportProgress({
    record,
    watching,
}: {
    record: ImportJobRecord;
    watching: boolean;
}): React.JSX.Element {
    const op = record.operation === 'reset' ? 'Reset' : 'Import';
    const perType = Object.entries(record.perType).map(([type, state]) => `${type}: ${state}`);

    if (record.outcome === 'watching') {
        const active = record.operation === 'reset' ? 'Resetting…' : 'Importing…';
        return (
            <LoadingDisplay
                size="L"
                message={watching ? active : 'Stopped watching.'}
                subMessage={perType.join(' · ') || undefined}
                helperText={
                    watching
                        ? 'This can take several minutes. Closing this or stopping the watch continues on the server.'
                        : `The ${op.toLowerCase()} continues on the server.`
                }
            />
        );
    }

    if (record.outcome === 'success') {
        return (
            <StatusCard
                color="green"
                label={op.toUpperCase()}
                status={`${op} finished — ${perType.join(' · ') || 'all requested data types succeeded'}`}
            />
        );
    }

    return (
        <StatusDisplay
            variant={OUTCOME_VARIANT[record.outcome] ?? 'info'}
            title={describeOutcome(record, op)}
            message={record.reason}
            details={perType}
        />
    );
}

/** Which in-flight operation the one busy spinner is narrating. */
function busyMessage(starting: boolean, resetting: boolean): string {
    if (starting) {
        return 'Starting import…';
    }
    if (resetting) {
        return 'Starting reset…';
    }
    return 'Checking with the service…';
}

/**
 * The dry-run verdict and the three failure states.
 *
 * Extracted for the same reason as {@link ImportTargetField}: each state is one
 * branch, and inlining all of them pushed the modal past the complexity ceiling.
 * All house vocabulary — StatusDisplay for verdicts and failures (a refusal is
 * an ANSWER, so it renders as warning, not error). StatusDisplay renders
 * `message` only beneath a `title`, so every failure carries one — found when a
 * message-only error rendered as nothing.
 */
function RequestFeedback({
    dryRun,
    start,
    reset,
    provision,
}: {
    dryRun: DataInstallerRequest<{ valid: boolean; reason?: string }>;
    start: DataInstallerRequest<{ activationId: string }>;
    reset: DataInstallerRequest<{ activationId: string }>;
    provision: DataInstallerRequest<never>;
}): React.JSX.Element {
    // Keyed off the refusal's DATA flag, never its message string. Either write
    // path can raise it; the offer is the same console-free loop.
    const needsCredentials = [dryRun.failure, start.failure, reset.failure].some(
        (failure) => (failure?.data as { needsAccsCredentials?: boolean } | undefined)?.needsAccsCredentials,
    );
    const provisionAction = needsCredentials
        ? [
              {
                  label: provision.loading
                      ? 'Setting up…'
                      : 'Set up credentials automatically',
                  variant: 'accent' as const,
                  onPress: () => provision.load({}),
              },
          ]
        : undefined;

    // provision.value is never set (the handler returns no data), so success is
    // "loading finished with no failure after a load happened".
    const provisioned = !provision.loading && !provision.failure && provision.settled;

    return (
        <>
            {provisioned ? (
                <StatusDisplay
                    variant="success"
                    title="Credentials configured"
                    message="The OAuth pair was created in this project's workspace and saved to its configuration. Run the dry run again."
                />
            ) : null}
            {provision.failure ? (
                <StatusDisplay
                    variant="error"
                    title="Automatic setup failed"
                    message={provision.failure.message}
                />
            ) : null}
            {dryRun.value && !dryRun.loading ? (
                <StatusDisplay
                    variant={dryRun.value.valid ? 'success' : 'warning'}
                    title={dryRun.value.valid ? 'Dry run passed' : 'The service refused this request'}
                    message={
                        dryRun.value.valid
                            ? 'The service says this request would be accepted. Nothing has been written.'
                            : dryRun.value.reason
                    }
                />
            ) : null}

            {dryRun.failure ? (
                <StatusDisplay
                    variant="error"
                    title="Dry run failed"
                    message={dryRun.failure.message}
                    actions={provisionAction}
                />
            ) : null}
            {start.failure ? (
                <StatusDisplay
                    variant="error"
                    title="Import failed to start"
                    message={start.failure.message}
                    actions={provisionAction}
                />
            ) : null}
            {reset.failure ? (
                <StatusDisplay
                    variant="error"
                    title="Reset failed to start"
                    message={reset.failure.message}
                    actions={provisionAction}
                />
            ) : null}
        </>
    );
}

/** Terminal outcome → the house StatusDisplay variant. `partial` is a warning, not a failure. */
const OUTCOME_VARIANT: Record<string, 'success' | 'warning' | 'error' | 'info'> = {
    success: 'success',
    partial: 'warning',
    error: 'error',
    'never-registered': 'error',
    stopped: 'info',
    'still-running': 'info',
    unwatchable: 'warning',
};

/**
 * One line saying where a NON-success terminal job stands.
 *
 * `watching` and `success` never reach this — ImportProgress renders those
 * itself. `partial` gets its own wording rather than being folded into failure:
 * a re-run legitimately skips items that already exist.
 */
function describeOutcome(record: ImportJobRecord, op: string): string {
    const lower = op.toLowerCase();
    switch (record.outcome) {
        case 'partial':
            return `${op} finished, but some data types did not. Re-running skips what already exists.`;
        case 'error':
            return `${op} failed. No data type succeeded.`;
        case 'never-registered':
            return `The ${lower} never started — the service did not register it.`;
        case 'stopped':
            return `Stopped watching. The ${lower} continues on the server.`;
        case 'still-running':
            return `Still running after the watch window. The ${lower} continues on the server.`;
        case 'unwatchable':
            return 'Lost track of this job — it is still running on the server. Check the Installed tab for the result.';
        default:
            return String(record.outcome);
    }
}
