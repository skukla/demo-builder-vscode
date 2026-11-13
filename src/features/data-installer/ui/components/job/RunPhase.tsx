/**
 * A datapack job's run phase (step 03, S4, S6 and S7): running, or ended with a problem, on its steps
 * in `DatapackRunWindow`, with a switch's and an uninstall's own rows. Split out of
 * `DatapackJobWindow`, which picks it.
 *
 * @module features/data-installer/ui/components/job/RunPhase
 */

import React from 'react';
import { jobWords } from '../../../datapackWords';
import type { DatapackJob } from '../../hooks/useDatapackJob';
import { resultStatus } from '../importResult';
import { DatapackRunWindow } from './DatapackRunWindow';
import { type Opened, runningPurpose } from './jobOpened';
import { endButtons } from './ResultPhase';
import type { Uninstalling } from './runSteps';

/** What the run window draws: the pack's steps' name and version, its types, its columns. */
export interface RunShape {
    name: string;
    version: string;
    types: string[];
    columns: 1 | 2;
}

/** The run's title: the end's once it ended with a problem, else what the job watched is for. */
function runTitle(job: DatapackJob, opened: Opened): string {
    if (job.result?.run) return job.result.title;
    return jobWords(runningPurpose(job, opened), opened.name).running;
}

/** A switch's rows before its job is recorded: the datapack it uninstalls, and the save's stage. */
function switchRows(job: DatapackJob): { replaces: string; savingStage?: string } | undefined {
    const { heldName, savingStage } = job.switching;
    if (job.state.kind !== 'switch' || !heldName) return undefined;
    return { replaces: heldName, ...(savingStage ? { savingStage } : {}) };
}

/** An uninstall's steps before and while its job runs: whether it saves first, its stage, where to. */
function uninstallRows(job: DatapackJob): Uninstalling | undefined {
    if (job.state.kind !== 'uninstall') return undefined;
    const { savingStage, savedTo } = job.switching;
    return {
        saves: savedTo !== undefined,
        ...(savingStage ? { savingStage } : {}),
        ...(savedTo ? { savedTo } : {}),
    };
}

/** The run window: running, or ended with a problem on its steps. A Retry is a new run, a new clock. */
export function RunPhase({
    job,
    run,
    opened,
    onClose,
}: {
    job: DatapackJob;
    run: RunShape;
    opened: Opened;
    onClose: () => void;
}): React.ReactElement {
    const ended = job.state.phase === 'ended' ? job.result : null;
    const switching = switchRows(job);
    const uninstalling = uninstallRows(job);
    return (
        <DatapackRunWindow
            key={`run-${job.retries}`}
            title={runTitle(job, opened)}
            {...(ended ? { status: resultStatus(ended) } : {})}
            record={job.record}
            ended={ended}
            types={run.types}
            installing={{ name: run.name, version: run.version }}
            columns={run.columns}
            opensRunning={job.state.kind === 'watch'}
            {...(switching ? { switching } : {})}
            {...(uninstalling ? { uninstalling } : {})}
            actionButtons={ended ? endButtons(job, ended) : []}
            onClose={onClose}
        />
    );
}
