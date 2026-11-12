/**
 * UpdatesModal — Check for Updates on the projects list (PL-80).
 *
 * The updates Check for Updates found, grouped under Demo Builder, each project and the
 * template repositories, everything that can be applied from here ticked; one Apply. It
 * replaces VS Code's picker and nothing else: checking, and "up to date", stay in the
 * notification (owner, 2026-10-20). Apply keeps it open and shows the run in it, row by
 * row (`UpdatesRunView`, 2026-10-21): it closes by itself on nothing, since a run ends
 * with what each row did, and closing it mid-run hands the run to a notification. A run
 * that leaves rows the SC unticked still waiting says how many and offers "Back to
 * updates", the list again on a fresh check (owner, 2026-10-22).
 *
 * Drawn as Reset Selected and Delete Selected draw their projects (F50, owner 2026-11-07): a table,
 * a project per row with its storefront's repository under its name, hairlines between them, its
 * updates as boxes in the Apply column, whose header ticks or unticks every update. Demo Builder
 * itself and the template repositories are rows of their own. Nothing folds away, so a row waiting
 * for the SC (a redeploy, or one locked in another org) is simply unticked with its reason under
 * it. A long list scrolls under the fixed header, its bottom edge fading while there is more
 * (`scroll-fade`), and Apply counts every ticked update, seen or not: the owner chose scrolling over
 * pages, which would hide rows being approved (2026-11-07). The groups with chevrons it replaces
 * (2026-10-20) had a group's own tick-all; a project's updates are now ticked one by one or all at
 * once. One sentence under the title, only when a listed update reaches the live site (owner,
 * 2026-11-05). Built from the house pieces: `ui/Modal`, `CheckboxRow`, and the batch window's table
 * classes (`projects-batch.css`).
 * How a run ended is the title with its status icon. A run where every update applied with nothing
 * to read hands off to the small result, "Updates Applied" and only what is left to know; a run
 * with a problem, or a row with something to read, stays on its rows (owner, 2026-11-10, walk F134).
 *
 * @module features/projects-dashboard/ui/components/UpdatesModal
 */

import { DialogContainer } from '@adobe/react-spectrum';
import React from 'react';
import { APPLYING_TITLE, type RowStatuses, type UpdatesModalControls } from '../hooks/useUpdatesModal';
import { groupsOf, updatesLiveSite, type RowGroup } from './updateGroups';
import { UpdatesRunView, waitingLine } from './UpdatesRunView';
import { OperationQuestion, questionTakesWindow } from '@/core/ui/components/feedback/OperationQuestion';
import { CheckboxRow } from '@/core/ui/components/selection/CheckboxRow';
import { LeadText } from '@/core/ui/components/ui/LeadText';
import { Modal, type ActionButton, type ModalStatus } from '@/core/ui/components/ui/Modal';
import { endsSmall, type EndingRow } from '@/core/ui/utils/runEnding';
import { webviewClient } from '@/core/ui/utils/WebviewClient';
import type { PendingUpdateRow, UpdateRowState } from '@/types/pendingUpdates';
import type { OperationProgressPayload, OperationPrompt } from '@/types/webviewPayloads';

const LIST_TITLE = 'Updates Available';
const LIVE_SITE_SENTENCE = 'Storefront updates go to the live site.';
const NO_ACTIONS: ActionButton[] = [];

/** One project (or Demo Builder, or the template repositories): its name over its line, then its updates. */
function GroupRow({ group, controls }: { group: RowGroup; controls: UpdatesModalControls }) {
    return (
        <tr>
            <th scope="row">
                <span className="checkbox-row-label">{group.title}</span>
                {group.detail && <div className="work-row-detail">{group.detail}</div>}
            </th>
            <td>
                <div className="updates-table-boxes">
                {group.rows.map((row) => (
                    <CheckboxRow
                        key={row.id}
                        label={row.label}
                        detail={row.detail || undefined}
                        reason={row.lockedReason}
                        isSelected={controls.ticked.has(row.id) && !row.lockedReason}
                        isDisabled={Boolean(row.lockedReason)}
                        onChange={() => controls.toggle(row.id)}
                    />
                ))}
                </div>
            </td>
        </tr>
    );
}

/** The list as Reset Selected's table: a project per row, its updates in the Apply column, whose header ticks them all. */
function UpdateList({ rows, controls }: { rows: PendingUpdateRow[]; controls: UpdatesModalControls }) {
    const open = rows.filter((r) => !r.lockedReason).map((r) => r.id);
    const tickedCount = open.filter((id) => controls.ticked.has(id)).length;
    const all = open.length > 0 && tickedCount === open.length;
    return (
        <div className="batch-confirm">
            {updatesLiveSite(rows) && <LeadText>{LIVE_SITE_SENTENCE}</LeadText>}
            <div className="batch-delete scroll-fade scroll-fade--capped">
                <table className="batch-delete-table updates-table">
                    <thead>
                        <tr>
                            <td className="batch-changes-head batch-project-head">Project</td>
                            <th scope="col">
                                <CheckboxRow
                                    label="Apply"
                                    isSelected={all}
                                    isIndeterminate={tickedCount > 0 && !all}
                                    isDisabled={open.length === 0}
                                    onChange={() => controls.toggleGroup(open)}
                                />
                            </th>
                        </tr>
                    </thead>
                    <tbody>
                        {groupsOf(rows).map((group) => (
                            <GroupRow key={group.key} group={group} controls={controls} />
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

/** The title, and the icon before it saying how things stand. */
interface Heading {
    title: string;
    status?: ModalStatus;
}

/**
 * The run's title: what it is doing, then how it ended. A row can end after the run: the
 * SC's AI finishing a kept fix turns its row done (EDS-56), so every row done is
 * "Updates applied" whatever the run's warning said when it ended.
 */
function runHeadingOf(progress: OperationProgressPayload | null, rows: PendingUpdateRow[], statuses: RowStatuses): Heading {
    if (progress?.state === 'failed') return { title: "Couldn't Apply the Updates", status: 'error' };
    if (progress?.state !== 'succeeded') return { title: APPLYING_TITLE };
    const allDone = rows.every((row) => statuses[row.id]?.state === 'done');
    return progress.warning && !allDone
        ? { title: "Some updates didn't apply", status: 'warning' }
        : { title: 'Updates Applied', status: 'success' };
}

/**
 * A run row's status as the shared ending rule reads it: anything short of done (failed, skipped,
 * still going, never told) is a problem, and what it says once done is a note. The projects batch
 * run's rows have the same states, so it reads them through this too.
 */
export function endingRowOf(status: { state: UpdateRowState; message?: string } | undefined): EndingRow {
    return { problem: status?.state !== 'done', ...(status?.message ? { note: status.message } : {}) };
}

/**
 * Whether the run ended cleanly, by the shared rule (`endsSmall`): it succeeded with no warning and
 * every row, its local copy steps included, is done with nothing to read under it. Only then does
 * the window leave the rows (walk F134).
 */
export function endedClean(progress: OperationProgressPayload | null, rows: PendingUpdateRow[], statuses: RowStatuses): boolean {
    const all = [...rows.map((row) => statuses[row.id]), ...Object.values(statuses)];
    const succeeded = progress?.state === 'succeeded';
    return endsSmall({ succeeded, warning: progress?.warning, rows: all.map(endingRowOf) });
}

/** The small result a clean run ends on: its title, and how many updates the SC left for later. */
function cleanEnd(controls: UpdatesModalControls): Chrome & Heading & { body: React.ReactNode; size: 'S' } {
    const body = controls.remaining > 0 ? <LeadText>{waitingLine(controls.remaining)}</LeadText> : null;
    return { title: 'Updates Applied', status: 'success', body, size: 'S', ...runChrome(controls) };
}

/** The window's dismiss button and the buttons beside it. */
interface Chrome {
    closeLabel?: string;
    hideClose?: boolean;
    actions: ActionButton[];
}

/**
 * The run's dismiss label and buttons. A question's answers are the only buttons: a
 * dismiss would repeat its safe answer (it was a Cancel that did just that until
 * 2026-10-21), and a run cannot go to the background with a question nobody can answer
 * there. Escape still answers it as dismissed. A run still going dismisses into the
 * background; an ended run closes, a failed one offering its logs.
 */
function runChrome(controls: UpdatesModalControls): Chrome {
    const { progress } = controls;
    const ended = progress?.state === 'succeeded' || progress?.state === 'failed';
    if (!ended && progress?.prompt) {
        // A question with fields (a sign-in) has no answer that does not go on: Cancel is its
        // way out, and a Cancel among its answers is the dismiss's, drawn once (2026-11-04).
        const buttons = promptButtons(progress.prompt, controls.answer);
        if (progress.prompt.fields?.length) {
            return { closeLabel: 'Cancel', actions: buttons.filter((b) => b.label !== 'Cancel') };
        }
        return { hideClose: true, actions: buttons };
    }
    if (!ended) return { closeLabel: 'Run in Background', actions: NO_ACTIONS };
    if (progress?.state !== 'failed') return { closeLabel: 'Close', actions: backTo(controls) };
    const logs: ActionButton = {
        label: 'Open Debug Logs',
        variant: 'secondary',
        onPress: () => webviewClient.postMessage('openDebugLogs', {}),
    };
    return { closeLabel: 'Close', actions: [logs] };
}

/**
 * A run's question, answered by the window's buttons: the prompt's answers, its main one last as
 * a dialog's main button goes (a prompt names it first). The projects batch window asks with it too.
 */
export function promptButtons(prompt: OperationPrompt, answer: (chosen?: string) => void): ActionButton[] {
    const main = prompt.destructive ? 'negative' : 'accent';
    const actions = prompt.actions.map((label, index): ActionButton => ({
        label,
        variant: index === 0 ? main : 'secondary',
        onPress: () => answer(label),
    }));
    return [...actions.slice(1), ...actions.slice(0, 1)];
}

/** "Back to updates" beside Close, when rows the SC left unticked are still waiting. */
function backTo(controls: UpdatesModalControls): ActionButton[] {
    if (controls.remaining === 0) return NO_ACTIONS;
    // The button's spinner while the list is read again, not "Checking for updates" (owner, 2026-10-31).
    return [{ label: 'Back to Updates', variant: 'secondary', onPress: controls.back, isPending: controls.rechecking }];
}

/** The question the run is paused on, while it is. */
function askingOf(controls: UpdatesModalControls): OperationPrompt | undefined {
    const { progress } = controls;
    return progress?.state === 'running' ? progress.prompt : undefined;
}

/** What the modal shows: its title, body, dismiss label and the buttons beside it. */
function contentFor(controls: UpdatesModalControls): Chrome & Heading & { body: React.ReactNode; size?: 'S' } {
    const { view } = controls;
    const asking = askingOf(controls);
    if (view.phase === 'applying' && asking && questionTakesWindow(asking)) {
        const body = <OperationQuestion prompt={asking} onTyped={controls.onTyped} />;
        return { title: asking.title ?? APPLYING_TITLE, status: 'warning', body, ...runChrome(controls) };
    }
    if (view.phase === 'applying' && endedClean(controls.progress, view.rows, controls.statuses)) return cleanEnd(controls);
    if (view.phase === 'applying') {
        const body = (
            <UpdatesRunView
                rows={view.rows}
                statuses={controls.statuses}
                progress={controls.progress}
                onTyped={controls.onTyped}
                remaining={controls.remaining}
            />
        );
        return { ...runHeadingOf(controls.progress, view.rows, controls.statuses), body, ...runChrome(controls) };
    }
    const rows = view.phase === 'list' ? view.rows : [];
    const count = rows.filter((r) => controls.ticked.has(r.id) && !r.lockedReason).length;
    const label = applyLabel(count);
    return {
        title: LIST_TITLE,
        body: <UpdateList rows={rows} controls={controls} />,
        actions: [
            { label, variant: 'accent', onPress: controls.apply, isDisabled: count === 0, sizeLabels: applyLabelsOf(rows) },
        ],
    };
}

/** The Updates modal; nothing while closed. */
export function UpdatesModal({ controls }: { controls: UpdatesModalControls }): React.ReactElement {
    const open = controls.view.phase !== 'closed';
    const content = open ? contentFor(controls) : undefined;
    // Cancel on a sign-in answers it and keeps the window for the rest of the run.
    const signingIn = controls.view.phase === 'applying' && Boolean(askingOf(controls)?.fields?.length);
    const dismiss = signingIn ? () => controls.answer(undefined) : controls.close;
    return (
        <DialogContainer onDismiss={dismiss}>
            {content && (
                <Modal
                    title={content.title}
                    status={content.status}
                    size={content.size ?? 'L'}
                    fitContent
                    onClose={dismiss}
                    closeLabel={content.closeLabel}
                    hideClose={content.hideClose}
                    actionButtons={content.actions}
                >
                    {content.body}
                </Modal>
            )}
        </DialogContainer>
    );
}

/** The labels Apply can take besides none ticked: one, and every row that can be ticked. */
function applyLabelsOf(rows: PendingUpdateRow[]): string[] {
    const tickable = rows.filter((r) => !r.lockedReason).length;
    return tickable > 1 ? [applyLabel(1), applyLabel(tickable)] : [applyLabel(1)];
}

/** The Apply button names what it will do; with nothing ticked it names no number (2026-11-03: "Apply 0 Updates"). */
function applyLabel(count: number): string {
    if (count === 0) return 'Apply Updates';
    if (count === 1) return 'Apply 1 Update';
    return `Apply ${count} Updates`;
}
