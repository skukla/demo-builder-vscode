/**
 * A datapack job's window host (step 03, S4): ONE `DialogContainer`, and in it the one window the
 * job's phase is on (`datapackJob.ts`), each a shared layout. It picks windows and nothing more:
 * the requests and the events they send are `useDatapackJob`'s, the bodies are each window's.
 *
 *   check, summary, dry wait → `JobSummaryWindow`   records → `RecordsWindow`
 *   dry result → `DryRunWindow`   run, an end with a problem → `DatapackRunWindow`
 *   a clean end, a start that never ran, no instance → `JobResultWindow`
 *
 * Serves a first install of a pack the project does not hold, and a job already running when it
 * opened (Undo, Restore, an agent's), titled by what that job is for (`jobWords`). Closing a job
 * still running hands it to a progress notification, as every progress window does: nothing is
 * cancelled, since there is nothing to cancel with.
 *
 * @module features/data-installer/ui/components/job/DatapackJobWindow
 */

import { DialogContainer } from '@adobe/react-spectrum';
import React from 'react';
import { installTitle, jobPurpose, jobWords } from '../../../datapackWords';
import { useDatapackJob, type DatapackJob } from '../../hooks/useDatapackJob';
import { useRunColumns } from '../../hooks/useRunColumns';
import { useVersionTypes } from '../../hooks/useVersionTypes';
import { backgroundTitle } from '../importModalJob';
import { type ResultContent, resultStatus } from '../importResult';
import { DatapackRunWindow } from './DatapackRunWindow';
import { DryRunWindow } from './DryRunWindow';
import { JobResultWindow } from './JobResultWindow';
import { JobSummaryWindow } from './JobSummaryWindow';
import { RecordsWindow } from './RecordsWindow';
import type { ActionButton } from '@/core/ui/components/ui/Modal';
import { webviewClient } from '@/core/ui/utils/WebviewClient';
import { DATAPACK_OPERATION_ID } from '@/core/utils/operationIds';
import { WAIT_STAGES } from '@/core/utils/waitStages';
import type { DatapackId, DatapackStoreName } from '@/types/datapack';

export interface DatapackJobWindowProps {
    id: DatapackId;
    displayName: string;
    /** The data types the version holds, when the opener read them; else read here. */
    types?: string[];
    source?: DatapackStoreName;
    /** An install starts at its check; a job already running at its run. */
    startsAt: 'check' | 'run';
    onClose: () => void;
}

const NO_INSTANCE: ResultContent = {
    variant: 'warning',
    title: 'No Commerce Instance',
    message: 'Connect Commerce on the project dashboard first.',
};
const NO_RECORDS: Record<string, string[]> = {};

/** An end's one action beside Close (rule 16): Retry, or Fix with AI. Retry only on this window's own install. */
function endButtons(job: DatapackJob, result: ResultContent): ActionButton[] {
    if (result.action === 'retry' && job.state.kind === 'install')
        return [{ label: 'Retry', variant: 'accent', onPress: job.retry }];
    if (result.action === 'fix')
        return [
            {
                label: 'Fix with AI',
                variant: 'accent',
                onPress: job.fixWithAi,
                hint: 'Opens your AI assistant on this problem',
            },
        ];
    return [];
}

/** The run's title: the end's once it ended with a problem, else what the job watched is for. */
function runTitle(job: DatapackJob, name: string): string {
    if (job.result?.run) return job.result.title;
    return jobWords(job.record?.outcome === 'watching' ? jobPurpose(job.record) : 'install', name)
        .running;
}

/** The summary window: the check's wait, the type table, a Dry Run's wait. */
function SummaryPhase({ job, title, onClose }: { job: DatapackJob; title: string; onClose: () => void }): React.ReactElement {
    const { phase } = job.state;
    const waits = phase === 'check' || phase === 'dry-wait';
    const waiting = phase === 'dry-wait' ? WAIT_STAGES.checkingImport : WAIT_STAGES.readingWhatToSelect;
    return (
        <JobSummaryWindow
            title={title}
            rows={job.rows}
            checkFailed={job.checkFailed}
            ready={phase !== 'check'}
            waiting={waits ? waiting : false}
            onReview={job.review}
            onDryRun={job.dryRun}
            onInstall={job.install}
            onClose={onClose}
        />
    );
}

/** The run window: running, or ended with a problem on its steps. A Retry is a new run, a new clock. */
function RunPhase({ job, run, onClose }: { job: DatapackJob; run: { name: string; version: string; types: string[]; columns: 1 | 2 }; onClose: () => void }): React.ReactElement {
    const ended = job.state.phase === 'ended' ? job.result : null;
    return (
        <DatapackRunWindow
            key={`run-${job.retries}`}
            title={runTitle(job, run.name)}
            {...(ended ? { status: resultStatus(ended) } : {})}
            record={job.record}
            ended={ended}
            types={run.types}
            installing={{ name: run.name, version: run.version }}
            columns={run.columns}
            opensRunning={job.state.kind === 'watch'}
            actionButtons={ended ? endButtons(job, ended) : []}
            onClose={onClose}
        />
    );
}

export function DatapackJobWindow({
    id,
    displayName,
    types: given,
    source,
    startsAt,
    onClose,
}: DatapackJobWindowProps): React.ReactElement {
    const { types, reading } = useVersionTypes(id, source, given);
    const columns = useRunColumns(types.length);
    const kind = startsAt === 'check' ? 'install' : 'watch';
    const job = useDatapackJob({ id, displayName, source, types, readingTypes: reading, kind });
    const { phase } = job.state;
    const title = installTitle(displayName);

    const close = (): void => {
        if (phase === 'run' && (job.running || job.starting)) {
            webviewClient.postMessage('backgroundOperation', {
                id: DATAPACK_OPERATION_ID,
                title: backgroundTitle(job.record?.operation === 'reset', displayName),
            });
        }
        onClose();
    };

    const windowFor = (): React.ReactElement => {
        if (phase === 'records') {
            const records = job.recordsReading ? NO_RECORDS : job.records;
            return (
                <RecordsWindow
                    title={title}
                    rows={job.rows}
                    records={records}
                    reading={job.recordsReading}
                    onBack={job.back}
                    onClose={close}
                />
            );
        }
        if (phase === 'dry-result' && job.result) {
            return (
                <DryRunWindow
                    result={job.result}
                    onBack={job.back}
                    onInstall={job.install}
                    onRetry={job.dryRun}
                    onClose={close}
                />
            );
        }
        if (phase === 'no-instance')
            return <JobResultWindow result={NO_INSTANCE} onClose={close} />;
        if ((phase === 'done' || phase === 'ended') && job.result && !job.result.run) {
            const back: ActionButton[] =
                phase === 'ended' && kind === 'install'
                    ? [{ label: 'Back', variant: 'secondary', onPress: job.back }]
                    : [];
            return (
                <JobResultWindow
                    key={phase}
                    result={job.result}
                    actionButtons={[...back, ...endButtons(job, job.result)]}
                    onClose={close}
                />
            );
        }
        if (phase === 'run' || phase === 'ended') {
            const run = { name: displayName, version: id.version, types, columns };
            return <RunPhase job={job} run={run} onClose={close} />;
        }
        return <SummaryPhase job={job} title={title} onClose={close} />;
    };

    return <DialogContainer onDismiss={close}>{windowFor()}</DialogContainer>;
}
