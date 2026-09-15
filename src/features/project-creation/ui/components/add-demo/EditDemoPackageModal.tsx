/**
 * EditDemoPackageModal — rename an added demo package's card and change its
 * description (owner, 2026-09-14), from the card's Edit.
 *
 * The same two fields Add a demo package asks for, in the core Modal, and one
 * host call on Save: `edit-added-demo`. The card changes on the Welcome step
 * through the settings push; the caller only learns the edited row, so a
 * selected card's row can follow. Settings only, so no confirmation.
 *
 * @module features/project-creation/ui/components/add-demo/EditDemoPackageModal
 */

import { DialogContainer, TextArea, TextField } from '@adobe/react-spectrum';
import React, { useState } from 'react';
import { COPY } from './addDemoFlow';
import { InlineNotice } from '@/core/ui/components/feedback/InlineNotice';
import { Modal } from '@/core/ui/components/ui/Modal';
import { webviewClient } from '@/core/ui/utils/vscode-api';
import type { AddedDemo } from '@/types/projectFile';
import type { EditAddedDemoRequest, EditAddedDemoResult } from '@/types/webviewRequests';

export interface EditDemoPackageModalProps {
    /** The demo being edited; the dialog is open while this is set. */
    demo: AddedDemo | undefined;
    onClose: () => void;
    /** The host saved it: the edited row. */
    onSaved: (demo: AddedDemo) => void;
}

const EDIT_COPY = {
    title: 'Edit demo package',
    save: 'Save',
    saving: 'Saving',
    failed: "Couldn't save the changes",
    fallback: "We couldn't save the changes. Try again.",
} as const;

function Journey({ demo, onClose, onSaved }: EditDemoPackageModalProps & { demo: AddedDemo }): React.ReactElement {
    const [name, setName] = useState(demo.name);
    const [description, setDescription] = useState(demo.description ?? '');
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | undefined>(undefined);

    const save = async (): Promise<void> => {
        setSaving(true);
        setError(undefined);
        try {
            const request: EditAddedDemoRequest = {
                source: { owner: demo.source.owner, repo: demo.source.repo },
                name,
                description,
            };
            const answer = await webviewClient.request<{ success: boolean; error?: string; result?: EditAddedDemoResult }>(
                'edit-added-demo',
                request,
            );
            if (!answer.success || !answer.result) {
                setError(answer.error ?? EDIT_COPY.fallback);
                setSaving(false);
                return;
            }
            // `saving` stays on while the dialog closes: DialogContainer keeps
            // rendering it through the exit animation.
            onSaved(answer.result.demo);
            onClose();
        } catch (failure) {
            setError((failure as Error).message || EDIT_COPY.fallback);
            setSaving(false);
        }
    };

    return (
        <Modal
            title={EDIT_COPY.title}
            size="M"
            fitContent
            onClose={onClose}
            closeLabel="Cancel"
            actionButtons={[
                {
                    label: saving ? EDIT_COPY.saving : EDIT_COPY.save,
                    variant: 'accent',
                    onPress: () => void save(),
                    isDisabled: saving || !name.trim(),
                },
            ]}
        >
            <div className="add-demo-stage">
                <TextField label={COPY.nameLabel} value={name} onChange={setName} isRequired width="100%" />
                <TextArea label={COPY.descriptionLabel} value={description} onChange={setDescription} width="100%" />
                {error ? (
                    <InlineNotice tone="warning" title={EDIT_COPY.failed} testId="edit-demo-error">
                        {error}
                    </InlineNotice>
                ) : null}
            </div>
        </Modal>
    );
}

/**
 * The dialog host: mounts the journey only while a demo is being edited, so
 * each opening starts from that demo's saved words.
 *
 * @param props - the demo, and the close and saved callbacks
 * @returns the dialog container
 */
export function EditDemoPackageModal({ demo, ...rest }: EditDemoPackageModalProps): React.ReactElement {
    return <DialogContainer onDismiss={rest.onClose}>{demo ? <Journey demo={demo} {...rest} /> : null}</DialogContainer>;
}
