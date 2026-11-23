/**
 * EditDemoPackageModal — rename an added demo package's card and change its
 * description (owner, 2026-09-14), from the card's Edit.
 *
 * The same two fields Add a demo package asks for, on the Form layout (`FormDialog`, Phase 1b:
 * its failure line is kept from the start, so a refusal moves nothing), and one
 * host call on Save: `edit-added-demo`. Below them, where the card reads from,
 * in a plain read-only field (owner, 2026-09-15): a different repository has to be read again
 * for its kind, codes and pages, which is what Add a demo package does, so the
 * way to move a card is to remove it and add the new link. GitHub renames are
 * followed on their own. The card changes on the Welcome step
 * through the settings push; the caller only learns the edited row, so a
 * selected card's row can follow. Settings only, so no confirmation.
 *
 * @module features/project-creation/ui/components/add-demo/EditDemoPackageModal
 */

import { TextArea, TextField } from '@adobe/react-spectrum';
import React, { useState } from 'react';
import { COPY } from './addDemoFlow';
import { FormDialog } from '@/core/ui/components/ui/FormDialog';
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
    title: 'Edit Demo Package',
    save: 'Save',
    failed: "Couldn't Save the Changes",
    fallback: 'Try again.',
    repository: 'GitHub Repository',
    repositoryWhy: 'To use a different repository, remove this demo package and add it again.',
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
        <FormDialog
            isOpen
            title={error ? EDIT_COPY.failed : EDIT_COPY.title}
            submitLabel={EDIT_COPY.save}
            onSubmit={() => void save()}
            submitDisabled={!name.trim()}
            submitPending={saving}
            failure={error ?? null}
            onClose={onClose}
        >
            <TextField label={COPY.nameLabel} value={name} onChange={setName} isRequired width="100%" />
            <TextArea label={COPY.descriptionLabel} value={description} onChange={setDescription} width="100%" />
            <TextField
                label={EDIT_COPY.repository}
                value={`https://github.com/${demo.source.owner}/${demo.source.repo}`}
                isReadOnly
                description={EDIT_COPY.repositoryWhy}
                width="100%"
            />
        </FormDialog>
    );
}

/**
 * Mounts the form only while a demo is being edited, so each opening starts from that demo's
 * saved words.
 *
 * @param props - the demo, and the close and saved callbacks
 * @returns the form, or nothing while no demo is being edited
 */
export function EditDemoPackageModal({ demo, ...rest }: EditDemoPackageModalProps): React.ReactElement | null {
    return demo ? <Journey demo={demo} {...rest} /> : null;
}
