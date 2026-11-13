/**
 * The run, its own window (step 03, S4; the prototype's `RunWindow`): the install's steps
 * (`ImportRunView`) with the clock under them while it runs, and, once it ends with a problem, each
 * step's final state, the problem on its row and `RunFoot` under them (rules 15, 16). The window is
 * held at its tallest state from the first frame (`reserve`: mid-run and stopped), so it never grows
 * (rule 14). A clean end leaves for the small result instead (rule 17).
 *
 * A switch (S6) draws its Save Your Changes and Uninstall rows before its job is recorded
 * (`switching`), the save's stage on the first while the start waits on it (walk F129), and holds
 * room for them in the reserve.
 *
 * @module features/data-installer/ui/components/job/DatapackRunWindow
 */

import React, { useState } from 'react';
import type { StepSource } from '../../../importSteps';
import type { ImportJobRecord } from '../../../types';
import { useImportProgress } from '../../hooks/useImportProgress';
import type { ResultContent } from '../importResult';
import { ImportRunView } from '../ImportRunView';
import { endedSteps, type Installing, liveSteps, startingSteps } from './runSteps';
import type { ActionButton, ModalStatus } from '@/core/ui/components/ui/Modal';
import { StepsWindow } from '@/core/ui/components/ui/StepsDialog';

export interface DatapackRunWindowProps {
    title: string;
    status?: ModalStatus;
    /** The job watched, once recorded, while it runs. */
    record: ImportJobRecord | null;
    /** An end with a problem, drawn on its steps. */
    ended: ResultContent | null;
    /** The whole pack's data types, for the steps before the job is recorded. */
    types: string[];
    installing: Installing;
    columns: 1 | 2;
    /** Opened on a job already running: its clock starts when the job did, not when the window opened. */
    opensRunning: boolean;
    /** A switch: the datapack it uninstalls, and the save's stage while the start waits on it. */
    switching?: Pick<StepSource, 'replaces' | 'savingStage'>;
    actionButtons: ActionButton[];
    onClose: () => void;
}

/** A record shaped for the reserve: no job, only the steps' tallest states. */
function reserveRecord(
    types: string[],
    version: string,
    over: Partial<ImportJobRecord>,
): ImportJobRecord {
    return {
        activationId: '',
        datapackName: '',
        version,
        commerceInstance: '',
        startedAt: '',
        outcome: 'error',
        dataTypes: types,
        perType: {},
        ...over,
    };
}

/** The run's tallest states, drawn hidden so the window opens at their height: mid-run, and stopped. */
function runReserve(
    types: string[],
    installing: Installing,
    columns: 1 | 2,
    replaces?: string,
): React.ReactNode[] {
    const first = types[0] ?? '';
    const last = types[types.length - 1] ?? '';
    // A switch's rows above Install: saved, and the datapack it uninstalls.
    const switched = replaces ? { replaces, savedAs: replaces, replacing: 'success' as const } : {};
    const mid = reserveRecord(types, installing.version, {
        ...switched,
        outcome: 'watching',
        perType: { [first]: 'processing' },
        detail: '1,000 of 1,000',
    });
    const stopped = reserveRecord(types, installing.version, {
        ...switched,
        perType: Object.fromEntries(types.map((t) => [t, 'error' as const])),
        stoppedAt: last,
        reason: 'Stopped',
    });
    return [
        <ImportRunView
            key="mid"
            steps={liveSteps(mid, null, installing.name)}
            columns={columns}
            running={{ startedAt: 0 }}
        />,
        <ImportRunView
            key="stopped"
            steps={endedSteps(stopped, installing.name)}
            columns={columns}
            end={{ lines: [], tookMs: 0 }}
        />,
    ];
}

/** The steps while the job runs, from its live progress. */
function LiveRun({
    record,
    columns,
    name,
    startedAt,
}: {
    record: ImportJobRecord;
    columns: 1 | 2;
    name: string;
    startedAt: number;
}): React.ReactElement {
    const live = useImportProgress(record.activationId);
    return (
        <ImportRunView
            steps={liveSteps(record, live, name)}
            columns={columns}
            running={{ startedAt }}
        />
    );
}

/** The step the window is on: ended, running, or starting. */
function RunBody(props: DatapackRunWindowProps & { pressedAt: number }): React.ReactElement {
    const { ended, record, types, installing, columns, opensRunning, pressedAt, switching } = props;
    if (ended?.run) {
        const end = {
            ...(ended.lead ? { lead: ended.lead } : {}),
            lines: ended.run.scLines ?? [],
            ...(ended.tookMs === undefined ? {} : { tookMs: ended.tookMs }),
        };
        return (
            <ImportRunView
                steps={endedSteps(ended.run, installing.name)}
                columns={columns}
                end={end}
            />
        );
    }
    if (record?.outcome === 'watching') {
        const startedAt = opensRunning ? Date.parse(record.startedAt) : pressedAt;
        return (
            <LiveRun
                record={record}
                columns={columns}
                name={installing.name}
                startedAt={startedAt}
            />
        );
    }
    return (
        <ImportRunView
            steps={startingSteps(types, installing, switching)}
            columns={columns}
            running={{ startedAt: pressedAt }}
        />
    );
}

export function DatapackRunWindow(props: DatapackRunWindowProps): React.ReactElement {
    const { title, status, ended, types, installing, columns, actionButtons, onClose, switching } =
        props;
    // When Install was pressed: one clock from the press to the end.
    const [pressedAt] = useState(() => Date.now());
    return (
        <StepsWindow
            title={title}
            {...(status ? { status } : {})}
            reserve={runReserve(types, installing, columns, switching?.replaces)}
            // Run in Background while it runs: closing hands the job over, it stops nothing.
            closeLabel={ended ? 'Close' : 'Run in Background'}
            actionButtons={actionButtons}
            onClose={onClose}
        >
            <RunBody {...props} pressedAt={pressedAt} />
        </StepsWindow>
    );
}
