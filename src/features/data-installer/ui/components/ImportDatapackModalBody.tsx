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
import { progressLabel, summarizeProgress } from '../importProgress';
import { ImportForm } from './ImportForm';
import type { ResultContent } from './importResult';
import { LoadingDisplay } from '@/core/ui/components/feedback/LoadingDisplay';
import { StatusDisplay } from '@/core/ui/components/feedback/StatusDisplay';
import { SteadyHeight } from '@/core/ui/components/layout/SteadyHeight';

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
        // Six views, six natural heights. Without a floor the dialog jumps every time
        // one replaces another — form, then spinner, then result, all different sizes
        // in one dry run (owner, 2026-09-20).
        <SteadyHeight>
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
                        // Three lines, not one sentence. This read as a single run
                        // of prose carrying fourteen raw service codes
                        // (`b2b_shared_catalog_company_assignments`) and a bare
                        // 22-character tenant id — the shape nobody reads before
                        // pressing the button that cannot be undone.
                        //
                        // The list stays in full rather than being summarised to a
                        // count: the user picked these types, and a destructive
                        // confirmation is the one place they should be able to
                        // check the picking. It is the CODES that were unreadable,
                        // so they go through the same `dataTypeLabel` as the
                        // checkboxes they were chosen from.
                        <div className="datapack-import-danger">
                            <p className="datapack-danger-lede">
                                Remove {ctx.displayName}&rsquo;s sample data from this Commerce
                                instance?
                            </p>
                            {/* Term and value each in their own element. A bare
                                text node beside the term leaves the value with no
                                element of its own, so nothing can query or style
                                it independently. */}
                            <p>
                                <span className="datapack-danger-term">Instance</span>
                                <span className="datapack-danger-value">
                                    {ctx.commerceInstance}
                                </span>
                            </p>
                            <p>
                                <span className="datapack-danger-term">
                                    {ctx.selected.length} data{' '}
                                    {ctx.selected.length === 1 ? 'type' : 'types'}
                                </span>
                                <span className="datapack-danger-value">
                                    {ctx.selected.map(dataTypeLabel).join(', ')}
                                </span>
                            </p>
                            <p className="datapack-danger-warning">This cannot be undone.</p>
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
    // `op` is the WIRE value, passed to progressLabel. `noun` is what the user
    // reads — they diverged when this surface stopped saying "reset", and one
    // variable serving both is how "The reset continues on the server" survived.
    const op = record.operation === 'reset' ? 'reset' : 'import';
    const noun = record.operation === 'reset' ? 'removal' : 'import';
    const active = record.operation === 'reset' ? 'Removing…' : 'Importing…';

    // The LIVE map, pushed each poll. `record.perType` is empty for the whole
    // run — it is only written when the watch settles — so reading it here is
    // what left the spinner saying nothing for minutes at a time.
    const live = useImportProgress(record.activationId);
    const progress = summarizeProgress(live?.perType ?? record.perType, record.dataTypes);
    const label = progressLabel(progress, op);

    return (
        <LoadingDisplay
            size="L"
            message={watching ? active : 'Stopped watching.'}
            subMessage={label}
            // Determinate only once something has reported. A ring pinned at 0
            // reads as stalled, where the indeterminate spinner reads as starting.
            {...(label ? { progress: progress.percent } : {})}
            helperText={
                watching
                    ? 'This can take several minutes. Closing this or stopping the watch continues on the server.'
                    : `The ${noun} continues on the server.`
            }
        />
    );
}
