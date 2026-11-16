/**
 * The run, its own window (step 03, S4; the prototype's `RunWindow`): the install's steps
 * (`ImportRunView`) with the clock under them while it runs, and, once it ends with a problem, each
 * step's final state, the problem on its row and `RunFoot` under them (rules 15, 16). The window is
 * held at its tallest state from the first frame (`reserve`: mid-run and stopped), so it never grows
 * (rule 14). A clean end leaves for the small result instead (rule 17).
 *
 * A switch (S6) draws its Save Your Changes and Uninstall rows before its job is recorded
 * (`switching`), the save's stage on the first while the start waits on it (walk F129), and holds
 * room for them in the reserve. An uninstall (S7) draws its own steps (`uninstallSteps`): Save Your
 * Changes when it saves first, then Uninstall <name>, the row a switch uninstalls with.
 *
 * @module features/data-installer/ui/components/job/DatapackRunWindow
 */

import React, { useState } from 'react';
import { type ImportStep, type StepSource, uninstallSteps } from '../../../importSteps';
import { runStage } from '../../../runStage';
import type { ImportJobRecord } from '../../../types';
import { useImportProgress } from '../../hooks/useImportProgress';
import type { ResultContent } from '../importResult';
import { ImportRunView } from '../ImportRunView';
import {
    endedSteps,
    type Installing,
    liveSteps,
    startingSteps,
    type Uninstalling,
    uninstallEndedSteps,
    uninstallLiveSteps,
    uninstallStartingSteps,
} from './runSteps';
import { questionFrame } from '@/core/ui/components/feedback/OperationProgressBody';
import { StageRows } from '@/core/ui/components/feedback/StageWait';
import { LeadText } from '@/core/ui/components/ui/LeadText';
import type { ActionButton, ModalStatus } from '@/core/ui/components/ui/Modal';
import { StepsWindow } from '@/core/ui/components/ui/StepsDialog';
import { useRunClock } from '@/core/ui/hooks/useRunClock';
import { promptAnswerLabels, promptCloseLabel } from '@/core/ui/utils/promptButtons';
import type { OperationPrompt } from '@/types/webviewPayloads';

/** A question the run is paused on (walk F150), and how to answer it: undefined is dismissed. */
export interface RunQuestion {
    prompt: OperationPrompt;
    answer: (chosen?: string) => void;
}

/**
 * The answers, as the house progress window draws them: the one that continues the work first in
 * the list and drawn last, as every main button is; a "Cancel" among them left out, since the
 * close button says Cancel and answers the same way (`OperationProgressModal`).
 */
function answerButtons({ prompt, answer }: RunQuestion): ActionButton[] {
    return promptAnswerLabels(prompt)
        .map((label, index): ActionButton => ({
            label,
            variant: index === 0 ? 'accent' : 'secondary',
            onPress: () => answer(label),
        }))
        .reverse();
}

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
    /** An uninstall: whether it saves first, the save's stage, and where it saved. */
    uninstalling?: Uninstalling;
    actionButtons: ActionButton[];
    onClose: () => void;
    /** Fix with AI had nothing to fix: the extension's refusal, on the problem line (step-07 P5). */
    problem?: string;
    /**
     * A question the run is paused on: it takes the window over, its title the window's, its
     * sentence the body and its answers the buttons, as in the house progress window. It used to be an
     * untitled notification in the corner, closing itself (walk F150).
     */
    question?: RunQuestion;
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

/** An uninstall's tallest states: mid-way, and stopped, the save above when it saves first. */
function uninstallReserve(name: string, uninstalling: Uninstalling, columns: 1 | 2): React.ReactNode[] {
    const saved = uninstalling.saves ? { savedAs: name } : {};
    return [
        <ImportRunView
            key="mid"
            steps={uninstallSteps({ name, running: true, detail: '1,000 of 1,000', ...saved })}
            columns={columns}
            running={{ startedAt: 0 }}
        />,
        <ImportRunView
            key="stopped"
            steps={uninstallSteps({ name, running: false, ended: 'stopped', reason: 'Stopped', ...saved })}
            columns={columns}
            end={{ lines: [], tookMs: 0 }}
        />,
    ];
}

/**
 * A run under way: the progress window's centred lines, what it is doing now, how far and the clock,
 * moving from step to step (`runStage`). One project's run is the wizard's centred view, never a
 * list of rows (owner, 2026-11-16: rows are for a run over several projects; walk F152 first for a
 * run of one step, `OneRunning` in the projects window for one project). How it ended keeps its rows.
 */
function Running({ steps, startedAt }: { steps: ImportStep[]; startedAt: number }): React.ReactElement {
    const clock = useRunClock(startedAt);
    return (
        <div className="modal-wait modal-wait-progress">
            <StageRows size="L" clock={clock} lines={runStage(steps)} />
        </div>
    );
}

/** The steps while the job runs, from its live progress. */
function LiveRun({
    record,
    name,
    startedAt,
    uninstalling,
}: {
    record: ImportJobRecord;
    name: string;
    startedAt: number;
    uninstalling?: Uninstalling;
}): React.ReactElement {
    const live = useImportProgress(record.activationId);
    const steps = uninstalling
        ? uninstallLiveSteps(record, live, name, uninstalling)
        : liveSteps(record, live, name);
    return <Running steps={steps} startedAt={startedAt} />;
}

/** The step the window is on: ended, running, or starting. */
function RunBody(props: DatapackRunWindowProps & { pressedAt: number }): React.ReactElement {
    const { ended, record, types, installing, columns, opensRunning, pressedAt, switching, uninstalling } =
        props;
    if (ended?.run) {
        const end = {
            ...(ended.lead ? { lead: ended.lead } : {}),
            lines: ended.run.scLines ?? [],
            ...(ended.tookMs === undefined ? {} : { tookMs: ended.tookMs }),
        };
        const { run } = ended;
        const steps = uninstalling
            ? uninstallEndedSteps(run, installing.name, uninstalling)
            : endedSteps(run, installing.name);
        return <ImportRunView steps={steps} columns={columns} end={end} />;
    }
    if (record?.outcome === 'watching') {
        const startedAt = opensRunning ? Date.parse(record.startedAt) : pressedAt;
        return (
            <LiveRun
                record={record}
                name={installing.name}
                startedAt={startedAt}
                {...(uninstalling ? { uninstalling } : {})}
            />
        );
    }
    const steps = uninstalling
        ? uninstallStartingSteps(installing.name, uninstalling)
        : startingSteps(types, installing, switching);
    return <Running steps={steps} startedAt={pressedAt} />;
}

/** The window's icon: a question's, as the progress window draws it (none for a routine step); else the run's. */
function statusFor(status: ModalStatus | undefined, question: RunQuestion | undefined): { status?: ModalStatus } {
    if (question) {
        const asked = questionFrame(question.prompt, '').status;
        return asked ? { status: asked } : {};
    }
    return status ? { status } : {};
}

/** The question's dismiss answer, or Cancel, while asked; Close once ended; else Run in Background. */
function closeLabelFor(ended: boolean, question: RunQuestion | undefined): string {
    if (question) return promptCloseLabel(question.prompt);
    return ended ? 'Close' : 'Run in Background';
}

export function DatapackRunWindow(props: DatapackRunWindowProps): React.ReactElement {
    const { title, status, ended, types, installing, columns, actionButtons, onClose, switching } =
        props;
    const { uninstalling, question } = props;
    // When Install was pressed: one clock from the press to the end.
    const [pressedAt] = useState(() => Date.now());
    // Closing while asked answers it dismissed (Skip for Now), then the window goes as it would.
    const close = (): void => {
        question?.answer(question.prompt.dismiss);
        onClose();
    };
    return (
        <StepsWindow
            title={question?.prompt.title ?? title}
            {...statusFor(status, question)}
            reserve={
                uninstalling
                    ? uninstallReserve(installing.name, uninstalling, columns)
                    : runReserve(types, installing, columns, switching?.replaces)
            }
            // Run in Background while it runs: closing hands the job over, it stops nothing.
            closeLabel={closeLabelFor(Boolean(ended), question)}
            actionButtons={question ? answerButtons(question) : actionButtons}
            onClose={close}
        >
            {question ? <LeadText>{question.prompt.message}</LeadText> : <RunBody {...props} pressedAt={pressedAt} />}
            {props.problem ? <p className="dialog-problem text-notice">{props.problem}</p> : null}
        </StepsWindow>
    );
}
