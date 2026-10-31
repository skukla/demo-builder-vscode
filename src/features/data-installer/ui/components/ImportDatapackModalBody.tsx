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

import { Text } from '@adobe/react-spectrum';
import React from 'react';
import type { ImportJobRecord } from '../../types';
import { dataTypeLabel } from '../dataTypeLabel';
import { useImportProgress } from '../hooks/useImportProgress';
import type { ImportScopes } from '../hooks/useImportScopes';
import { progressLabel, progressStep, summarizeProgress } from '../importProgress';
import { ImportForm } from './ImportForm';
import type { ResultContent } from './importResult';
import { LoadingDisplay } from '@/core/ui/components/feedback/LoadingDisplay';
import { StatusDisplay } from '@/core/ui/components/feedback/StatusDisplay';
import { SteadyHeight } from '@/core/ui/components/layout/SteadyHeight';
import { Fact, FactList } from '@/core/ui/components/ui/FactList';
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

/** The chosen target by name, "Justrite Test Store US (Justrite Test)", or the instance when unnamed. */
function targetName(ctx: BodyContext): string {
    const website = ctx.scope.websites.find((w) => w.code === ctx.scope.websiteCode);
    const store = website?.storeViews.find((v) => v.code === ctx.scope.storeCode);
    if (website && store) return `${store.name} (${website.name})`;
    return website?.name ?? ctx.commerceInstance;
}

/**
 * The armed removal, in the extension's confirmation shape (owner, 2026-10-31: the old block, a
 * red left border, tiny capital labels and the raw instance id, read as cramped and as nothing
 * else in the extension): the question, then Store and Data as label-and-value rows, as Clear
 * demo data and the setup step's Where / Enter do, then the same muted "can't be undone" line.
 * The store by the names the SC picked, not the 22-character instance id nobody can check. The
 * data types stay listed in full: a destructive confirmation is the one place the picking should
 * be checkable, by the labels the boxes showed.
 */
function ResetConfirm({ ctx }: { ctx: BodyContext }): React.JSX.Element {
    return (
        <>
            <LeadText>Remove {ctx.displayName}&rsquo;s data from this store?</LeadText>
            <FactList>
                <Fact label="Store">{targetName(ctx)}</Fact>
                {/* Counted as the side panel counts a pack's data, "Data (2)". */}
                <Fact label={`Data (${ctx.selected.length})`}>{ctx.selected.map(dataTypeLabel).join(', ')}</Fact>
            </FactList>
            <Text UNSAFE_className="clear-demo-never">This can&rsquo;t be undone.</Text>
        </>
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
        // in one dry run (owner, 2026-09-20). The form reads from the top; the spinner and
        // a result sit centred. Results take only the room they need, so the form's height
        // is the floor and Back does not leave the form floating in a taller box (owner,
        // 2026-10-31).
        <SteadyHeight align={view === 'form' ? 'start' : 'center'}>
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

                    {view === 'result' && ctx.result ? (
                        <StatusDisplay
                            variant={ctx.result.variant}
                            title={ctx.result.title}
                            message={ctx.result.message}
                            details={ctx.result.details}
                            height="auto"
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
            helperText={
                watching
                    ? 'This can take several minutes. Closing this or stopping the watch continues on the server.'
                    : `The ${noun} continues on the server.`
            }
        />
    );
}
