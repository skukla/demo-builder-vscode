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
import { resetIsReady } from '../batchChoices';
import { runningTitle, type BatchView, type ProjectsBatchControls } from '../hooks/useProjectsBatch';
import { BatchDeleteQuestions } from './BatchDeleteQuestions';
import { BatchResetQuestions } from './BatchResetQuestions';
import { ProjectsBatchRunView } from './ProjectsBatchRunView';
import { promptButtons } from './UpdatesModal';
import { Modal, type ActionButton, type ModalStatus } from '@/core/ui/components/ui/Modal';
import { webviewClient } from '@/core/ui/utils/WebviewClient';
import type { ProjectsBatchAction } from '@/types/projectsBatch';
import type { OperationProgressPayload } from '@/types/webviewPayloads';

const NO_ACTIONS: ActionButton[] = [];

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

/** The window's header in every phase: the kind of thing, never a name or a count. */
function titleOf(controls: ProjectsBatchControls): string {
    const { view, progress } = controls;
    if (view.phase === 'closed') return '';
    if (view.phase === 'unread') return "Couldn't Read Projects";
    const { action } = subjectOf(view);
    if (view.phase !== 'running') return action === 'delete' ? 'Delete Projects' : 'Reset Projects';
    if (progress?.state === 'succeeded' || progress?.state === 'failed') return endTitle(action, progress);
    return runningTitle(action);
}

function statusOf(controls: ProjectsBatchControls): ModalStatus | undefined {
    const { view, progress } = controls;
    if (view.phase === 'unread' || (view.phase === 'running' && progress?.state === 'failed')) return 'error';
    if (view.phase !== 'running' || progress?.state !== 'succeeded') return undefined;
    return progress.warning ? 'warning' : 'success';
}

/** The run's dismiss: into the background while it goes, Close once it has ended. */
function closeLabelOf(controls: ProjectsBatchControls): string {
    const { view, progress } = controls;
    if (view.phase === 'asking') return 'Cancel';
    const going = view.phase === 'running' && progress?.state !== 'succeeded' && progress?.state !== 'failed';
    return going ? 'Run in Background' : 'Close';
}

/** The buttons beside the dismiss. */
function actionsOf(controls: ProjectsBatchControls): ActionButton[] {
    const { view, progress, choices } = controls;
    if (view.phase === 'running') {
        const ended = progress?.state === 'succeeded' || progress?.state === 'failed';
        if (!ended && progress?.prompt) return promptButtons(progress.prompt, controls.answer);
        if (progress?.state !== 'failed') return NO_ACTIONS;
        return [{ label: 'Open Debug Logs', variant: 'secondary', onPress: () => webviewClient.postMessage('openDebugLogs', {}) }];
    }
    if (view.phase !== 'asking') return NO_ACTIONS;
    const { questions } = view;
    const label = runLabel(questions.action, questions.rows.length);
    if (questions.action === 'delete') return [{ label, variant: 'negative', onPress: controls.run }];
    const ready = resetIsReady(questions.rows, choices.removeDatapack, choices.fields);
    return [{ label, variant: 'accent', onPress: controls.run, isDisabled: !ready }];
}

function BodyOf({ controls }: { controls: ProjectsBatchControls }): React.ReactElement | null {
    const { view } = controls;
    if (view.phase === 'unread') return <p className="work-row-why">{view.error}</p>;
    if (view.phase === 'asking' && view.questions.action === 'delete') {
        return <BatchDeleteQuestions rows={view.questions.rows} choices={controls.choices} />;
    }
    if (view.phase === 'asking') return <BatchResetQuestions rows={view.questions.rows} choices={controls.choices} />;
    if (view.phase !== 'running') return null;
    return (
        <ProjectsBatchRunView
            rows={view.rows}
            order={controls.order}
            statuses={controls.statuses}
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
    const { view, progress } = controls;
    const asking = view.phase === 'running' && progress?.prompt && progress.state === 'running';
    return (
        <DialogContainer onDismiss={controls.close}>
            {view.phase !== 'closed' && (
                <Modal
                    title={titleOf(controls)}
                    status={statusOf(controls)}
                    size="L"
                    fitContent
                    onClose={controls.close}
                    closeLabel={closeLabelOf(controls)}
                    hideClose={Boolean(asking)}
                    actionButtons={actionsOf(controls)}
                    waiting={waitOf(view)}
                >
                    <BodyOf controls={controls} />
                </Modal>
            )}
        </DialogContainer>
    );
}
