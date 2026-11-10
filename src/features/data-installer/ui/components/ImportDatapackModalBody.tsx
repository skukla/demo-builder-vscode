/**
 * The one view the import modal is showing.
 *
 * Split out of `ImportDatapackModal` when a 682-line component crossed its import
 * ceiling: the body is its views and nothing else, and it carries the imports
 * they need. The precedence still belongs to `resolveView` in the parent — this
 * renders what that decided.
 *
 * @module features/data-installer/ui/components/ImportDatapackModalBody
 */

import React, { useState } from 'react';
import { importSteps, type StepSource } from '../../importSteps';
import type { ImportJobRecord } from '../../types';
import { dataTypeLabel } from '../dataTypeLabel';
import { useImportProgress } from '../hooks/useImportProgress';
import type { ImportScopes } from '../hooks/useImportScopes';
import type { RemovalConfirmView } from '../hooks/useRemovalConfirm';
import { hasMeasurableProgress, progressLabel, progressStep, summarizeProgress } from '../importProgress';
import { DatapackResultBody } from './DatapackResultBody';
import { ImportForm } from './ImportForm';
import type { ResultContent } from './importResult';
import { ImportRunView } from './ImportRunView';
import { recordedRemovalLines } from './removalConfirm';
import { RemovalConfirmBody } from './RemovalConfirmBody';
import { LoadingDisplay } from '@/core/ui/components/feedback/LoadingDisplay';
import { SteadyHeight } from '@/core/ui/components/layout/SteadyHeight';
import { LeadText } from '@/core/ui/components/ui/LeadText';
import type { ModalWait } from '@/core/ui/components/ui/Modal';
import { tookValue } from '@/core/ui/hooks/useRunClock';

/**
 * The project names no Commerce instance; the outcome is the dialog's title (`viewFrame`).
 *
 * A view rather than a disabled form: the instance is no longer typeable, so
 * there is nothing the user could do here to proceed, and a form that cannot be
 * submitted and never says why is the worst of both.
 */
function NoInstanceNotice(): React.JSX.Element {
    return <LeadText>Connect a Commerce backend on the project dashboard, then import from here.</LeadText>;
}

/** A data type's label inside a sentence: "attribute sets", but "B2B companies" keeps its acronym. */
function inSentence(label: string): string {
    return label.split(' ').map((word) => (/^[A-Z][a-z]+$/.test(word) ? word.toLowerCase() : word)).join(' ');
}

/**
 * The types in a sentence, by the dialog design rules: up to seven named in full, past that three
 * and how many more.
 */
export function typesInSentence(labels: string[]): string {
    const words = labels.map(inSentence);
    if (words.length > 7) return `${words.slice(0, 3).join(', ')} and ${words.length - 3} more data types`;
    if (words.length < 2) return words.join('');
    return `${words.slice(0, -1).join(', ')} and ${words[words.length - 1]}`;
}

/** No "Permanently deletes" lines: one shared reference, so the confirm's props are stable. */
const NO_LINES: readonly string[] = [];

/**
 * The armed removal, as the dialog design rules' confirm (owner, 2026-10-31): the question is the
 * dialog's title, naming the store, and this is its one sentence, the warning a word in it. It was
 * the question again, Store and Data rows and a muted "This can't be undone." under them, which
 * read as machine-made. What the SC changed since it was installed follows it (step 05).
 */
function ResetConfirm({ ctx }: { ctx: BodyContext }): React.JSX.Element {
    // An import replacing the demo's pack asks only about the changes (walk F97, F106).
    if (ctx.replacement.confirming) return <RemovalConfirmBody deletes={NO_LINES} view={ctx.removal} forImport />;
    // Demo Builder's engine takes what its record lists; the service takes what is ticked.
    const deletes = ctx.recordedKinds
        ? recordedRemovalLines(ctx.displayName, ctx.recordedKinds, ctx.selected, (kinds) => typesInSentence(kinds.map(dataTypeLabel)))
        : [`Permanently deletes ${ctx.displayName}\u2019s ${typesInSentence(ctx.selected.map(dataTypeLabel))}.`];
    return <RemovalConfirmBody deletes={deletes} view={ctx.removal} />;
}

/** Which view the modal is showing. */
export type ModalView = 'form' | 'busy' | 'starting' | 'reading-changes' | 'confirm-reset' | 'watching' | 'result' | 'no-instance';

/** Everything the one visible view needs, gathered once. */
export interface BodyContext {
    displayName: string;
    commerceInstance: string;
    availableTypes: string[];
    selected: string[];
    allSelected: boolean;
    /** The kinds on the pack's install record, when Demo Builder's engine installed it; else null. */
    recordedKinds?: string[] | null;
    record: ImportJobRecord | null;
    result: ResultContent | null;
    /** The busy view's wait (`busyMessage`). */
    busyMessage: ModalWait;
    scope: ImportScopes;
    removal: RemovalConfirmView;
    toggle: (type: string, isSelected: boolean) => void;
    toggleAll: () => void;
    /** The pack imported, as the steps name it: "Install My Luma", "Install the Version from …". */
    installing: { name: string; version: string };
    /** The data types' columns under Install (`runColumns`), chosen when the window opened. */
    columns: 1 | 2;
    /** What importing again would change, by data type (`useImportChanges`), when the project has it. */
    changes: { lines: Record<string, string> | null; failed: boolean };
    /** An import over another pack or version the demo uses (walk F97, `useReplacement`). */
    replacement: ReplacementView;
}

/** What the views draw of an import that replaces the demo's pack. */
export interface ReplacementView {
    /** The pack replaced, as the SC knows it; absent when the import replaces nothing. */
    name?: string;
    /** The pack replaced is another version of the same pack: that version, "Nov 9, 9:15 AM". */
    version?: string;
    /** The form's sentence. */
    sentence?: string;
    /** The confirm up is the import's. */
    confirming: boolean;
    /** The stage of saving the SC's changes first, before the job starts. */
    savingStage?: string;
}

/**
 * The one view the state machine chose.
 *
 * Extracted so `ImportDatapackModal` stays under the complexity ceiling: every
 * view is a branch, and six of them had accumulated in the one function. The
 * precedence still belongs to {@link resolveView} — this only renders what it
 * decided.
 */
export function ImportDatapackModalBody({ view, ctx }: { view: ModalView; ctx: BodyContext }): React.JSX.Element {
    const pressedAt = usePressedAt(view === 'starting');
    return (
        // Each view takes its own height, at once (dialog design rules).
        <SteadyHeight>
            <div className="datapack-import-body">
                    {view === 'confirm-reset' ? <ResetConfirm ctx={ctx} /> : null}

                    {view === 'starting' ? <StartingRun ctx={ctx} startedAt={pressedAt ?? Date.now()} /> : null}
                    {view === 'watching' && ctx.record ? <Watch record={ctx.record} ctx={ctx} pressedAt={pressedAt} /> : null}


                    {view === 'result' && ctx.result?.run ? <ImportEnd result={ctx.result} run={ctx.result.run} ctx={ctx} /> : null}
                    {view === 'result' && ctx.result && !ctx.result.run ? <DatapackResultBody result={ctx.result} /> : null}

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
                            scopeLocked={ctx.scope.locked}
                            changes={ctx.changes}
                            {...(ctx.replacement.sentence ? { replaces: ctx.replacement.sentence } : {})}
                        />
                    ) : null}
        </div>
        </SteadyHeight>
    );
}

/**
 * When Import was pressed, for one clock from the press to the end (review, 2026-11-10: a save-first
 * import's clock started again when its job did). Taken each time the window enters its starting
 * view; undefined for a window reopened onto a job already running, which times from the job.
 */
function usePressedAt(starting: boolean): number | undefined {
    const [run, setRun] = useState<{ starting: boolean; at?: number }>({ starting: false });
    // React's adjust-state-on-change pattern: set during render, so the first frame has it.
    if (run.starting !== starting) setRun({ starting, at: starting ? Date.now() : run.at });
    return run.at;
}

/**
 * An import before its job is recorded: its steps at once, so the window does not show a spinner
 * screen first and then change layout (owner, 2026-11-07). Saving the SC's changes runs here, before
 * the job, as the first step (walk F105).
 */
function StartingRun({ ctx, startedAt }: { ctx: BodyContext; startedAt: number }): React.JSX.Element {
    const { replacement } = ctx;
    const steps = importSteps({
        perType: {},
        dataTypes: ctx.selected,
        running: true,
        installing: ctx.installing,
        ...(replacement.name ? { replaces: replacement.name } : {}),
        ...(replacement.version ? { replacesVersion: replacement.version } : {}),
        ...(replacement.name && replacement.savingStage ? { savingStage: replacement.savingStage } : {}),
    });
    return <ImportRunView steps={steps} columns={ctx.columns} running={{ startedAt }} />;
}

/** An import runs on its steps; a removal still waits on its spinner. */
function Watch({ record, ctx, pressedAt }: { record: ImportJobRecord; ctx: BodyContext; pressedAt?: number }): React.JSX.Element {
    if (record.operation === 'reset') return <WatchProgress record={record} />;
    return <ImportWatch record={record} ctx={ctx} startedAt={pressedAt ?? Date.parse(record.startedAt)} />;
}

/**
 * An import while it runs: its steps from the LIVE poll (`record.perType` is written only as polls
 * land), and the clock under them.
 */
function ImportWatch({ record, ctx, startedAt }: { record: ImportJobRecord; ctx: BodyContext; startedAt: number }): React.JSX.Element {
    const live = useImportProgress(record.activationId);
    const steps = importSteps({
        perType: live?.perType ?? record.perType,
        dataTypes: record.dataTypes,
        detail: live ? live.detail : record.detail,
        phase: live ? live.phase : record.phase,
        running: true,
        installing: { name: ctx.displayName, version: record.version },
        ...replacingOf(record, live ? live.replacing : record.replacing),
    });
    return <ImportRunView steps={steps} columns={ctx.columns} running={{ startedAt }} />;
}

/** What the steps take from a job replacing the demo's pack (walk F97): the removal, and the save before it. */
function replacingOf(record: ImportJobRecord, replacing: ImportJobRecord['replacing']): Pick<StepSource, 'replaces' | 'replacing' | 'savedAs' | 'replacesVersion'> {
    if (!record.replaces) return {};
    return {
        replaces: record.replaces,
        ...(replacing ? { replacing } : {}),
        ...(record.savedAs ? { savedAs: record.savedAs } : {}),
        ...(record.replacesVersion ? { replacesVersion: record.replacesVersion } : {}),
    };
}

/**
 * An import that ended with a problem or a stop, on the steps it ran on: each step's final state and
 * problem, then the sentence, what changed in the store, and how long it took. A clean finish shows
 * the small result instead (walk F134).
 */
function ImportEnd({ result, run, ctx }: { result: ResultContent; run: ImportJobRecord; ctx: BodyContext }): React.JSX.Element {
    const steps = importSteps({
        perType: run.perType,
        dataTypes: run.dataTypes,
        stoppedAt: run.stoppedAt,
        rowNotes: run.rowNotes,
        reason: run.reason,
        installing: { name: ctx.displayName, version: run.version },
        ...(run.check ? { check: run.check } : {}),
        ...replacingOf(run, run.replacing),
    });
    const took = result.tookMs === undefined ? undefined : tookValue(result.tookMs);
    return (
        <ImportRunView
            steps={steps}
            columns={ctx.columns}
            end={{
                ...(result.lead ? { lead: result.lead } : {}),
                lines: run.scLines ?? [],
                ...(took ? { took } : {}),
            }}
        />
    );
}

/**
 * A removal in flight: spinner, and the per-type states in the subMessage slot. The footer's "Run in
 * background" and "Close" say the job carries on while it is watched.
 */
function WatchProgress({ record }: { record: ImportJobRecord }): React.JSX.Element {
    // `op` is the WIRE value, passed to progressStep; the words the SC reads come from it.
    const op = record.operation === 'reset' ? 'reset' : 'import';

    // The LIVE map, pushed each poll. `record.perType` is empty for the whole
    // run — it is only written when the watch settles — so reading it here is
    // what left the spinner saying nothing for minutes at a time.
    const live = useImportProgress(record.activationId);
    const progress = summarizeProgress(live?.perType ?? record.perType, record.dataTypes);
    const label = progressLabel(progress, live?.detail);

    // The dialog's own wait spacing, so the spinner sits level between the rule and the buttons.
    return (
        <div className="modal-wait">
            <LoadingDisplay
                size="M" centered
                steady
                noBlankRows
                message={progressStep(op)}
                subMessage={label}
                {...(hasMeasurableProgress(progress) ? { progress: progress.percent } : {})}
            />
        </div>
    );
}
