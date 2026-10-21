/**
 * UpdatesModal — Check for Updates on the projects list (PL-80).
 *
 * The updates Check for Updates found, grouped under Demo Builder, each project and the
 * template repositories, everything that can be applied from here ticked; one Apply. It
 * replaces VS Code's picker and nothing else: checking, and "up to date", stay in the
 * notification (owner, 2026-10-20). Apply keeps it open and shows the run in it, row by
 * row (`UpdatesRunView`, 2026-10-21): it closes by itself on nothing, since a run ends
 * with what each row did, and closing it mid-run hands the run to a notification.
 *
 * Built from the house pieces: `ui/Modal` and `CheckboxRow` (extracted from the API picker
 * for this). Each group is a panel in the projects list's own row style (`.project-row-name`,
 * `.project-row-chevron`, the trailing chevron): Spectrum's Disclosure was tried first and
 * brought a look nothing else here has (owner, 2026-10-20). A group starts closed and says
 * what it holds: its name in its own casing, and how many rows wait for the SC (one that
 * started unticked: the redeploy, or one locked in another org), so a closed group cannot
 * hide the row that needs a decision. Its checkbox already shows all, some or none ticked. The rest of its line opens it.
 * Its checkbox ticks or unticks the whole group (mixed while some rows are ticked; never a
 * locked row), and sits beside the opening button rather than in it, so ticking a group
 * does not open it. The list has a set height and scrolls (`.updates-group-list`), so
 * opening a project never resizes the window. No sentence under the title: the ticks and
 * the Apply count say it.
 *
 * @module features/projects-dashboard/ui/components/UpdatesModal
 */

import { Checkbox, DialogContainer } from '@adobe/react-spectrum';
import ChevronDown from '@spectrum-icons/workflow/ChevronDown';
import ChevronRight from '@spectrum-icons/workflow/ChevronRight';
import React, { useState } from 'react';
import { APPLYING_TITLE, type UpdatesModalControls } from '../hooks/useUpdatesModal';
import { groupsOf, type RowGroup } from './updateGroups';
import { UpdatesRunView } from './UpdatesRunView';
import { CheckboxRow } from '@/core/ui/components/selection/CheckboxRow';
import { Modal, type ActionButton } from '@/core/ui/components/ui/Modal';
import { webviewClient } from '@/core/ui/utils/WebviewClient';
import type { PendingUpdateRow } from '@/types/pendingUpdates';
import type { OperationProgressPayload } from '@/types/webviewPayloads';

const LIST_TITLE = 'Updates available';
const NO_ACTIONS: ActionButton[] = [];

/**
 * The rows a group's checkbox ticks, and what a closed group says about itself. It
 * says only how many rows wait for the SC, since a closed group could hide those. It
 * said "1 of 2" as well until 2026-10-21; the checkbox already shows all, some or none.
 */
function summaryOf(group: RowGroup, ticked: ReadonlySet<string>): { open: string[]; tickedCount: number; text: string } {
    const open = group.rows.filter((r) => !r.lockedReason).map((r) => r.id);
    const tickedCount = open.filter((id) => ticked.has(id)).length;
    const waiting = group.rows.filter((r) => !r.ticked && !ticked.has(r.id)).length;
    return { open, tickedCount, text: waiting > 0 ? `${waiting} waiting for you` : '' };
}

function RowGroupView({ group, controls }: { group: RowGroup; controls: UpdatesModalControls }) {
    const [isOpen, setOpen] = useState(false);
    const { open, tickedCount, text } = summaryOf(group, controls.ticked);
    const all = open.length > 0 && tickedCount === open.length;
    const Chevron = isOpen ? ChevronDown : ChevronRight;
    return (
        <div className="updates-group">
            <div className="updates-group-header">
                <Checkbox
                    aria-label={`All of ${group.title}`}
                    isSelected={all}
                    isIndeterminate={tickedCount > 0 && !all}
                    isDisabled={open.length === 0}
                    onChange={() => controls.toggleGroup(open)}
                />
                <button
                    type="button"
                    className="updates-group-toggle"
                    aria-expanded={isOpen}
                    onClick={() => setOpen(!isOpen)}
                >
                    <span className="project-row-name">{group.title}</span>
                    {text && <span className="updates-group-note">{text}</span>}
                    <Chevron size="S" UNSAFE_className="project-row-chevron updates-group-chevron" />
                </button>
            </div>
            <div className="updates-group-rows" hidden={!isOpen}>
                {group.rows.map((row) => (
                    <CheckboxRow
                        key={row.id}
                        label={row.label}
                        detail={row.detail}
                        reason={row.lockedReason}
                        isSelected={controls.ticked.has(row.id) && !row.lockedReason}
                        isDisabled={Boolean(row.lockedReason)}
                        onChange={() => controls.toggle(row.id)}
                    />
                ))}
            </div>
        </div>
    );
}

function UpdateList({ rows, controls }: { rows: PendingUpdateRow[]; controls: UpdatesModalControls }) {
    return (
        <div className="updates-group-list">
            {groupsOf(rows).map((group) => (
                <RowGroupView key={group.key} group={group} controls={controls} />
            ))}
        </div>
    );
}

/** The run's title: what it is doing, then how it ended. */
function runTitleOf(progress: OperationProgressPayload | null): string {
    if (progress?.state === 'failed') return "Couldn't apply the updates";
    if (progress?.state !== 'succeeded') return APPLYING_TITLE;
    return progress.warning ? "Some updates didn't apply" : 'Updates applied';
}

/**
 * The run's dismiss label and buttons. A question's answers replace them, and its
 * dismiss is Cancel; a run still going dismisses into the background; an ended run
 * closes, a failed one offering its logs.
 */
function runChrome(controls: UpdatesModalControls): { closeLabel: string; actions: ActionButton[] } {
    const { progress } = controls;
    const ended = progress?.state === 'succeeded' || progress?.state === 'failed';
    if (!ended && progress?.prompt) {
        const actions = progress.prompt.actions.map((label, index): ActionButton => ({
            label,
            variant: index === 0 ? 'accent' : 'secondary',
            onPress: () => controls.answer(label),
        }));
        return { closeLabel: 'Cancel', actions };
    }
    if (!ended) return { closeLabel: 'Run in background', actions: NO_ACTIONS };
    if (progress?.state !== 'failed') return { closeLabel: 'Close', actions: NO_ACTIONS };
    const logs: ActionButton = {
        label: 'Open Debug Logs',
        variant: 'secondary',
        onPress: () => webviewClient.postMessage('openDebugLogs', {}),
    };
    return { closeLabel: 'Close', actions: [logs] };
}

/** What the modal shows: its title, body, dismiss label and the buttons beside it. */
function contentFor(controls: UpdatesModalControls): {
    title: string;
    body: React.ReactNode;
    closeLabel?: string;
    actions: ActionButton[];
} {
    const { view } = controls;
    if (view.phase === 'applying') {
        const body = (
            <UpdatesRunView
                rows={view.rows}
                statuses={controls.statuses}
                progress={controls.progress}
                onTyped={controls.onTyped}
            />
        );
        return { title: runTitleOf(controls.progress), body, ...runChrome(controls) };
    }
    const rows = view.phase === 'list' ? view.rows : [];
    const count = rows.filter((r) => controls.ticked.has(r.id) && !r.lockedReason).length;
    const label = count === 1 ? 'Apply 1 update' : `Apply ${count} updates`;
    return {
        title: LIST_TITLE,
        body: <UpdateList rows={rows} controls={controls} />,
        actions: [{ label, variant: 'accent', onPress: controls.apply, isDisabled: count === 0 }],
    };
}

/** The Updates modal; nothing while closed. */
export function UpdatesModal({ controls }: { controls: UpdatesModalControls }): React.ReactElement {
    const open = controls.view.phase !== 'closed';
    const content = open ? contentFor(controls) : undefined;
    return (
        <DialogContainer onDismiss={controls.close}>
            {content && (
                <Modal
                    title={content.title}
                    size="L"
                    fitContent
                    onClose={controls.close}
                    closeLabel={content.closeLabel}
                    actionButtons={content.actions}
                >
                    {content.body}
                </Modal>
            )}
        </DialogContainer>
    );
}
