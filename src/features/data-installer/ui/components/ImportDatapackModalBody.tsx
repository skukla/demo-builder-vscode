/**
 * The one view the import modal is showing.
 *
 * Split out of `ImportDatapackModal` when a 682-line component crossed its import
 * ceiling: the body is six views and nothing else, and it carries the five imports
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
import { progressLabel, progressStep, summarizeProgress } from '../importProgress';
import { ImportForm } from './ImportForm';
import type { ResultContent } from './importResult';
import { ImportResultView } from './ImportResultView';
import { LoadingDisplay } from '@/core/ui/components/feedback/LoadingDisplay';
import { StatusDisplay } from '@/core/ui/components/feedback/StatusDisplay';
import { SteadyHeight } from '@/core/ui/components/layout/SteadyHeight';
import { LeadText } from '@/core/ui/components/ui/LeadText';

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
            height="auto"
        />
    );
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

/** Which of the six views the modal is showing. */
export type ModalView = 'form' | 'busy' | 'confirm-reset' | 'watching' | 'result' | 'no-instance';

/** Everything the one visible view needs, gathered once. */
export interface BodyContext {
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
export function ImportDatapackModalBody({ view, ctx }: { view: ModalView; ctx: BodyContext }): React.JSX.Element {
    return (
        // Six views, six natural heights: the box fits each and eases between them, so a
        // view change is a movement rather than a jump (dialog design rules, 2026-10-31).
        <SteadyHeight>
            <div className="datapack-import-body">
                    {view === 'busy' ? (
                        // Medium and centred, a job dialog's wait: the large spinner
                        // dominated this short dialog (owner, 2026-10-31).
                        <LoadingDisplay
                            size="M" centered
                            message={ctx.busyMessage}
                        />
                    ) : null}

                    {view === 'confirm-reset' ? <ResetConfirm ctx={ctx} /> : null}

                    {view === 'watching' && ctx.record ? (
                        <WatchProgress record={ctx.record} watching={ctx.watching} />
                    ) : null}

                    {view === 'result' && ctx.result ? <ImportResultView result={ctx.result} /> : null}

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
        </SteadyHeight>
    );
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
    // `op` is the WIRE value, passed to progressStep. `noun` is what the user
    // reads — they diverged when this surface stopped saying "reset", and one
    // variable serving both is how "The reset continues on the server" survived.
    const op = record.operation === 'reset' ? 'reset' : 'import';
    const noun = record.operation === 'reset' ? 'removal' : 'import';

    // The LIVE map, pushed each poll. `record.perType` is empty for the whole
    // run — it is only written when the watch settles — so reading it here is
    // what left the spinner saying nothing for minutes at a time.
    const live = useImportProgress(record.activationId);
    const progress = summarizeProgress(live?.perType ?? record.perType, record.dataTypes);
    const label = progressLabel(progress);

    return (
        <LoadingDisplay
            size="M" centered
            steady
            message={watching ? progressStep(op) : 'Stopped watching.'}
            subMessage={label}
            // Determinate only once something has reported. A ring pinned at 0
            // reads as stalled, where the indeterminate spinner reads as starting.
            {...(label ? { progress: progress.percent } : {})}
            // Said once watching has stopped, so "stopped looking" never reads as "cancelled".
            // Not while watching: the footer's "Run in background" and "Stop watching" say it.
            {...(watching ? {} : { helperText: `The ${noun} carries on without you.` })}
        />
    );
}
