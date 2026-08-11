/**
 * RenameIntegrationModal — the one-field rename surface for AI-built instance
 * rows (shell instancing, Step 10).
 *
 * Display name ONLY: the instance id (folder path, ow.package, keyed-state key,
 * API picks) is immutable, so this modal never re-derives an id — it evaluates
 * the display name against the OTHER rows' display names (case-insensitive,
 * trimmed) with BlankStage's evaluate-and-emit + inline `errorMessage` idiom.
 * The instance's CURRENT name is always allowed (a no-op rename). Save emits
 * the trimmed name via `onRename`; the HOST commits it (useProjectBuilder's
 * `onRenameAppBuilderComponent`) and closes.
 *
 * Mirrors {@link AddIntegrationFlowModal}'s shell: a DialogContainer host whose
 * journey mounts ONLY while open (`{isOpen && …}` — mandatory: the Spectrum test
 * mock renders dialogs eagerly; the conditional mount is also the reset-on-open
 * seam, so reopening always prefills the current name).
 *
 * @module features/project-creation/ui/components/integration-flow/RenameIntegrationModal
 */

import { DialogContainer, TextField } from '@adobe/react-spectrum';
import React, { useState } from 'react';
import { Modal } from '@/core/ui/components/ui/Modal';

const DUPLICATE_MESSAGE = 'That name is already used by another integration.';

export interface RenameIntegrationModalProps {
    isOpen: boolean;
    /** The instance's current display name (prefills the field; always allowed). */
    currentName: string;
    /** The OTHER rows' display names — a case-insensitive, trimmed match is rejected. */
    takenNames: string[];
    /** Close without committing (Cancel / dismiss). */
    onClose: () => void;
    /** Commit the trimmed new name (the host writes `sources[id].name` in place). */
    onRename: (name: string) => void;
}

/** Case-insensitive, whitespace-trimmed name comparison. */
function sameName(a: string, b: string): boolean {
    return a.trim().toLowerCase() === b.trim().toLowerCase();
}

/**
 * Evaluate a raw rename value. Mirrors the instanceId evaluate shape: empty
 * input is merely incomplete (no name, no message); a duplicate of another
 * row's display name carries an inline message; the current name and any other
 * value yield the trimmed name.
 */
function evaluateRename(
    raw: string,
    currentName: string,
    takenNames: string[],
): { name?: string; message?: string } {
    const trimmed = raw.trim();
    if (trimmed === '') return {};
    if (sameName(trimmed, currentName)) return { name: trimmed };
    if (takenNames.some((taken) => sameName(taken, trimmed))) {
        return { message: DUPLICATE_MESSAGE };
    }
    return { name: trimmed };
}

/** The mounted-while-open rename journey: one field + the Save gate. */
function RenameJourney({
    currentName,
    takenNames,
    onClose,
    onRename,
}: Omit<RenameIntegrationModalProps, 'isOpen'>): React.ReactElement {
    const [value, setValue] = useState(currentName);
    const { name, message } = evaluateRename(value, currentName, takenNames);
    return (
        <Modal
            title="Rename Integration"
            size="M"
            onClose={onClose}
            closeLabel="Cancel"
            actionButtons={[
                {
                    label: 'Save',
                    variant: 'accent',
                    onPress: () => name !== undefined && onRename(name),
                    isDisabled: name === undefined,
                },
            ]}
        >
            <div className="intflow-stage-body">
                <TextField
                    label="Integration name"
                    value={value}
                    onChange={setValue}
                    validationState={message ? 'invalid' : undefined}
                    errorMessage={message}
                    width="100%"
                />
            </div>
        </Modal>
    );
}

/**
 * The rename modal host (mounts the journey ONLY while open).
 *
 * @param props - open state + the current/taken names and the commit callbacks
 * @returns the dialog host
 */
export function RenameIntegrationModal({
    isOpen,
    ...journey
}: RenameIntegrationModalProps): React.ReactElement {
    return (
        <DialogContainer type="modal" onDismiss={journey.onClose}>
            {isOpen && <RenameJourney {...journey} />}
        </DialogContainer>
    );
}
