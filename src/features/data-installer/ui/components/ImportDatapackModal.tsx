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
 * **The target comes from the project, and is shown rather than typed** (see
 * {@link ImportTargetField}). **"Stop watching" is not cancel** — there is no
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
 * @module features/data-installer/ui/components/ImportDatapackModal
 */

import { ActionButton, Checkbox, DialogContainer } from '@adobe/react-spectrum';
import React, { useCallback, useEffect, useState } from 'react';
import type { DatapackId, ImportJobRecord } from '../../types';
import {
    useDataInstallerRequest,
    type DataInstallerRequest,
} from '../hooks/useDataInstallerRequest';
import { LoadingDisplay } from '@/core/ui/components/feedback/LoadingDisplay';
import { StatusDisplay } from '@/core/ui/components/feedback/StatusDisplay';
import { FormField } from '@/core/ui/components/forms/FormField';
import { Modal } from '@/core/ui/components/ui/Modal';

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
}

/** The operation whose outcome the result view should show. */
type LastAction = 'dryRun' | 'start' | 'reset' | 'provision';

/** One rendered outcome, whatever produced it. */
interface ResultContent {
    variant: 'success' | 'warning' | 'error' | 'info';
    title: string;
    message?: string;
    details?: string[];
    /** The credentials refusal offers console-free provisioning in the footer. */
    offerProvisioning?: boolean;
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

    const loadStatus = status.load;
    useEffect(() => {
        loadStatus({});
    }, [loadStatus]);

    const loadTarget = target.load;
    useEffect(() => {
        loadTarget({});
    }, [loadTarget]);

    // Seed ONCE, and only into a field the user has not touched: the target
    // request is async and can answer AFTER typing starts, and seeding on
    // arrival would silently replace a typed value in a field that names a
    // write target with no undo. A seeded-once flag alone does not prevent
    // that — a test caught it clobbering input.
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

    // A pack ships up to 14 types (Bodea does), so ticking them one at a time
    // is a chore for what is usually "all of it".
    const allSelected = availableTypes.length > 0 && selected.length === availableTypes.length;
    const toggleAll = useCallback((): void => {
        setSelected(allSelected ? [] : [...availableTypes]);
    }, [allSelected, availableTypes]);

    /** The one body both paths send, so a dry run checks what a start would do. */
    const requestBody = useCallback(
        () => ({
            datapackName: id.name,
            version: id.version,
            // Verbatim — not trimmed, not normalised. See ImportTargetField.
            commerceInstance,
            dataTypes: selected,
        }),
        [id, commerceInstance, selected],
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
    const canStart = commerceInstance.length > 0 && selected.length > 0 && !busy;

    const view = resolveView({ busy, resetArmed, running, result });

    return (
        <DialogContainer type="modal" onDismiss={onClose}>
            <Modal
                title={`Import ${displayName}`}
                size="L"
                fitContent
                onClose={onClose}
                closeLabel="Close"
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
                <div className="datapack-import-body">
                    {view === 'busy' ? (
                        // Size L on purpose: LoadingDisplay keys the wizard
                        // treatment off it — M left-aligns and shrinks the text.
                        <LoadingDisplay
                            size="L"
                            message={busyMessage(start.loading, reset.loading, provision.loading)}
                        />
                    ) : null}

                    {view === 'confirm-reset' ? (
                        <div className="datapack-import-danger">
                            {`Remove ${displayName}'s ${selected.join(', ')} from ${commerceInstance}. This cannot be undone — the Data Installer has no restore.`}
                        </div>
                    ) : null}

                    {view === 'watching' && record ? (
                        <WatchProgress record={record} watching={watching} />
                    ) : null}

                    {view === 'result' && result ? (
                        <StatusDisplay
                            variant={result.variant}
                            title={result.title}
                            message={result.message}
                            details={result.details}
                        />
                    ) : null}

                    {view === 'form' ? (
                        <ImportForm
                            projectName={target.value?.projectName}
                            instance={commerceInstance}
                            onInstanceChange={editInstance}
                            availableTypes={availableTypes}
                            selected={selected}
                            allSelected={allSelected}
                            onToggle={toggle}
                            onToggleAll={toggleAll}
                        />
                    ) : null}
                </div>
            </Modal>
        </DialogContainer>
    );
}

type ModalView = 'form' | 'busy' | 'confirm-reset' | 'watching' | 'result';

/** One view at a time; this precedence IS the state machine. */
function resolveView(state: {
    busy: boolean;
    resetArmed: boolean;
    running: boolean;
    result: ResultContent | null;
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
    return 'form';
}

/**
 * The outcome of the LAST action, or null when it has none yet.
 *
 * Keyed on the last action deliberately: request state persists after
 * settling, so any fixed precedence across requests replays an old outcome
 * over the one the user just caused.
 */
function resolveResult(
    lastAction: LastAction | null,
    sources: {
        dryRun: DataInstallerRequest<{ valid: boolean; reason?: string }>;
        start: DataInstallerRequest<{ activationId: string }>;
        reset: DataInstallerRequest<{ activationId: string }>;
        provision: DataInstallerRequest<never>;
        record: ImportJobRecord | null;
        startedActivation: string | undefined;
    },
): ResultContent | null {
    const { dryRun, start, reset, provision, record, startedActivation } = sources;

    switch (lastAction) {
        case 'dryRun':
            if (dryRun.failure) {
                return failureResult('Dry run failed', dryRun.failure);
            }
            if (dryRun.value) {
                // A refusal is an ANSWER the button exists to fetch — warning,
                // not error.
                return dryRun.value.valid
                    ? {
                          variant: 'success',
                          title: 'Dry run passed',
                          message:
                              'The service says this request would be accepted. Nothing has been written.',
                      }
                    : {
                          variant: 'warning',
                          title: 'The service refused this request',
                          message: dryRun.value.reason,
                      };
            }
            return null;
        case 'provision':
            if (provision.failure) {
                return failureResult('Automatic setup failed', provision.failure);
            }
            if (provision.settled) {
                return {
                    variant: 'success',
                    title: 'Credentials configured',
                    message:
                        "The OAuth pair was created in this project's workspace and saved to its configuration. Run the dry run again.",
                };
            }
            return null;
        case 'start':
        case 'reset': {
            const request = lastAction === 'start' ? start : reset;
            if (request.failure) {
                return failureResult(
                    lastAction === 'start' ? 'Import failed to start' : 'Reset failed to start',
                    request.failure,
                );
            }
            // The terminal record for THIS session's job. A running record is
            // the watching view's business, not a result.
            if (
                record &&
                record.outcome !== 'watching' &&
                record.activationId === startedActivation
            ) {
                return terminalResult(record);
            }
            return null;
        }
        default:
            return null;
    }
}

/** A failed request, with the provisioning offer when the refusal flags it. */
function failureResult(
    title: string,
    failure: { message: string; data?: unknown },
): ResultContent {
    return {
        variant: 'error',
        title,
        message: failure.message,
        offerProvisioning: Boolean(
            (failure.data as { needsAccsCredentials?: boolean } | undefined)?.needsAccsCredentials,
        ),
    };
}

/** A finished job, worded for ITS operation — a reset must not say "Import". */
function terminalResult(record: ImportJobRecord): ResultContent {
    const op = record.operation === 'reset' ? 'Reset' : 'Import';
    const perType = Object.entries(record.perType).map(([type, state]) => `${type}: ${state}`);

    if (record.outcome === 'success') {
        return {
            variant: 'success',
            title: `${op} finished`,
            message: 'All requested data types succeeded.',
            details: perType,
        };
    }
    return {
        variant: OUTCOME_VARIANT[record.outcome] ?? 'info',
        title: describeOutcome(record, op),
        message: record.reason,
        details: perType,
    };
}

/** Terminal outcome → StatusDisplay variant. `partial` is a warning, not a failure. */
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
 * One line saying where a NON-success terminal job stands. `partial` gets its
 * own wording rather than being folded into failure: a re-run legitimately
 * skips items that already exist.
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

/** Which in-flight operation the one busy spinner is narrating. */
function busyMessage(starting: boolean, resetting: boolean, provisioning: boolean): string {
    if (starting) {
        return 'Starting import…';
    }
    if (resetting) {
        return 'Starting reset…';
    }
    if (provisioning) {
        return 'Setting up credentials…';
    }
    return 'Checking with the service…';
}

/** The footer, one row per view. */
function buildActions(a: {
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
            label: a.checking ? 'Checking…' : 'Dry run',
            variant: 'secondary',
            onPress: a.validate,
            isDisabled: !a.canStart,
        },
        // Arms only. Removing data always takes a second, explicit press.
        { label: 'Reset…', variant: 'secondary', onPress: a.armReset, isDisabled: !a.canStart },
        {
            label: a.provisioning ? 'Setting up…' : a.starting ? 'Starting…' : 'Start import',
            variant: 'accent',
            onPress: a.startImport,
            isDisabled: !a.canStart,
        },
    ];
}

/**
 * The in-flight watch: spinner, per-type states in the subMessage slot, the
 * reassurance in helperText — the slot LoadingDisplay documents for exactly
 * that. It belongs on screen WHILE Stop watching is available: learning that
 * stopping does not cancel after you stopped is too late.
 */
function WatchProgress({
    record,
    watching,
}: {
    record: ImportJobRecord;
    watching: boolean;
}): React.JSX.Element {
    const op = record.operation === 'reset' ? 'reset' : 'import';
    const active = record.operation === 'reset' ? 'Resetting…' : 'Importing…';
    const perType = Object.entries(record.perType).map(([type, state]) => `${type}: ${state}`);

    return (
        <LoadingDisplay
            size="L"
            message={watching ? active : 'Stopped watching.'}
            subMessage={perType.join(' · ') || undefined}
            helperText={
                watching
                    ? 'This can take several minutes. Closing this or stopping the watch continues on the server.'
                    : `The ${op} continues on the server.`
            }
        />
    );
}

/** The form view: the derived target plus the type checkboxes. */
function ImportForm({
    projectName,
    instance,
    onInstanceChange,
    availableTypes,
    selected,
    allSelected,
    onToggle,
    onToggleAll,
}: {
    projectName?: string;
    instance: string;
    onInstanceChange: (value: string) => void;
    availableTypes: string[];
    selected: string[];
    allSelected: boolean;
    onToggle: (type: string, isSelected: boolean) => void;
    onToggleAll: () => void;
}): React.JSX.Element {
    return (
        <>
            <ImportTargetField
                projectName={projectName}
                instance={instance}
                onChange={onInstanceChange}
            />
            <div className="datapack-import-types">
                <div className="datapack-import-types-head">
                    <span className="datapack-import-label">Data types</span>
                    <ActionButton isQuiet onPress={onToggleAll}>
                        {allSelected ? 'Clear all' : 'Select all'}
                    </ActionButton>
                </div>
                {/* Two columns: a pack ships up to 14 types, and one column
                    turns a glance into a scroll. */}
                <div className="datapack-import-type-grid">
                    {availableTypes.map((type) => (
                        <Checkbox
                            key={type}
                            isSelected={selected.includes(type)}
                            onChange={(isSelected) => onToggle(type, isSelected)}
                        >
                            {type}
                        </Checkbox>
                    ))}
                </div>
            </div>
        </>
    );
}

/**
 * Where the import will be written — shown, not typed, when the project knows.
 *
 * The summary leads with the project NAME because a 22-character nanoid is not
 * something anyone can confirm is right, and keeps the id underneath (monospace
 * — checked character by character against the console) because the id is what
 * actually decides where data lands. `Change` swaps in the editable field; a
 * project that derives nothing gets the field directly, or it could not be
 * imported into at all. The typed value is sent verbatim — never trimmed or
 * reformatted on the way out.
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
