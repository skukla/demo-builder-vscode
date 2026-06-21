/**
 * AppBuilderComponentsList Component (D2 Track B — Step 05)
 *
 * The SEPARATE "integrations" surface on the dashboard. Renders one
 * {@link AppBuilderComponentRow} per `kind:'integration'` entry in the project — the mesh
 * keeps its own badge and is EXCLUDED here (D3 owns mesh-UI unification). Adds an
 * "Add an App Builder component" affordance: the stack-filtered catalog picker plus a custom
 * GitHub-URL door (reusing the canonical {@link parseGitHubUrl} validator).
 *   - catalog choice → addAppBuilderComponent {id}
 *   - custom URL     → addAppBuilderComponent {source:{owner,repo}}
 *
 * @module features/dashboard/ui/components/AppBuilderComponentsList
 */

import { View, Flex, Heading, Button, TextField, Text } from '@adobe/react-spectrum';
import React, { useState } from 'react';
import { AppBuilderComponentRemoveDialog } from './AppBuilderComponentRemoveDialog';
import { AppBuilderComponentRow } from './AppBuilderComponentRow';
import { webviewClient } from '@/core/ui/utils/WebviewClient';
import { parseGitHubUrl } from '@/core/utils/githubUrlParser';
import { listAppBuilderComponents } from '@/features/app-builder/services/appBuilderComponentState';
import type { Project } from '@/types';
import type { AppBuilderComponentCatalogEntry } from '@/types/appBuilderComponents';

export interface AppBuilderComponentsListProps {
    project: Project;
    /** Stack-filtered catalog (getAvailableAppBuilderComponents) for the add picker. */
    catalog: AppBuilderComponentCatalogEntry[];
}

/** The add-a-appBuilderComponent picker: catalog integration entries + custom-URL door. */
function AddAppBuilderComponentPicker({ catalog }: { catalog: AppBuilderComponentCatalogEntry[] }) {
    const [customUrl, setCustomUrl] = useState('');
    const parsed = parseGitHubUrl(customUrl.trim());

    const integrations = catalog.filter((entry) => entry.kind === 'integration');

    return (
        <Flex direction="column" gap="size-150">
            <Text>Choose a pre-built App Builder component:</Text>
            <Flex direction="column" gap="size-50">
                {integrations.map((entry) => (
                    <Button
                        key={entry.id}
                        variant="secondary"
                        onPress={() => webviewClient.postMessage('addAppBuilderComponent', { id: entry.id })}
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
                <Button
                    variant="primary"
                    isDisabled={!parsed}
                    onPress={() =>
                        parsed && webviewClient.postMessage('addAppBuilderComponent', {
                            source: { owner: parsed.owner, repo: parsed.repo },
                        })
                    }
                >
                    Add
                </Button>
            </Flex>
        </Flex>
    );
}

/** The integrations list + add-a-appBuilderComponent affordance. */
export function AppBuilderComponentsList({ project, catalog }: AppBuilderComponentsListProps) {
    const [showPicker, setShowPicker] = useState(false);
    // One dialog instance for the whole list; the pending id identifies the row
    // awaiting confirmation (avoids a per-row dialog + cross-row state leak).
    const [pendingRemoveId, setPendingRemoveId] = useState<string | null>(null);

    const integrations = listAppBuilderComponents(project).filter((d) => d.kind === 'integration');

    const closeRemoveDialog = () => setPendingRemoveId(null);
    const confirmRemove = () => {
        if (pendingRemoveId) {
            webviewClient.postMessage('removeAppBuilderComponent', { id: pendingRemoveId });
        }
        closeRemoveDialog();
    };

    return (
        <View>
            <Heading level={3}>Integrations</Heading>

            <Flex direction="column" gap="size-200">
                {integrations.map((appBuilderComponent) => (
                    <AppBuilderComponentRow
                        key={appBuilderComponent.id}
                        appBuilderComponent={appBuilderComponent}
                        onRemove={() => setPendingRemoveId(appBuilderComponent.id)}
                    />
                ))}
            </Flex>

            <AppBuilderComponentRemoveDialog
                isOpen={pendingRemoveId !== null}
                appBuilderComponentId={pendingRemoveId ?? ''}
                onConfirm={confirmRemove}
                onClose={closeRemoveDialog}
            />

            {showPicker ? (
                <AddAppBuilderComponentPicker catalog={catalog} />
            ) : (
                <Flex>
                    <Button variant="primary" onPress={() => setShowPicker(true)}>
                        Add an App Builder component
                    </Button>
                </Flex>
            )}
        </View>
    );
}
