/**
 * A datapack job's window host (step 03, S4 and S6): ONE `DialogContainer`, and in it the one window
 * the job's phase is on (`datapackJob.ts`), each a shared layout. It picks windows and nothing more:
 * the requests and the events they send are `useDatapackJob`'s, the bodies are each window's.
 *
 *   check, summary, dry wait → `JobSummaryWindow`   records → `RecordsWindow`
 *   dry result → `DryRunWindow`   save question → `SaveFirstWindow`
 *   run, an end with a problem → `DatapackRunWindow`
 *   a clean end, a start that never ran, no instance → `JobResultWindow`
 *
 * Serves a first install of a pack the project does not hold, a switch over the datapack it holds
 * ("Switch to Bodea?", then "Save Your Changes First?" when it has changes; decisions J2-3, J8-1),
 * and a job already running when it opened (Undo, Restore, an agent's), titled by what that job is
 * for (`jobWords`). Closing a job still running hands it to a progress notification, as every
 * progress window does: nothing is cancelled, since there is nothing to cancel with.
 *
 * @module features/data-installer/ui/components/job/DatapackJobWindow
 */

import { DialogContainer } from '@adobe/react-spectrum';
import React from 'react';
import {
    DRY_RUN,
    FIX_WITH_AI,
    FIX_WITH_AI_HINT,
    INSTALL,
    installTitle,
    jobPurpose,
    jobWords,
} from '../../../datapackWords';
import { useDatapackJob, type DatapackJob } from '../../hooks/useDatapackJob';
import { useRunColumns } from '../../hooks/useRunColumns';
import { useVersionTypes } from '../../hooks/useVersionTypes';
import { backgroundTitle } from '../importModalJob';
import { type ResultContent, resultStatus } from '../importResult';
import type { JobKind } from './datapackJob';
import { DatapackRunWindow } from './DatapackRunWindow';
import { DryRunWindow } from './DryRunWindow';
import { JobResultWindow } from './JobResultWindow';
import { JobSummaryWindow } from './JobSummaryWindow';
import { RecordsWindow } from './RecordsWindow';
import { SaveFirstWindow } from './SaveFirstWindow';
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
    /** A switch over the datapack the project holds (S6): the SC's own datapacks' names. */
    switching?: { ownNames: string[] };
    onClose: () => void;
}

const NO_INSTANCE: ResultContent = {
    variant: 'warning',
    title: 'No Commerce Instance',
    message: 'Connect Commerce on the project dashboard first.',
};
const NO_RECORDS: Record<string, string[]> = {};
const NO_NAMES: string[] = [];
const CHANGES_UNCHECKED = "Your changes couldn't be checked.";
const PREVIEW_UNREAD = "What installing would change couldn't be read.";

/** What the window was opened for. */
function kindOf(startsAt: 'check' | 'run', switching: boolean): JobKind {
    if (startsAt === 'run') return 'watch';
    return switching ? 'switch' : 'install';
}

/** An end's one action beside Close (rule 16): Retry, or Fix with AI. Retry only on this window's own install. */
function endButtons(job: DatapackJob, result: ResultContent): ActionButton[] {
    if (result.action === 'retry' && job.state.kind === 'install')
        return [{ label: 'Retry', variant: 'accent', onPress: job.retry }];
    if (result.action === 'fix')
        return [
            { label: FIX_WITH_AI, variant: 'accent', onPress: job.fixWithAi, hint: FIX_WITH_AI_HINT },
        ];
    return [];
}

/** What the run is for before its record says: a switch, else an install. */
const startedAs = (job: DatapackJob) => (job.state.kind === 'switch' ? 'switch' : 'install');

/** The run's title: the end's once it ended with a problem, else what the job watched is for. */
function runTitle(job: DatapackJob, name: string): string {
    if (job.result?.run) return job.result.title;
    const purpose = job.record?.outcome === 'watching' ? jobPurpose(job.record) : startedAs(job);
    return jobWords(purpose, name).running;
}

/** A switch's problem line: the changes unchecked first, since they decide the save question. */
function switchProblem(changesFailed: boolean, previewFailed: boolean): string | undefined {
    if (changesFailed) return CHANGES_UNCHECKED;
    return previewFailed ? PREVIEW_UNREAD : undefined;
}

/** The summary's frame: Install's, or a switch's question (no opening line, a blue Switch). */
function summaryFrame(job: DatapackJob, name: string, checking: boolean) {
    if (job.state.kind !== 'switch') {
        return {
            title: installTitle(name),
            actionButtons: [
                { label: DRY_RUN, variant: 'secondary' as const, onPress: job.dryRun },
                { label: INSTALL, variant: 'accent' as const, onPress: job.install },
            ],
            problem: job.checkFailed ? PREVIEW_UNREAD : undefined,
        };
    }
    const { changes } = job.switching;
    return {
        title: checking ? `Switch to ${name}` : `Switch to ${name}?`,
        status: 'warning' as const,
        actionButtons: [{ label: 'Switch', variant: 'accent' as const, onPress: job.switching.press }],
        problem: switchProblem(changes.readFailed, job.checkFailed),
    };
}

/** The wait the summary shows: the check's, or a Dry Run's. */
function summaryWait(job: DatapackJob) {
    const { phase, kind } = job.state;
    if (phase === 'dry-wait') return WAIT_STAGES.checkingImport;
    if (phase !== 'check') return false;
    return kind === 'switch' ? WAIT_STAGES.checkingForChanges : WAIT_STAGES.readingWhatToSelect;
}

/** The summary window: the check's wait, the type table, a Dry Run's wait. */
function SummaryPhase({ job, name, onClose }: { job: DatapackJob; name: string; onClose: () => void }): React.ReactElement {
    const checking = job.state.phase === 'check';
    const { problem, ...frame } = summaryFrame(job, name, checking);
    return (
        <JobSummaryWindow
            {...frame}
            rows={job.rows}
            {...(problem ? { problem } : {})}
            ready={!checking}
            waiting={summaryWait(job)}
            onReview={job.review}
            onClose={onClose}
        />
    );
}

/** A switch's rows before its job is recorded: the datapack it uninstalls, and the save's stage. */
function switchRows(job: DatapackJob): { replaces: string; savingStage?: string } | undefined {
    const { heldName, savingStage } = job.switching;
    if (job.state.kind !== 'switch' || !heldName) return undefined;
    return { replaces: heldName, ...(savingStage ? { savingStage } : {}) };
}

/** The run window: running, or ended with a problem on its steps. A Retry is a new run, a new clock. */
function RunPhase({ job, run, onClose }: { job: DatapackJob; run: { name: string; version: string; types: string[]; columns: 1 | 2 }; onClose: () => void }): React.ReactElement {
    const ended = job.state.phase === 'ended' ? job.result : null;
    const switching = switchRows(job);
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
            {...(switching ? { switching } : {})}
            actionButtons={ended ? endButtons(job, ended) : []}
            onClose={onClose}
        />
    );
}

/** A result in the small window: a clean end, a start that never ran; Back after an own start. */
function ResultPhase({ job, result, onClose }: { job: DatapackJob; result: ResultContent; onClose: () => void }): React.ReactElement {
    const { phase, kind } = job.state;
    const back: ActionButton[] =
        phase === 'ended' && kind !== 'watch'
            ? [{ label: 'Back', variant: 'secondary', onPress: job.back }]
            : [];
    return (
        <JobResultWindow
            key={phase}
            result={result}
            actionButtons={[...back, ...endButtons(job, result)]}
            onClose={onClose}
        />
    );
}

/** The windows that leave the summary and come back: Review Records, a Dry Run's answer, the save question. */
function asideWindow(job: DatapackJob, name: string, close: () => void): React.ReactElement | null {
    const { phase } = job.state;
    if (phase === 'records') {
        const records = job.recordsReading ? NO_RECORDS : job.records;
        const title = job.state.kind === 'switch' ? `Switch to ${name}?` : installTitle(name);
        return <RecordsWindow title={title} rows={job.rows} records={records} reading={job.recordsReading} onBack={job.back} onClose={close} />;
    }
    if (phase === 'dry-result' && job.result) {
        return <DryRunWindow result={job.result} onBack={job.back} onInstall={job.install} onRetry={job.dryRun} onFix={job.fixDryRun} onClose={close} />;
    }
    if (phase === 'save-first') {
        const { changes, answer } = job.switching;
        return (
            <SaveFirstWindow
                verb="Switch"
                rows={changes.rows}
                readFailed={changes.readFailed}
                {...(changes.saveAs ? { saveAs: changes.saveAs } : {})}
                onAnswer={answer}
                onClose={close}
            />
        );
    }
    return null;
}

/** The one window the job's phase is on. */
function windowFor(job: DatapackJob, run: { name: string; version: string; types: string[]; columns: 1 | 2 }, close: () => void): React.ReactElement {
    const { phase } = job.state;
    const aside = asideWindow(job, run.name, close);
    if (aside) return aside;
    if (phase === 'no-instance') return <JobResultWindow result={NO_INSTANCE} onClose={close} />;
    if ((phase === 'done' || phase === 'ended') && job.result && !job.result.run)
        return <ResultPhase job={job} result={job.result} onClose={close} />;
    if (phase === 'run' || phase === 'ended') return <RunPhase job={job} run={run} onClose={close} />;
    return <SummaryPhase job={job} name={run.name} onClose={close} />;
}

export function DatapackJobWindow({
    id,
    displayName,
    types: given,
    source,
    startsAt,
    switching,
    onClose,
}: DatapackJobWindowProps): React.ReactElement {
    const { types, reading } = useVersionTypes(id, source, given);
    const columns = useRunColumns(types.length);
    const kind = kindOf(startsAt, switching !== undefined);
    const ownNames = switching?.ownNames ?? NO_NAMES;
    const job = useDatapackJob({ id, displayName, source, types, readingTypes: reading, kind, ownNames });

    const close = (): void => {
        if (job.state.phase === 'run' && (job.running || job.starting)) {
            const title =
                kind === 'switch'
                    ? jobWords('switch', displayName).running
                    : backgroundTitle(job.record?.operation === 'reset', displayName);
            webviewClient.postMessage('backgroundOperation', { id: DATAPACK_OPERATION_ID, title });
        }
        onClose();
    };

    const run = { name: displayName, version: id.version, types, columns };
    return <DialogContainer onDismiss={close}>{windowFor(job, run, close)}</DialogContainer>;
}
