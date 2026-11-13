/**
 * ProjectsBatchModal — the one window behind Reset Selected and Delete Selected on the projects
 * list (owner, 2026-11-04), built as the Updates window is: the house `ui/Modal` in a
 * `DialogContainer`, the controls handed in (`useProjectsBatch`).
 *
 * Reading and the questions are one Steps window (`StepsWindow`, step-05 S3): while the read is out
 * it is unseen and only its wait shows, where it will open, "Reading demo data" for a reset and
 * "Reading projects" for a delete (`WAIT_STAGES`). It is first seen once the read answers, at the
 * questions' height, and keeps it (rule 14: it opened at the wait's height and grew, decisions
 * Open). The run and a failed read are windows of their own.
 * The questions: `BatchDeleteQuestions` or `BatchResetQuestions`, Cancel and the red button. When a
 * pack whose data goes has changes, the red button runs into "Save Your Changes First?" in the same
 * container (step-05 S1, decisions J7-2): the shared `SaveFirstWindow` over `BatchSaveTable`, Reset
 * or Delete Without Saving, Cancel (which closes everything), and Save and Reset or Save and Delete.
 * Only those two, or the red button when nothing is asked, start the run.
 * The run: `ProjectsBatchRunView`, closed into the background while it goes, its end
 * the title with its status icon, as the Updates run ends. A run where every project went through
 * hands off to the small result, the title alone; one with a problem stays on its rows (owner,
 * 2026-11-10, walk F134).
 *
 * @module features/projects-dashboard/ui/components/ProjectsBatchModal
 */

import { DialogContainer } from '@adobe/react-spectrum';
import React from 'react';
import { saveQuestionOf, type SaveQuestion } from '../batchChoices';
import { batchSubject, confirmTitle, endTitle, runLabel, runningTitle, type BatchSubject } from '../batchWords';
import type { BatchView, ProjectsBatchControls } from '../hooks/useProjectsBatch';
import { BatchDeleteQuestions } from './BatchDeleteQuestions';
import { BatchResetQuestions } from './BatchResetQuestions';
import { BatchSaveTable } from './BatchSaveTable';
import { ProjectsBatchRunView } from './ProjectsBatchRunView';
import { endingRowOf, promptButtons } from './runWindowParts';
import { OperationQuestion, questionTakesWindow } from '@/core/ui/components/feedback/OperationQuestion';
import { SaveFirstWindow } from '@/core/ui/components/feedback/SaveFirstWindow';
import type { WaitLines } from '@/core/ui/components/feedback/StageWait';
import { Modal, type ActionButton, type ModalStatus } from '@/core/ui/components/ui/Modal';
import { StepsWindow } from '@/core/ui/components/ui/StepsDialog';
import { endsSmall } from '@/core/ui/utils/runEnding';
import { webviewClient } from '@/core/ui/utils/WebviewClient';
import { WAIT_STAGES } from '@/core/utils/waitStages';
import type { ProjectsBatchAction } from '@/types/projectsBatch';
import type { OperationPrompt } from '@/types/webviewPayloads';

const NO_ACTIONS: ActionButton[] = [];

/** The question the run is paused on, while it is. A task's heading is the window's title. */
function askingOf(controls: ProjectsBatchControls): OperationPrompt | undefined {
    const { view, progress } = controls;
    if (view.phase !== 'running' || progress?.state !== 'running') return undefined;
    return progress.prompt;
}

/**
 * Whether the dismiss is Cancel. A question with fields (a sign-in) has no answer that does not go
 * on, so Cancel is its way out: that project stops and the rest go on. One with only buttons
 * answers with them, its safe one among them (the Updates run's rule, 2026-10-21).
 */
function cancels(prompt: OperationPrompt): boolean {
    return Boolean(prompt.fields?.length);
}

/** The action, how many projects it is on and the name when one, whatever the phase. */
function subjectOf(view: Exclude<BatchView, { phase: 'closed' }>): BatchSubject {
    if (view.phase === 'reading') return batchSubject(view.action, view.names);
    if (view.phase === 'unread') return batchSubject(view.action, []);
    if (view.phase === 'asking') return batchSubject(view.questions.action, view.questions.rows.map((row) => row.name));
    return batchSubject(view.action, view.rows.map((row) => row.name));
}

/**
 * Whether the run ended cleanly, by the shared rule (`endsSmall`): it succeeded with no warning and
 * every project is done with nothing to read under it. Only then does the window leave its rows for
 * the small result (walk F134).
 */
export function endedClean(controls: Pick<ProjectsBatchControls, 'view' | 'progress' | 'statuses'>): boolean {
    const { view, progress, statuses } = controls;
    if (view.phase !== 'running') return false;
    const rows = view.rows.map((row) => endingRowOf(statuses[row.path]));
    return endsSmall({ succeeded: progress?.state === 'succeeded', warning: progress?.warning, rows });
}

/** The save question over the questions as answered; absent outside them. */
function saveQuestionOfView(controls: ProjectsBatchControls): SaveQuestion | undefined {
    const { view, choices } = controls;
    return view.phase === 'asking' ? saveQuestionOf(view.questions, choices) : undefined;
}

/**
 * The window's header in every phase (`batchWords`): several projects by kind, a confirm adding the
 * button's count (owner, 2026-11-05); one project by its name (J7-1). Some failing is said by the
 * amber icon, the rows by their own.
 */
function titleOf(controls: ProjectsBatchControls): string {
    const { view, progress } = controls;
    if (view.phase === 'closed') return '';
    if (view.phase === 'unread') return "Couldn't Read Projects";
    const subject = subjectOf(view);
    if (view.phase !== 'running') return confirmTitle(subject);
    if (progress?.state === 'succeeded' || progress?.state === 'failed') {
        return endTitle(subject, progress.state === 'failed' || Boolean(progress.warning));
    }
    return askingOf(controls)?.title ?? runningTitle(subject);
}

function statusOf(controls: ProjectsBatchControls): ModalStatus | undefined {
    const { view, progress } = controls;
    if (view.phase === 'unread' || (view.phase === 'running' && progress?.state === 'failed')) return 'error';
    if (askingOf(controls)?.title) return 'warning';
    // Both confirms are dangerous: amber, as the dialog rules have it.
    if (view.phase === 'asking') return 'warning';
    if (view.phase !== 'running' || progress?.state !== 'succeeded') return undefined;
    return progress.warning ? 'warning' : 'success';
}

/** The run's dismiss: into the background while it goes, Close once it has ended. */
function closeLabelOf(controls: ProjectsBatchControls): string {
    const { view, progress } = controls;
    if (view.phase === 'asking' || askingOf(controls)) return 'Cancel';
    const going = view.phase === 'running' && progress?.state !== 'succeeded' && progress?.state !== 'failed';
    return going ? 'Run in Background' : 'Close';
}

/** The buttons beside the dismiss. */
function actionsOf(controls: ProjectsBatchControls): ActionButton[] {
    const { view, progress, choices } = controls;
    if (view.phase === 'running') {
        const ended = progress?.state === 'succeeded' || progress?.state === 'failed';
        // A Cancel among the answers is the dismiss's when the dismiss shows, drawn once (two
        // Cancels, 2026-10-23); with the dismiss hidden it is the question's own way out.
        if (!ended && progress?.prompt) {
            const buttons = promptButtons(progress.prompt, controls.answer);
            return cancels(progress.prompt) ? buttons.filter((button) => button.label !== 'Cancel') : buttons;
        }
        if (progress?.state !== 'failed') return NO_ACTIONS;
        return [{ label: 'Open Debug Logs', variant: 'secondary', onPress: () => webviewClient.postMessage('openDebugLogs', {}) }];
    }
    if (view.phase !== 'asking') return NO_ACTIONS;
    // With changes to answer, the save question asks before anything runs (J7-2).
    const asks = (saveQuestionOfView(controls)?.rows.length ?? 0) > 0;
    // Red for both: a delete removes, a reset replaces each project's code (owner, 2026-11-04).
    const label = runLabel(subjectOf(view));
    return [{ label, variant: 'negative', onPress: () => (asks ? choices.askToSave() : controls.run()) }];
}

function BodyOf({ controls }: { controls: ProjectsBatchControls }): React.ReactElement | null {
    const { view } = controls;
    if (view.phase === 'unread') return <p className="work-row-why">{view.error}</p>;
    if (view.phase === 'asking' && view.questions.action === 'delete') {
        return <BatchDeleteQuestions rows={view.questions.rows} choices={controls.choices} />;
    }
    if (view.phase === 'asking') return <BatchResetQuestions rows={view.questions.rows} choices={controls.choices} />;
    if (view.phase !== 'running' || endedClean(controls)) return null;
    const asking = askingOf(controls);
    if (asking && questionTakesWindow(asking)) {
        return <OperationQuestion prompt={asking} onTyped={controls.onTyped} />;
    }
    return (
        <ProjectsBatchRunView
            rows={view.rows}
            order={controls.order}
            statuses={controls.statuses}
            timings={controls.timings}
            progress={controls.progress}
            onTyped={controls.onTyped}
        />
    );
}

/** The wait while the questions are read. */
function waitOf(view: BatchView): WaitLines | false {
    if (view.phase !== 'reading') return false;
    return view.action === 'reset' ? WAIT_STAGES.readingProjectsDemoData : WAIT_STAGES.readingProjects;
}

/** "Save Your Changes First?", in the window's own container; the verb is the batch's. */
function SaveFirstOf({ controls, action, question }: { controls: ProjectsBatchControls; action: ProjectsBatchAction; question: SaveQuestion }): React.ReactElement {
    const verb = action === 'delete' ? 'Delete' : 'Reset';
    return (
        <SaveFirstWindow
            withoutSavingLabel={`${verb} Without Saving`}
            saveLabel={`Save and ${verb}`}
            saveDisabled={Object.keys(question.problems).length > 0}
            onAnswer={(saves) => controls.run(saves ? 'save' : 'drop')}
            onClose={controls.close}
        >
            <BatchSaveTable question={question} onName={controls.choices.setName} />
        </SaveFirstWindow>
    );
}

/**
 * The read and the questions, in the Steps window: unseen until the read answers (`ready`), so it
 * opens at the questions' height and never grows.
 */
function QuestionsWindow({ controls, view }: { controls: ProjectsBatchControls; view: Extract<BatchView, { phase: 'reading' | 'asking' }> }): React.ReactElement {
    const status = statusOf(controls);
    return (
        <StepsWindow
            title={titleOf(controls)}
            {...(status ? { status } : {})}
            ready={view.phase === 'asking'}
            waiting={waitOf(view)}
            // Delete's table holds up to three columns of names: extra-wide, so a name stays on
            // one line, as the run that follows is (owner, 2026-11-05). Reset's one column fits large.
            wide={subjectOf(view).action === 'delete'}
            closeLabel={closeLabelOf(controls)}
            actionButtons={actionsOf(controls)}
            onClose={controls.close}
        >
            <BodyOf controls={controls} />
        </StepsWindow>
    );
}

/** The batch window; nothing while closed. */
export function ProjectsBatchModal({ controls }: { controls: ProjectsBatchControls }): React.ReactElement {
    const { view } = controls;
    const asking = askingOf(controls);
    const clean = endedClean(controls);
    const saving = view.phase === 'asking' && controls.choices.saving ? saveQuestionOf(view.questions, controls.choices) : undefined;
    // Cancel on a question answers it and keeps the window: the run goes on to the next project.
    const dismiss = asking ? () => controls.answer(undefined) : controls.close;
    if (view.phase === 'asking' && saving) {
        // Cancel, or Escape, closes everything (J7-2).
        return (
            <DialogContainer onDismiss={controls.close}>
                <SaveFirstOf controls={controls} action={view.questions.action} question={saving} />
            </DialogContainer>
        );
    }
    if (view.phase === 'reading' || view.phase === 'asking') {
        return (
            <DialogContainer onDismiss={controls.close}>
                <QuestionsWindow key="questions" controls={controls} view={view} />
            </DialogContainer>
        );
    }
    return (
        <DialogContainer onDismiss={dismiss}>
            {view.phase !== 'closed' && (
                <Modal
                    key="run"
                    title={titleOf(controls)}
                    status={statusOf(controls)}
                    // A clean end is the small result, the title alone (walk F134).
                    size={clean ? 'S' : 'L'}
                    // Delete's rows hold the same names as its questions: extra-wide (owner,
                    // 2026-11-05).
                    wide={!clean && subjectOf(view).action === 'delete'}
                    fitContent
                    onClose={dismiss}
                    closeLabel={closeLabelOf(controls)}
                    hideClose={asking ? !cancels(asking) : false}
                    actionButtons={actionsOf(controls)}
                >
                    <BodyOf controls={controls} />
                </Modal>
            )}
        </DialogContainer>
    );
}
