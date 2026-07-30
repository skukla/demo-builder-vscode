/**
 * AddIntegrationModal — the dashboard's add-integration surface (integrations
 * grid, Step 6). Hosts the SAME picker content and messages as the retiring
 * inline AddAppBuilderComponentPicker (AppBuilderComponentsList), lifted into
 * a DialogContainer + core Modal (the {@link ManageApisModal} hosting
 * pattern): the grid keeps ONE always-mounted instance and toggles `isOpen`.
 *
 *   - catalog `kind:'integration'` entry → addAppBuilderComponent {id}
 *   - custom GitHub URL (parseGitHubUrl-gated) → addAppBuilderComponent
 *     {source:{owner,repo}}
 *
 * Posting closes the modal (the new card arrives via the
 * appBuilderComponentsSnapshot push); Cancel closes without posting. The
 * picker body renders only while open, so the URL field resets between opens.
 *
 * @module features/dashboard/ui/components/integrations/AddIntegrationModal
 */

import { Button, DialogContainer, Flex, Text, TextField } from '@adobe/react-spectrum';
import React, { useState } from 'react';
import { Modal } from '@/core/ui/components/ui/Modal';
import { webviewClient } from '@/core/ui/utils/WebviewClient';
import { parseGitHubUrl } from '@/core/utils/githubUrlParser';
import type { AppBuilderComponentCatalogEntry } from '@/types/appBuilderComponents';

export interface AddIntegrationModalProps {
    /** Whether the modal is shown (the grid keeps ONE instance). */
    isOpen: boolean;
    /** Stack-filtered catalog (getAvailableAppBuilderComponents) for the picker. */
    catalog: AppBuilderComponentCatalogEntry[];
    /** Called on Cancel/dismiss and after a choice is posted. */
    onClose: () => void;
}

/** The picker body: catalog integration entries + the custom GitHub-URL door. */
function AddIntegrationPicker({
    catalog,
    onClose,
}: {
    catalog: AppBuilderComponentCatalogEntry[];
    onClose: () => void;
}): React.ReactElement {
    const [customUrl, setCustomUrl] = useState('');
    const parsed = parseGitHubUrl(customUrl.trim());

    const integrations = catalog.filter((entry) => entry.kind === 'integration');

    const addCatalogEntry = (id: string): void => {
        webviewClient.postMessage('addAppBuilderComponent', { id });
        onClose();
    };

    const addCustomSource = (): void => {
        if (!parsed) {
            return;
        }
        webviewClient.postMessage('addAppBuilderComponent', {
            source: { owner: parsed.owner, repo: parsed.repo },
        });
        onClose();
    };

    return (
        <Flex direction="column" gap="size-150">
            <Text>Choose a pre-built App Builder component:</Text>
            <Flex direction="column" gap="size-50">
                {integrations.map((entry) => (
                    <Button
                        key={entry.id}
                        variant="secondary"
                        onPress={() => addCatalogEntry(entry.id)}
                    >
                        {entry.name}
                    </Button>
                ))}
            </Flex>
            <Text>…or add one from a public GitHub repository:</Text>
            <TextField
                label="Custom GitHub URL"
                placeholder="https://github.com/owner/repo"
                value={customUrl}
                onChange={setCustomUrl}
                width="100%"
            />
            <Flex>
                <Button variant="primary" isDisabled={!parsed} onPress={addCustomSource}>
                    Add
                </Button>
            </Flex>
        </Flex>
    );
}

/** The add-integration modal: DialogContainer + core Modal around the picker. */
export function AddIntegrationModal({
    isOpen,
    catalog,
    onClose,
}: AddIntegrationModalProps): React.ReactElement {
    return (
        <DialogContainer onDismiss={onClose}>
            {isOpen && (
                <Modal title="Add Integration" size="M" onClose={onClose} closeLabel="Cancel">
                    <AddIntegrationPicker catalog={catalog} onClose={onClose} />
                </Modal>
            )}
        </DialogContainer>
    );
}
