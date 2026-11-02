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

import React from 'react';
import type { ImportJobRecord } from '../../types';
import { dataTypeLabel } from '../dataTypeLabel';
import { useImportProgress } from '../hooks/useImportProgress';
import type { ImportScopes } from '../hooks/useImportScopes';
import { hasMeasurableProgress, progressLabel, progressStep, summarizeProgress } from '../importProgress';
import { DatapackResultBody } from './DatapackResultBody';
import { ImportForm } from './ImportForm';
import type { ResultContent } from './importResult';
import { LoadingDisplay } from '@/core/ui/components/feedback/LoadingDisplay';
import { SteadyHeight } from '@/core/ui/components/layout/SteadyHeight';
import { LeadText } from '@/core/ui/components/ui/LeadText';

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

/**
 * After Stop watching: said so "stopped looking" never reads as "cancelled". No spinner, because
 * nothing here is waiting any more; the title says it stopped (`viewFrame`).
 */
function StoppedWatching({ record }: { record: ImportJobRecord }): React.JSX.Element {
    return <LeadText>The {record.operation === 'reset' ? 'removal' : 'import'} carries on without you.</LeadText>;
}

/** A data type's label inside a sentence: "categories", but "B2B companies" keeps its capitals. */
function inSentence(label: string): string {
    return /^.[A-Z0-9]/.test(label) ? label : label.charAt(0).toLowerCase() + label.slice(1);
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
 * read as machine-made.
 */
function ResetConfirm({ ctx }: { ctx: BodyContext }): React.JSX.Element {
    return (
        <LeadText>
            Permanently deletes {ctx.displayName}&rsquo;s {typesInSentence(ctx.selected.map(dataTypeLabel))}.
        </LeadText>
    );
}

/** Which view the modal is showing. */
export type ModalView = 'form' | 'busy' | 'confirm-reset' | 'watching' | 'stopped-watching' | 'result' | 'no-instance';

/** Everything the one visible view needs, gathered once. */
export interface BodyContext {
    displayName: string;
    commerceInstance: string;
    availableTypes: string[];
    selected: string[];
    allSelected: boolean;
    record: ImportJobRecord | null;
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
export function ImportDatapackModalBody({ view, ctx }: { view: ModalView; ctx: BodyContext }): React.JSX.Element {
    return (
        // Each view takes its own height, at once (dialog design rules).
        <SteadyHeight>
            <div className="datapack-import-body">
                    {view === 'confirm-reset' ? <ResetConfirm ctx={ctx} /> : null}

                    {view === 'watching' && ctx.record ? <WatchProgress record={ctx.record} /> : null}

                    {view === 'stopped-watching' && ctx.record ? <StoppedWatching record={ctx.record} /> : null}

                    {view === 'result' && ctx.result ? <DatapackResultBody result={ctx.result} /> : null}

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
 * The in-flight watch: spinner, and the per-type states in the subMessage slot. The footer's "Run in
 * background" and "Stop watching" say the job carries on while it is watched.
 */
function WatchProgress({ record }: { record: ImportJobRecord }): React.JSX.Element {
    // `op` is the WIRE value, passed to progressStep; the words the SC reads come from it.
    const op = record.operation === 'reset' ? 'reset' : 'import';

    // The LIVE map, pushed each poll. `record.perType` is empty for the whole
    // run — it is only written when the watch settles — so reading it here is
    // what left the spinner saying nothing for minutes at a time.
    const live = useImportProgress(record.activationId);
    const progress = summarizeProgress(live?.perType ?? record.perType, record.dataTypes);
    const label = progressLabel(progress);

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
