/**
 * ProjectsBatchModal — the one window behind Reset Selected and Delete Selected on the projects
 * list (owner, 2026-11-04), built as the Updates window is: one `DialogContainer` showing one layout
 * window at a time (Steps, Progress, Result), the controls handed in (`useProjectsBatch`).
 *
 * Reading and the questions are one Steps window (`StepsWindow`, step-05 S3): while the read is out
 * it is the small wait window, "Reading demo data" for a reset and "Reading projects" for a
 * delete, "Reading the project" when there is one (`WAIT_STAGES`); once the read answers it becomes the questions' window at their height,
 * and keeps it (rule 14; a frameless wait over the cards did not read as one, owner 2026-11-15). The run and a failed read are windows of their own.
 * The questions: `BatchDeleteQuestions` or `BatchResetQuestions`, Cancel and the red button. When a
 * pack whose data goes has changes, the red button runs into "Save Your Changes First?" in the same
 * container (step-05 S1, decisions J7-2): the shared `SaveFirstWindow` over `BatchSaveTable`, Reset
 * or Delete Without Saving, Cancel (which closes everything), and Save and Reset or Save and Delete.
 * Only those two, or the red button when nothing is asked, start the run.
 * The run: `ProjectsBatchRunView` in the Progress layout's window (step-07 Win1), large and holding
 * the height it opens at, closed into the background while it goes, its end the title with its
 * status icon, as the Updates run ends. A run where every project went through hands off to the
 * small result (`ResultWindow`), the title alone, which closes itself (rule 17); one with a problem
 * stays on its rows (owner, 2026-11-10, walk F134). A failed read is a small result too.
 *
 * @module features/projects-dashboard/ui/components/ProjectsBatchModal
 */

import { DialogContainer } from '@adobe/react-spectrum';
import React from 'react';
import { saveQuestionOf } from '../batchChoices';
import { batchSubject, confirmTitle, endTitle, runLabel, runningTitle, type BatchSubject } from '../batchWords';
import type { BatchView, ProjectsBatchControls } from '../hooks/useProjectsBatch';
import { BatchDeleteQuestions } from './BatchDeleteQuestions';
import { BatchResetQuestions } from './BatchResetQuestions';
import { ProjectsBatchRunView } from './ProjectsBatchRunView';
import { endingRowOf, promptButtons } from './runWindowParts';
import { BatchSaveTable } from '@/core/ui/components/feedback/BatchSaveTable';
import { OperationQuestion, questionTakesWindow } from '@/core/ui/components/feedback/OperationQuestion';
import { SaveFirstWindow } from '@/core/ui/components/feedback/SaveFirstWindow';
import type { WaitLines } from '@/core/ui/components/feedback/StageWait';
import type { ActionButton, ModalStatus } from '@/core/ui/components/ui/Modal';
import { ProgressWindow } from '@/core/ui/components/ui/ProgressDialog';
import { ResultWindow } from '@/core/ui/components/ui/ResultDialog';
import { StepsWindow } from '@/core/ui/components/ui/StepsDialog';
import { useCloseWhenClean } from '@/core/ui/hooks/useCloseWhenClean';
import { endStatus, endsSmall } from '@/core/ui/utils/runEnding';
import { webviewClient } from '@/core/ui/utils/WebviewClient';
import { WAIT_STAGES } from '@/core/utils/waitStages';
import type { SaveQuestion } from '@/features/data-installer/saveAsName';
import type { ProjectsBatchAction } from '@/types/projectsBatch';
import type { OperationPrompt } from '@/types/webviewPayloads';

const NO_ACTIONS: ActionButton[] = [];

/** A failed read's title, a literal type, so the label scan reads it where the window draws it. */
const UNREAD_TITLE = "Couldn't Read Projects";

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
    if (view.phase === 'unread') return UNREAD_TITLE;
    const subject = subjectOf(view);
    if (view.phase !== 'running') return confirmTitle(subject);
    if (progress?.state === 'succeeded' || progress?.state === 'failed') {
        return endTitle(subject, progress.state === 'failed' || Boolean(progress.warning));
    }
    return askingOf(controls)?.title ?? runningTitle(subject);
}

/**
 * How an ended run is coloured, by the one amber rule (`endStatus`): amber on the run's warning or a
 * project that did not finish what it should have (failed, or done with warnings: the code not
 * published, the mesh not redeployed); green with notes alone ("Saved to My Luma.", content kept on
 * purpose). Undefined while it runs.
 */
export function runStatus(controls: Pick<ProjectsBatchControls, 'view' | 'progress' | 'statuses'>): ModalStatus | undefined {
    const { view, progress, statuses } = controls;
    if (view.phase !== 'running' || (progress?.state !== 'succeeded' && progress?.state !== 'failed')) return undefined;
    const rows = view.rows.map((row) => endingRowOf(statuses[row.path]));
    return endStatus({ succeeded: progress.state === 'succeeded', warning: progress.warning, rows });
}

function statusOf(controls: ProjectsBatchControls): ModalStatus | undefined {
    const { view } = controls;
    if (view.phase === 'unread') return 'error';
    if (askingOf(controls)?.title) return 'warning';
    // Both confirms are dangerous: amber, as the dialog rules have it.
    if (view.phase === 'asking') return 'warning';
    return runStatus(controls);
}

/** The run's dismiss: into the background while it goes, Close once it has ended. */
function closeLabelOf(controls: ProjectsBatchControls): 'Close' | 'Run in Background' | 'Cancel' {
    const { view, progress } = controls;
    // While reading too: nothing has started, and the questions that follow say Cancel.
    if (view.phase === 'reading' || view.phase === 'asking' || askingOf(controls)) return 'Cancel';
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

/** The questions, Delete's or Reset's. */
function QuestionsBody({ controls, view }: { controls: ProjectsBatchControls; view: Extract<BatchView, { phase: 'asking' }> }): React.ReactElement {
    if (view.questions.action === 'delete') {
        return <BatchDeleteQuestions rows={view.questions.rows} choices={controls.choices} />;
    }
    return <BatchResetQuestions rows={view.questions.rows} choices={controls.choices} />;
}

/** The run's own view: its rows with a question under the running one, or a task taking the window. */
function RunBody({ controls, view }: { controls: ProjectsBatchControls; view: Extract<BatchView, { phase: 'running' }> }): React.ReactElement {
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

/** The wait while the questions are read; one project is read as one, by name. */
function waitOf(view: BatchView): WaitLines | false {
    if (view.phase !== 'reading') return false;
    const one = view.names.length === 1 ? view.names[0] : undefined;
    if (view.action !== 'reset') return one ? { ...WAIT_STAGES.readingProject, detail: one } : WAIT_STAGES.readingProjects;
    return one ? { ...WAIT_STAGES.readingProjectsDemoData, detail: `From ${one}` } : WAIT_STAGES.readingProjectsDemoData;
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
            {view.phase === 'asking' ? <QuestionsBody controls={controls} view={view} /> : null}
        </StepsWindow>
    );
}

/**
 * The run, in the Progress layout (step-07 Win1): large, as its rows can each be asked a question
 * under them, and wide for Delete's names (owner, 2026-11-05); it holds the height it opens at.
 * While a question waits whose answers are every way on, Close is hidden; a sign-in keeps Cancel.
 */
function RunWindow({ controls, view, onClose }: { controls: ProjectsBatchControls; view: Extract<BatchView, { phase: 'running' }>; onClose: () => void }): React.ReactElement {
    const asking = askingOf(controls);
    const status = statusOf(controls);
    const ended = controls.progress?.state === 'succeeded' || controls.progress?.state === 'failed';
    return (
        <ProgressWindow
            title={titleOf(controls)}
            {...(status ? { status } : {})}
            stream={<RunBody controls={controls} view={view} />}
            actions={actionsOf(controls)}
            closeLabel={closeLabelOf(controls)}
            hideClose={asking ? !cancels(asking) : false}
            asksUnderRows
            wide={subjectOf(view).action === 'delete'}
            // An ended run that is not clean keeps its rows to read (walk F134).
            holds={ended}
            onClose={onClose}
        />
    );
}

/**
 * The small result a clean run ends on, its title alone (walk F134). It closes itself after a
 * glance, as the install window's clean result does (rule 17, `useCloseWhenClean`).
 */
function CleanEnd({ title, onClose }: { title: string; onClose: () => void }): React.ReactElement {
    useCloseWhenClean(true, onClose);
    return <ResultWindow title={title} status="success" onClose={onClose} />;
}

/** The window in the container: the questions, the save question, the run, or a result. */
function BatchWindow({ controls, onDismiss }: { controls: ProjectsBatchControls; onDismiss: () => void }): React.ReactElement | null {
    const { view } = controls;
    if (view.phase === 'closed') return null;
    if (view.phase === 'unread') {
        return (
            <ResultWindow title={UNREAD_TITLE} status="error" onClose={controls.close}>
                <p className="work-row-why">{view.error}</p>
            </ResultWindow>
        );
    }
    if (view.phase === 'asking' && controls.choices.saving) {
        return <SaveFirstOf controls={controls} action={view.questions.action} question={saveQuestionOf(view.questions, controls.choices)} />;
    }
    if (view.phase === 'reading' || view.phase === 'asking') {
        return <QuestionsWindow key="questions" controls={controls} view={view} />;
    }
    // A clean end is the small result, the title alone (walk F134).
    if (endedClean(controls)) return <CleanEnd title={titleOf(controls)} onClose={controls.close} />;
    return <RunWindow controls={controls} view={view} onClose={onDismiss} />;
}

/** The batch window; nothing while closed. */
export function ProjectsBatchModal({ controls }: { controls: ProjectsBatchControls }): React.ReactElement {
    const asking = askingOf(controls);
    // Cancel on a question answers it and keeps the window: the run goes on to the next project.
    // Cancel or Escape on the save question closes everything (J7-2).
    const dismiss = asking ? () => controls.answer(undefined) : controls.close;
    return (
        <DialogContainer onDismiss={dismiss}>
            {/* Only while open: the container is open whenever its child is an element, even one that
                draws nothing, and an open container dims the whole page (the visual baseline,
                2026-11-14). */}
            {controls.view.phase === 'closed' ? null : <BatchWindow controls={controls} onDismiss={dismiss} />}
        </DialogContainer>
    );
}
