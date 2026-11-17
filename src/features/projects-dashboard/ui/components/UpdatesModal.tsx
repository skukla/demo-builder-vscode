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
 * 2026-11-05). Built from the house pieces: the layouts' windows in one `DialogContainer` (the list a
 * Steps window, the run the Progress layout's, the small result a Result window; step-07 Win1),
 * `CheckboxRow`, and the batch window's table classes (`projects-batch.css`).
 * How a run ended is the title with its status icon. A run where every update applied with nothing
 * to read hands off to the small result, "Updates Applied" and only what is left to know; a run
 * with a problem, or a row with something to read, stays on its rows (owner, 2026-11-10, walk F134).
 * The list and the run each hold the height they open at (rule 14).
 *
 * @module features/projects-dashboard/ui/components/UpdatesModal
 */

import { DialogContainer } from '@adobe/react-spectrum';
import React from 'react';
import {
    APPLIED_TITLE,
    APPLYING_TITLE,
    NOT_APPLIED_TITLE,
    type RowStatuses,
    SOME_NOT_APPLIED_TITLE,
    type UpdatesModalControls,
} from '../hooks/useUpdatesModal';
import { endingRowOf, promptButtons } from './runWindowParts';
import { groupsOf, updatesLiveSite, type RowGroup } from './updateGroups';
import { UpdatesRunView, waitingLine } from './UpdatesRunView';
import { OperationQuestion, questionTakesWindow } from '@/core/ui/components/feedback/OperationQuestion';
import { CheckboxRow } from '@/core/ui/components/selection/CheckboxRow';
import { LeadText } from '@/core/ui/components/ui/LeadText';
import type { ActionButton, ModalStatus } from '@/core/ui/components/ui/Modal';
import { ProgressWindow } from '@/core/ui/components/ui/ProgressDialog';
import { ResultWindow } from '@/core/ui/components/ui/ResultDialog';
import { StepsWindow } from '@/core/ui/components/ui/StepsDialog';
import { type EndingRow, endStatus, endsSmall } from '@/core/ui/utils/runEnding';
import { webviewClient } from '@/core/ui/utils/WebviewClient';
import type { PendingUpdateRow } from '@/types/pendingUpdates';
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
 * The run's title: what it is doing, then how it ended, coloured by the one amber rule (`endStatus`):
 * amber on the run's warning or a row that did not apply, green when every row is done, notes and
 * all. A row can end after the run: the SC's AI finishing a kept fix turns its row done (EDS-56), so
 * every row done is "Updates applied" whatever the run's warning said when it ended.
 */
export function runHeadingOf(progress: OperationProgressPayload | null, rows: PendingUpdateRow[], statuses: RowStatuses): Heading {
    if (progress?.state === 'failed') return { title: NOT_APPLIED_TITLE, status: 'error' };
    if (progress?.state !== 'succeeded') return { title: APPLYING_TITLE };
    const allDone = rows.every((row) => statuses[row.id]?.state === 'done');
    const status = endStatus({ succeeded: true, warning: allDone ? undefined : progress.warning, rows: endingRowsOf(rows, statuses) });
    return status === 'warning' ? { title: SOME_NOT_APPLIED_TITLE, status } : { title: APPLIED_TITLE, status };
}

/** Every row as the ending rules read it, the local copy steps included. */
function endingRowsOf(rows: PendingUpdateRow[], statuses: RowStatuses): EndingRow[] {
    return [...rows.map((row) => statuses[row.id]), ...Object.values(statuses)].map(endingRowOf);
}

/**
 * Whether the run ended cleanly, by the shared rule (`endsSmall`): it succeeded with no warning and
 * every row, its local copy steps included, is done with nothing to read under it. Only then does
 * the window leave the rows (walk F134).
 */
export function endedClean(progress: OperationProgressPayload | null, rows: PendingUpdateRow[], statuses: RowStatuses): boolean {
    const succeeded = progress?.state === 'succeeded';
    return endsSmall({ succeeded, warning: progress?.warning, rows: endingRowsOf(rows, statuses) });
}

/** The window's dismiss button and the buttons beside it. */
interface Chrome {
    closeLabel?: 'Close' | 'Run in Background' | 'Cancel';
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

/** The list: a Steps window holding the height it opens at; the table scrolls in its own pane. */
function ListWindow({ rows, controls, onClose }: { rows: PendingUpdateRow[]; controls: UpdatesModalControls; onClose: () => void }) {
    const count = rows.filter((r) => controls.ticked.has(r.id) && !r.lockedReason).length;
    const apply: ActionButton = {
        label: applyLabel(count),
        variant: 'accent',
        onPress: controls.apply,
        isDisabled: count === 0,
        sizeLabels: applyLabelsOf(rows),
    };
    return (
        <StepsWindow title={LIST_TITLE} actionButtons={[apply]} onClose={onClose}>
            <UpdateList rows={rows} controls={controls} />
        </StepsWindow>
    );
}

/** A task taking the window (a sign-in): its own heading, amber. */
function taskHeading(asking: OperationPrompt): Heading {
    return { title: asking.title ?? APPLYING_TITLE, status: 'warning' };
}

/**
 * The run, in the Progress layout (step-07 Win1): large, as a question is asked under the row it is
 * about, and holding the height it opens at. A task (a sign-in) takes the window's body and its
 * heading the title. While a question waits whose answers are every way on, Close is hidden.
 */
function RunWindow({ rows, controls, onClose }: { rows: PendingUpdateRow[]; controls: UpdatesModalControls; onClose: () => void }) {
    const asking = askingOf(controls);
    const takes = asking && questionTakesWindow(asking);
    const heading = takes ? taskHeading(asking) : runHeadingOf(controls.progress, rows, controls.statuses);
    const chrome = runChrome(controls);
    const stream = takes ? (
        <OperationQuestion prompt={asking} onTyped={controls.onTyped} />
    ) : (
        <UpdatesRunView rows={rows} statuses={controls.statuses} progress={controls.progress} onTyped={controls.onTyped} remaining={controls.remaining} />
    );
    return (
        <ProgressWindow
            title={heading.title}
            {...(heading.status ? { status: heading.status } : {})}
            stream={stream}
            actions={chrome.actions}
            {...(chrome.closeLabel ? { closeLabel: chrome.closeLabel } : {})}
            hideClose={Boolean(chrome.hideClose)}
            asksUnderRows
            onClose={onClose}
        />
    );
}

/** The small result a clean run ends on: its title, and how many updates the SC left for later. */
function CleanEnd({ controls }: { controls: UpdatesModalControls }) {
    return (
        <ResultWindow title={APPLIED_TITLE} status="success" actionButtons={backTo(controls)} onClose={controls.close}>
            {controls.remaining > 0 ? <LeadText>{waitingLine(controls.remaining)}</LeadText> : null}
        </ResultWindow>
    );
}

/** The window the view shows: the list, the run, or the small result. */
function UpdatesWindow({ controls, onClose }: { controls: UpdatesModalControls; onClose: () => void }) {
    const { view } = controls;
    if (view.phase === 'closed') return null;
    if (view.phase === 'list') return <ListWindow rows={view.rows} controls={controls} onClose={onClose} />;
    if (endedClean(controls.progress, view.rows, controls.statuses)) return <CleanEnd controls={controls} />;
    return <RunWindow rows={view.rows} controls={controls} onClose={onClose} />;
}

/** The Updates modal; nothing while closed. */
export function UpdatesModal({ controls }: { controls: UpdatesModalControls }): React.ReactElement {
    // Cancel on a sign-in answers it and keeps the window for the rest of the run.
    const signingIn = controls.view.phase === 'applying' && Boolean(askingOf(controls)?.fields?.length);
    const dismiss = signingIn ? () => controls.answer(undefined) : controls.close;
    return (
        <DialogContainer onDismiss={dismiss}>
            {/* Only while open: the container is open whenever its child is an element, even one that
                draws nothing, and an open container dims the whole page (the visual baseline,
                2026-11-14). */}
            {controls.view.phase === 'closed' ? null : <UpdatesWindow controls={controls} onClose={dismiss} />}
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
