/**
 * UpdatesModal — Check for Updates on the projects list (PL-80).
 *
 * Every update waiting, grouped under Demo Builder, each project and the template
 * repositories, everything that can be applied from here ticked; one Apply. The run is
 * told in the screen's `OperationProgressModal`, not here. After it, when something did
 * not apply or applied with a note, this shows the report.
 *
 * Built from the house pieces: `ui/Modal`, `LoadingDisplay`, `StatusDisplay` and
 * `CheckboxRow` (extracted from the API picker for this).
 *
 * @module features/projects-dashboard/ui/components/UpdatesModal
 */

import { DialogContainer, Text, View } from '@adobe/react-spectrum';
import React from 'react';
import type { UpdatesModalControls } from '../hooks/useUpdatesModal';
import { LoadingDisplay } from '@/core/ui/components/feedback/LoadingDisplay';
import { StatusDisplay } from '@/core/ui/components/feedback/StatusDisplay';
import { CheckboxRow } from '@/core/ui/components/selection/CheckboxRow';
import { Modal, type ActionButton } from '@/core/ui/components/ui/Modal';
import type { ApplyUpdatesReport, PendingUpdateRow } from '@/types/pendingUpdates';

const TITLE = 'Updates';
const NO_ACTIONS: ActionButton[] = [];

/** The rows under each heading, headings in the order they first appear. */
function groupsOf(rows: PendingUpdateRow[]): Array<{ key: string; title: string; rows: PendingUpdateRow[] }> {
    const groups = new Map<string, { key: string; title: string; rows: PendingUpdateRow[] }>();
    for (const row of rows) {
        const group = groups.get(row.group.key) ?? { ...row.group, rows: [] };
        group.rows.push(row);
        groups.set(row.group.key, group);
    }
    return [...groups.values()];
}

function UpdateList({ rows, controls }: { rows: PendingUpdateRow[]; controls: UpdatesModalControls }) {
    return (
        <>
            {groupsOf(rows).map((group) => (
                <View key={group.key} marginBottom="size-200">
                    <Text UNSAFE_className="text-sm font-semibold text-gray-800">{group.title}</Text>
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
                </View>
            ))}
        </>
    );
}

function Report({ report }: { report: ApplyUpdatesReport }) {
    const count = `${report.applied} update${report.applied === 1 ? '' : 's'} applied.`;
    return (
        <>
            <View marginBottom="size-200">
                <Text>{count}</Text>
            </View>
            {report.problems.length > 0 && (
                <View marginBottom="size-200">
                    <Text UNSAFE_className="text-sm font-semibold text-gray-800">Not applied</Text>
                    {report.problems.map((line) => (
                        <View key={line}>
                            <Text UNSAFE_className="text-sm">{line}</Text>
                        </View>
                    ))}
                </View>
            )}
            {report.notes.length > 0 && (
                <View marginBottom="size-200">
                    <Text UNSAFE_className="text-sm font-semibold text-gray-800">Notes</Text>
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
    switch (view.phase) {
        case 'checking':
            return { body: <LoadingDisplay size="L" message="Checking for updates" />, actions: NO_ACTIONS };
        case 'failed':
            return {
                body: (
                    <StatusDisplay
                        variant="error"
                        title="Couldn't check for updates"
                        message={view.error}
                        actions={[{ label: 'Check again', onPress: controls.check }]}
                    />
                ),
                actions: NO_ACTIONS,
            };
        case 'report':
            return { body: <Report report={view.report} />, actions: NO_ACTIONS };
        default:
            return listBody(controls);
    }
}

function listBody(controls: UpdatesModalControls): { body: React.ReactNode; actions: ActionButton[] } {
    const rows = controls.view.phase === 'list' ? controls.view.rows : [];
    if (rows.length === 0) {
        return {
            body: <StatusDisplay variant="success" title="Everything is up to date" />,
            actions: NO_ACTIONS,
        };
    }
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
    const { body, actions } = open ? bodyFor(controls) : { body: null, actions: NO_ACTIONS };
    return (
        <DialogContainer onDismiss={controls.close}>
            {open && (
                <Modal title={TITLE} size="M" fitContent onClose={controls.close} actionButtons={actions}>
                    {body}
                </Modal>
            )}
        </DialogContainer>
    );
}
