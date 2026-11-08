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
import type { ImportJobRecord } from '../../types';
import { dataTypeLabel } from '../dataTypeLabel';
import { useImportProgress } from '../hooks/useImportProgress';
import type { ImportScopes } from '../hooks/useImportScopes';
import type { RemovalConfirmView } from '../hooks/useRemovalConfirm';
import { hasMeasurableProgress, progressLabel, progressStep, summarizeProgress } from '../importProgress';
import { DatapackResultBody } from './DatapackResultBody';
import { ImportForm } from './ImportForm';
import type { ResultContent } from './importResult';
import { runRows } from './importRunRows';
import { ImportRunView } from './ImportRunView';
import { recordedRemovalLines } from './removalConfirm';
import { RemovalConfirmBody } from './RemovalConfirmBody';
import { LoadingDisplay } from '@/core/ui/components/feedback/LoadingDisplay';
import { SteadyHeight } from '@/core/ui/components/layout/SteadyHeight';
import { LeadText } from '@/core/ui/components/ui/LeadText';
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

/**
 * The armed removal, as the dialog design rules' confirm (owner, 2026-10-31): the question is the
 * dialog's title, naming the store, and this is its one sentence, the warning a word in it. It was
 * the question again, Store and Data rows and a muted "This can't be undone." under them, which
 * read as machine-made. What the SC changed since it was installed follows it (step 05).
 */
function ResetConfirm({ ctx }: { ctx: BodyContext }): React.JSX.Element {
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
    busyMessage: string;
    scope: ImportScopes;
    removal: RemovalConfirmView;
    toggle: (type: string, isSelected: boolean) => void;
    toggleAll: () => void;
    /** How many columns an import's rows take (`runColumns`). */
    columns: number;
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
    return (
        // Each view takes its own height, at once (dialog design rules).
        <SteadyHeight>
            <div className="datapack-import-body">
                    {view === 'confirm-reset' ? <ResetConfirm ctx={ctx} /> : null}

                    {view === 'starting' ? <StartingRun dataTypes={ctx.selected} columns={ctx.columns} /> : null}
                    {view === 'watching' && ctx.record ? <Watch record={ctx.record} columns={ctx.columns} /> : null}


                    {view === 'result' && ctx.result?.run ? <ImportEnd result={ctx.result} run={ctx.result.run} columns={ctx.columns} /> : null}
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
                        />
                    ) : null}
        </div>
        </SteadyHeight>
    );
}

/**
 * An import before its job is recorded: its rows at once, Preparing Import spinning, so the window
 * does not show a spinner screen first and then change layout (owner, 2026-11-07).
 */
function StartingRun({ dataTypes, columns }: { dataTypes: string[]; columns: number }): React.JSX.Element {
    const [startedAt] = useState(() => Date.now());
    return <ImportRunView rows={runRows({ perType: {}, dataTypes, running: true })} columns={columns} running={{ startedAt }} />;
}

/** An import runs on its rows; a removal still waits on its spinner. */
function Watch({ record, columns }: { record: ImportJobRecord; columns: number }): React.JSX.Element {
    return record.operation === 'reset' ? <WatchProgress record={record} /> : <ImportWatch record={record} columns={columns} />;
}

/**
 * An import while it runs: a row per data type, from the LIVE poll (`record.perType` is written only
 * as polls land), between Preparing Import and Finishing Import, and the clock under them.
 */
function ImportWatch({ record, columns }: { record: ImportJobRecord; columns: number }): React.JSX.Element {
    const live = useImportProgress(record.activationId);
    const rows = runRows({
        perType: live?.perType ?? record.perType,
        dataTypes: record.dataTypes,
        detail: live ? live.detail : record.detail,
        phase: live ? live.phase : record.phase,
        running: true,
    });
    return <ImportRunView rows={rows} columns={columns} running={{ startedAt: Date.parse(record.startedAt) }} />;
}

/**
 * An import's ending, on the rows it ran on: each row's final state and problem, then the sentence,
 * what changed in the store, and how long it took. A stop before any data type sits on Preparing
 * Import.
 */
function ImportEnd({ result, run, columns }: { result: ResultContent; run: ImportJobRecord; columns: number }): React.JSX.Element {
    const rows = runRows({ perType: run.perType, dataTypes: run.dataTypes, stoppedAt: run.stoppedAt, rowNotes: run.rowNotes, reason: run.reason });
    const took = result.tookMs === undefined ? undefined : tookValue(result.tookMs);
    return (
        <ImportRunView
            rows={rows}
            columns={columns}
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
