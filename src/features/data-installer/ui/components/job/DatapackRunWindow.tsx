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
import { type ImportStep, type StepSource } from '../../../importSteps';
import { FINISHING, REPLACING, SAVING } from '../../../runRows';
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
import { runStage } from '@/core/utils/runStage';
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

/**
 * The window's height: the centred lines, all three held (owner walk, 2026-11-16: the window kept the
 * height of the old list of rows, so the centred view and a question floated in a tall box). A run
 * that stops shows its rows, a new step at its own height.
 */
const RUN_RESERVE: React.ReactNode[] = [
    <div key="run" className="modal-wait modal-wait-progress">
        <StageRows hold clock="1 minute, 30 seconds" lines={{ label: 'Uninstalling from Commerce', detail: 'Products, 1,000 of 1,000' }} />
    </div>,
];

/** Each step's job, line 1 of the centred lines (owner, 2026-11-16): the part under way is line 2. */
const STEP_JOBS: Record<string, string> = {
    [SAVING]: 'Saving Your Changes',
    [REPLACING]: 'Uninstalling from Commerce',
    uninstall: 'Uninstalling from Commerce',
    [FINISHING]: 'Verifying Installation',
};

/** Line 1 for a step: its job; Install's says whether it installs or updates. */
function stepJob(step: ImportStep): string | undefined {
    if (step.kind === 'install') return 'Installing in Commerce';
    return STEP_JOBS[step.kind];
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
            <StageRows hold clock={clock} lines={runStage(steps, stepJob)} />
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
    const { title, status, ended, actionButtons, onClose, question } = props;
    // When Install was pressed: one clock from the press to the end.
    const [pressedAt] = useState(() => Date.now());
    // While asked, a dismiss answer (Skip for Now) is an answer: the run goes on in the window to
    // its result (owner walk, 2026-11-16: it closed the window and sent the install to the
    // background). A question with none is dismissed as Cancel, and the window goes as it would.
    const close = (): void => {
        if (question) question.answer(question.prompt.dismiss);
        if (!question?.prompt.dismiss) onClose();
    };
    return (
        <StepsWindow
            title={question?.prompt.title ?? title}
            {...statusFor(status, question)}
            reserve={RUN_RESERVE}
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
