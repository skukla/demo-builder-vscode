/**
 * ProjectsBatchModal — the one window behind Reset Selected and Delete Selected on the projects
 * list (owner, 2026-11-04), built as the Updates window is: the house `ui/Modal` in a
 * `DialogContainer`, the controls handed in (`useProjectsBatch`).
 *
 * Reading: the house wait, "Reading demo data" for a reset and "Reading Projects" for a delete.
 * The questions: `BatchDeleteQuestions` or `BatchResetQuestions`, Cancel and the button that
 * runs them. The run: `ProjectsBatchRunView`, closed into the background while it goes, its end
 * the title with its status icon, as the Updates run ends.
 *
 * @module features/projects-dashboard/ui/components/ProjectsBatchModal
 */

import { DialogContainer } from '@adobe/react-spectrum';
import React from 'react';
import { changeRows, resetIsReady } from '../batchChoices';
import { runningTitle, type BatchView, type ProjectsBatchControls } from '../hooks/useProjectsBatch';
import { BatchDeleteQuestions } from './BatchDeleteQuestions';
import { BatchResetChanges } from './BatchResetChanges';
import { BatchResetQuestions } from './BatchResetQuestions';
import { ProjectsBatchRunView } from './ProjectsBatchRunView';
import { promptButtons } from './UpdatesModal';
import { OperationQuestion, questionTakesWindow } from '@/core/ui/components/feedback/OperationQuestion';
import { Modal, type ActionButton, type ModalStatus } from '@/core/ui/components/ui/Modal';
import { webviewClient } from '@/core/ui/utils/WebviewClient';
import type { ProjectsBatchAction } from '@/types/projectsBatch';
import type { OperationProgressPayload, OperationPrompt } from '@/types/webviewPayloads';

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

/** The action and how many projects it is on, whatever the phase. */
function subjectOf(view: Exclude<BatchView, { phase: 'closed' }>): { action: ProjectsBatchAction; count: number } {
    if (view.phase === 'reading') return { action: view.action, count: view.count };
    if (view.phase === 'unread') return { action: view.action, count: 0 };
    if (view.phase === 'asking') return { action: view.questions.action, count: view.questions.rows.length };
    return { action: view.action, count: view.rows.length };
}

/** The run button's label: the action and how many it takes. */
function runLabel(action: ProjectsBatchAction, count: number): string {
    if (action === 'delete') return count === 1 ? 'Delete 1 Project' : `Delete ${count} Projects`;
    return count === 1 ? 'Reset 1 Project' : `Reset ${count} Projects`;
}

/**
 * The run's header once it has ended (the window-header convention, owner 2026-11-04): what
 * happened to the projects, generically; which project, and why, is in the rows beneath. Some
 * failing is said by the amber icon, the rows by their own.
 */
function endTitle(action: ProjectsBatchAction, progress: OperationProgressPayload): string {
    const deleting = action === 'delete';
    if (progress.state === 'failed' || progress.warning) return deleting ? "Couldn't Delete Projects" : "Couldn't Reset Projects";
    return deleting ? 'Projects Deleted' : 'Projects Reset';
}

/** Reset Selected on its second step, the packs' changes (owner, 2026-11-04). */
function onChangesStep(controls: ProjectsBatchControls): boolean {
    const { view, choices } = controls;
    return view.phase === 'asking' && view.questions.action === 'reset' && choices.step === 'changes';
}

/** The window's header in every phase: the kind of thing, never a name; a confirm adds its count. */
function titleOf(controls: ProjectsBatchControls): string {
    const { view, progress } = controls;
    if (view.phase === 'closed') return '';
    if (view.phase === 'unread') return "Couldn't Read Projects";
    const { action, count } = subjectOf(view);
    if (view.phase !== 'running') {
        if (onChangesStep(controls)) return 'Datapack Changes';
        // A confirm asks, its count the button's (owner, 2026-11-05).
        return `${runLabel(action, count)}?`;
    }
    if (progress?.state === 'succeeded' || progress?.state === 'failed') return endTitle(action, progress);
    return askingOf(controls)?.title ?? runningTitle(action);
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
    const { questions } = view;
    const label = runLabel(questions.action, questions.rows.length);
    if (questions.action === 'delete') return [{ label, variant: 'negative', onPress: controls.run }];
    // Step 1 Continues to the packs' changes when one needs an answer (owner, 2026-11-04).
    const needsChanges = changeRows(questions.rows, choices.removeTicks).length > 0;
    if (choices.step === 'projects' && needsChanges) {
        return [{ label: 'Continue', variant: 'accent', onPress: () => choices.setStep('changes') }];
    }
    const ready = resetIsReady(questions.rows, choices.removeTicks, choices.fields);
    // Red, as Delete's: a reset replaces each project's code (owner, 2026-11-04).
    const reset: ActionButton = { label, variant: 'negative', onPress: controls.run, isDisabled: !ready };
    if (choices.step !== 'changes') return [reset];
    return [{ label: 'Back', variant: 'secondary', onPress: () => choices.setStep('projects') }, reset];
}

function BodyOf({ controls }: { controls: ProjectsBatchControls }): React.ReactElement | null {
    const { view } = controls;
    if (view.phase === 'unread') return <p className="work-row-why">{view.error}</p>;
    if (view.phase === 'asking' && view.questions.action === 'delete') {
        return <BatchDeleteQuestions rows={view.questions.rows} choices={controls.choices} />;
    }
    if (view.phase === 'asking' && onChangesStep(controls)) {
        return <BatchResetChanges rows={view.questions.rows} choices={controls.choices} />;
    }
    if (view.phase === 'asking') return <BatchResetQuestions rows={view.questions.rows} choices={controls.choices} />;
    if (view.phase !== 'running') return null;
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
function waitOf(view: BatchView): { message: string } | false {
    if (view.phase !== 'reading') return false;
    return { message: view.action === 'reset' ? 'Reading demo data' : 'Reading Projects' };
}

/** The batch window; nothing while closed. */
export function ProjectsBatchModal({ controls }: { controls: ProjectsBatchControls }): React.ReactElement {
    const { view } = controls;
    const asking = askingOf(controls);
    // Cancel on a question answers it and keeps the window: the run goes on to the next project.
    const dismiss = asking ? () => controls.answer(undefined) : controls.close;
    return (
        <DialogContainer onDismiss={dismiss}>
            {view.phase !== 'closed' && (
                <Modal
                    title={titleOf(controls)}
                    status={statusOf(controls)}
                    size="L"
                    // Delete's table holds up to three columns of names: extra-wide, the next
                    // step, so a name stays on one line; the same width in every phase (owner,
                    // 2026-11-05). Reset's one column fits large.
                    wide={subjectOf(view).action === 'delete'}
                    fitContent
                    onClose={dismiss}
                    closeLabel={closeLabelOf(controls)}
                    // Step 2's way back is Back; Escape still closes the window.
                    hideClose={asking ? !cancels(asking) : onChangesStep(controls)}
                    actionButtons={actionsOf(controls)}
                    waiting={waitOf(view)}
                >
                    <BodyOf controls={controls} />
                </Modal>
            )}
        </DialogContainer>
    );
}
