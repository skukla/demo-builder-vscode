/**
 * UpdatesModal — Check for Updates on the projects list (PL-80).
 *
 * The updates Check for Updates found, grouped under Demo Builder, each project and the
 * template repositories, everything that can be applied from here ticked; one Apply. It
 * replaces VS Code's picker and nothing else: checking, and "up to date", stay in the
 * notification (owner, 2026-10-20). The run is told in the screen's
 * `OperationProgressModal`, not here. After it, when something did not apply or applied
 * with a note, this shows the report.
 *
 * Built from the house pieces: `ui/Modal` and `CheckboxRow` (extracted from the API picker
 * for this). Each group is a panel in the projects list's own row style (`.project-row-name`,
 * `.project-row-chevron`, the trailing chevron): Spectrum's Disclosure was tried first and
 * brought a look nothing else here has (owner, 2026-10-20). A group starts closed and says
 * what it holds: its name in its own casing, "3 of 4" ticked, and how many rows wait for
 * the SC (one that started unticked: the redeploy, or one locked in another org), so a
 * closed group cannot hide the row that needs a decision. The rest of its line opens it.
 * Its checkbox ticks or unticks the whole group (mixed while some rows are ticked; never a
 * locked row), and sits beside the opening button rather than in it, so ticking a group
 * does not open it. The list has a set height and scrolls (`.updates-group-list`), so
 * opening a project never resizes the window. No sentence under the title: the ticks and
 * the Apply count say it.
 *
 * @module features/projects-dashboard/ui/components/UpdatesModal
 */

import { Checkbox, DialogContainer, Text, View } from '@adobe/react-spectrum';
import ChevronDown from '@spectrum-icons/workflow/ChevronDown';
import ChevronRight from '@spectrum-icons/workflow/ChevronRight';
import React, { useState } from 'react';
import type { UpdatesModalControls } from '../hooks/useUpdatesModal';
import { CheckboxRow } from '@/core/ui/components/selection/CheckboxRow';
import { LeadText } from '@/core/ui/components/ui/LeadText';
import { Modal, type ActionButton } from '@/core/ui/components/ui/Modal';
import { SectionLabel } from '@/core/ui/components/ui/SectionLabel';
import type { ApplyUpdatesReport, PendingUpdateRow } from '@/types/pendingUpdates';

const LIST_TITLE = 'Updates available';
const REPORT_TITLE = 'Update results';
const NO_ACTIONS: ActionButton[] = [];

interface RowGroup {
    key: string;
    title: string;
    rows: PendingUpdateRow[];
}

/** The rows under each heading, headings in the order they first appear. */
function groupsOf(rows: PendingUpdateRow[]): RowGroup[] {
    const groups = new Map<string, RowGroup>();
    for (const row of rows) {
        const group = groups.get(row.group.key) ?? { ...row.group, rows: [] };
        group.rows.push(row);
        groups.set(row.group.key, group);
    }
    return [...groups.values()];
}

/** What a closed group says about itself, and the rows its checkbox ticks. */
function summaryOf(group: RowGroup, ticked: ReadonlySet<string>): { open: string[]; tickedCount: number; text: string } {
    const open = group.rows.filter((r) => !r.lockedReason).map((r) => r.id);
    const tickedCount = open.filter((id) => ticked.has(id)).length;
    const waiting = group.rows.filter((r) => !r.ticked && !ticked.has(r.id)).length;
    const parts = open.length > 0 ? [`${tickedCount} of ${open.length}`] : [];
    if (waiting > 0) parts.push(`${waiting} waiting for you`);
    return { open, tickedCount, text: parts.join(', ') };
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
                    {text && <span className="checkbox-row-detail">{text}</span>}
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

function Report({ report }: { report: ApplyUpdatesReport }) {
    const count = `${report.applied} update${report.applied === 1 ? '' : 's'} applied.`;
    return (
        <>
            <LeadText>{count}</LeadText>
            {report.problems.length > 0 && (
                <View marginBottom="size-200">
                    <SectionLabel>Not applied</SectionLabel>
                    {report.problems.map((line) => (
                        <View key={line}>
                            <Text UNSAFE_className="text-sm">{line}</Text>
                        </View>
                    ))}
                </View>
            )}
            {report.notes.length > 0 && (
                <View marginBottom="size-200">
                    <SectionLabel>Notes</SectionLabel>
                    {report.notes.map((line) => (
                        <View key={line}>
                            <Text UNSAFE_className="text-sm text-gray-700">{line}</Text>
                        </View>
                    ))}
                </View>
            )}
        </>
    );
}

/** What the modal body shows, and the buttons beside Close. */
function bodyFor(controls: UpdatesModalControls): { body: React.ReactNode; actions: ActionButton[] } {
    const { view } = controls;
    if (view.phase === 'report') return { body: <Report report={view.report} />, actions: NO_ACTIONS };
    const rows = view.phase === 'list' ? view.rows : [];
    const count = rows.filter((r) => controls.ticked.has(r.id) && !r.lockedReason).length;
    const label = count === 1 ? 'Apply 1 update' : `Apply ${count} updates`;
    return {
        body: <UpdateList rows={rows} controls={controls} />,
        actions: [{ label, variant: 'accent', onPress: controls.apply, isDisabled: count === 0 }],
    };
}

/** The Updates modal; nothing while closed. */
export function UpdatesModal({ controls }: { controls: UpdatesModalControls }): React.ReactElement {
    const open = controls.view.phase !== 'closed';
    const isReport = controls.view.phase === 'report';
    const { body, actions } = open ? bodyFor(controls) : { body: null, actions: NO_ACTIONS };
    return (
        <DialogContainer onDismiss={controls.close}>
            {open && (
                <Modal
                    title={isReport ? REPORT_TITLE : LIST_TITLE}
                    size="L"
                    fitContent
                    onClose={controls.close}
                    actionButtons={actions}
                >
                    {body}
                </Modal>
            )}
        </DialogContainer>
    );
}
