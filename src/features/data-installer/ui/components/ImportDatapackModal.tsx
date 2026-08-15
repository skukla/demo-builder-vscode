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

import { DialogContainer } from '@adobe/react-spectrum';
import React, { useCallback, useEffect, useState } from 'react';
import type { DatapackId, ImportJobRecord } from '../../types';
import { useDataInstallerRequest } from '../hooks/useDataInstallerRequest';
import { useImportScopes, type ImportScopes } from '../hooks/useImportScopes';
import { ImportForm } from './ImportForm';
import {
    describePerType,
    resolveResult,
    type LastAction,
    type ResultContent,
} from './importResult';
import { LoadingDisplay } from '@/core/ui/components/feedback/LoadingDisplay';
import { StatusDisplay } from '@/core/ui/components/feedback/StatusDisplay';
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
    // Owns the discovered scopes AND the user's choice within them — see the hook.
    const scope = useImportScopes();

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
    const canStart = commerceInstance.length > 0 && selected.length > 0 && !busy;

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

    return (
        <DialogContainer type="modal" onDismiss={onClose}>
            <Modal
                // Wide, so the type list fits three uniform columns instead of
                // two scrolling ones. The target block's removal freed the rest.
                wide
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
                <ModalBody view={view} ctx={bodyContext} />
            </Modal>
        </DialogContainer>
    );
}

type ModalView = 'form' | 'busy' | 'confirm-reset' | 'watching' | 'result' | 'no-instance';

/** One view at a time; this precedence IS the state machine. */
function resolveView(state: {
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

/**
 * The project names no Commerce instance.
 *
 * A view rather than a disabled form: the instance is no longer typeable, so
 * there is nothing the user could do here to proceed, and a form that cannot be
 * submitted and never says why is the worst of both.
 */
function NoInstanceNotice(): React.JSX.Element {
    return (
        <StatusDisplay
            variant="error"
            title="This project has no Commerce instance"
            message="Connect a Commerce backend on the project dashboard, then import from here."
        />
    );
}

/** Everything the one visible view needs, gathered once. */
interface BodyContext {
    displayName: string;
    commerceInstance: string;
    availableTypes: string[];
    selected: string[];
    allSelected: boolean;
    record: ImportJobRecord | null;
    watching: boolean;
    result: ResultContent | null;
    busyMessage: string;
    scope: ImportScopes;
    toggle: (type: string, isSelected: boolean) => void;
    toggleAll: () => void;
}

/**
 * The one view the state machine chose.
 *
 * Extracted so `ImportDatapackModal` stays under the complexity ceiling: every
 * view is a branch, and six of them had accumulated in the one function. The
 * precedence still belongs to {@link resolveView} — this only renders what it
 * decided.
 */
function ModalBody({ view, ctx }: { view: ModalView; ctx: BodyContext }): React.JSX.Element {
    return (
        <div className="datapack-import-body">
                    {view === 'busy' ? (
                        // Size L on purpose: LoadingDisplay keys the wizard
                        // treatment off it — M left-aligns and shrinks the text.
                        <LoadingDisplay
                            size="L"
                            message={ctx.busyMessage}
                        />
                    ) : null}

                    {view === 'confirm-reset' ? (
                        <div className="datapack-import-danger">
                            {`Remove ${ctx.displayName}'s ${ctx.selected.join(', ')} from ${ctx.commerceInstance}. This cannot be undone — the Data Installer has no restore.`}
                </div>
                    ) : null}

                    {view === 'watching' && ctx.record ? (
                        <WatchProgress record={ctx.record} watching={ctx.watching} />
                    ) : null}

                    {view === 'result' && ctx.result ? (
                        <StatusDisplay
                            variant={ctx.result.variant}
                            title={ctx.result.title}
                            message={ctx.result.message}
                            details={ctx.result.details}
                        />
                    ) : null}

                    {view === 'no-instance' ? <NoInstanceNotice /> : null}

                    {view === 'form' ? (
                        <ImportForm
                            availableTypes={ctx.availableTypes}
                            selected={ctx.selected}
                            allSelected={ctx.allSelected}
                            onToggle={ctx.toggle}
                            onToggleAll={ctx.toggleAll}
                            websites={ctx.scope.websites}
                            websiteCode={ctx.scope.websiteCode}
                            storeCode={ctx.scope.storeCode}
                            onWebsiteChange={ctx.scope.chooseWebsite}
                            onStoreChange={ctx.scope.chooseStore}
                            scopesLoading={ctx.scope.loading}
                        />
                    ) : null}
        </div>
    );
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
            label: startLabel(a.provisioning, a.starting),
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
    const perType = describePerType(record.perType);

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

/**
 * The start button's label for the phase it is in.
 *
 * Provisioning wins over starting: the credential setup runs FIRST and can take
 * ~50s on its own, so a "Starting…" label during it would be describing the
 * wrong wait.
 */
function startLabel(provisioning: boolean, starting: boolean): string {
    if (provisioning) {
        return 'Setting up…';
    }
    if (starting) {
        return 'Starting…';
    }
    return 'Start import';
}
