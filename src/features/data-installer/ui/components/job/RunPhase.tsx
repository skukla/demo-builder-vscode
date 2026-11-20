/**
 * A datapack job's run phase (step 03, S4, S6 and S7): running, then how it ended, in the same window
 * at the same size (owner, 2026-11-17, walk F222), in `DatapackRunWindow`, with a switch's and an
 * uninstall's own rows. Split out of
 * `DatapackJobWindow`, which picks it.
 *
 * @module features/data-installer/ui/components/job/RunPhase
 */

import React, { useCallback } from 'react';
import { jobWords } from '../../../datapackWords';
import type { DatapackJob } from '../../hooks/useDatapackJob';
import { DatapackRunWindow } from './DatapackRunWindow';
import { type Opened, runningPurpose } from './jobOpened';
import { useKeptRootButtons } from './JobResultWindow';
import { backButtons, endButtons } from './ResultPhase';
import type { Uninstalling } from './runSteps';
import { useOperationProgress } from '@/core/ui/hooks/useOperationProgress';
import { webviewClient } from '@/core/ui/utils/WebviewClient';
import { DATAPACK_OPERATION_ID } from '@/core/utils/operationIds';

/** What the run window draws: the pack's steps' name and version, its types, its columns. */
export interface RunShape {
    name: string;
    version: string;
    types: string[];
    columns: 1 | 2;
}

/** The run's title: the datapack once it ended (walk F222), else what the job watched is for. */
function runTitle(job: DatapackJob, opened: Opened, ended: boolean): string {
    if (ended) return job.result?.thing ?? opened.name;
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

/** The run window: running, then its end. A Retry is a new run, a new clock. */
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
    const { phase, kind } = job.state;
    const ended = phase === 'ended' || phase === 'done' ? job.result : null;
    const admin = useKeptRootButtons(ended, ended?.keptRoot && kind === 'uninstall' ? job.retry : undefined);
    // The question the job is paused on, pushed on the datapack channel (walk F150).
    const progress = useOperationProgress(DATAPACK_OPERATION_ID, job.retries, job.state.kind === 'watch');
    const prompt = !ended && progress?.state === 'running' ? progress.prompt : undefined;
    const answer = useCallback((chosen?: string): void => {
        webviewClient.postMessage('answerOperationPrompt', { id: DATAPACK_OPERATION_ID, answer: chosen, values: {} });
    }, []);
    const switching = switchRows(job);
    const uninstalling = uninstallRows(job);
    return (
        <DatapackRunWindow
            key={`run-${job.retries}`}
            title={runTitle(job, opened, Boolean(ended))}
            record={job.record}
            ended={ended}
            types={run.types}
            installing={{ name: run.name, version: run.version }}
            columns={run.columns}
            opensRunning={job.state.kind === 'watch'}
            {...(switching ? { switching } : {})}
            {...(uninstalling ? { uninstalling } : {})}
            actionButtons={ended ? [...admin, ...(ended.run ? [] : backButtons(job)), ...endButtons(job, ended)] : []}
            onClose={onClose}
            {...(job.fixProblem ? { problem: job.fixProblem } : {})}
            {...(prompt ? { question: { prompt, answer } } : {})}
        />
    );
}
