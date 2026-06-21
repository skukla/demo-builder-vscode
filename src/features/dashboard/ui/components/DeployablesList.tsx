/**
 * DeployablesList Component (D2 Track B — Step 05)
 *
 * The SEPARATE "integrations" surface on the dashboard. Renders one
 * {@link DeployableRow} per `kind:'integration'` entry in the project — the mesh
 * keeps its own badge and is EXCLUDED here (D3 owns mesh-UI unification). Adds an
 * "Add a deployable" affordance: the stack-filtered catalog picker plus a custom
 * GitHub-URL door (reusing the canonical {@link parseGitHubUrl} validator).
 *   - catalog choice → addDeployable {id}
 *   - custom URL     → addDeployable {source:{owner,repo}}
 *
 * @module features/dashboard/ui/components/DeployablesList
 */

import { View, Flex, Heading, Button, TextField, Text } from '@adobe/react-spectrum';
import React, { useState } from 'react';
import { DeployableRemoveDialog } from './DeployableRemoveDialog';
import { DeployableRow } from './DeployableRow';
import { webviewClient } from '@/core/ui/utils/WebviewClient';
import { parseGitHubUrl } from '@/core/utils/githubUrlParser';
import { listDeployables } from '@/features/app-builder/services/deployableState';
import type { Project } from '@/types';
import type { DeployableCatalogEntry } from '@/types/deployables';

export interface DeployablesListProps {
    project: Project;
    /** Stack-filtered catalog (getAvailableDeployables) for the add picker. */
    catalog: DeployableCatalogEntry[];
}

/** The add-a-deployable picker: catalog integration entries + custom-URL door. */
function AddDeployablePicker({ catalog }: { catalog: DeployableCatalogEntry[] }) {
    const [customUrl, setCustomUrl] = useState('');
    const parsed = parseGitHubUrl(customUrl.trim());

    const integrations = catalog.filter((entry) => entry.kind === 'integration');

    return (
        <Flex direction="column" gap="size-150">
            <Text>Choose a pre-built deployable:</Text>
            <Flex direction="column" gap="size-50">
                {integrations.map((entry) => (
                    <Button
                        key={entry.id}
                        variant="secondary"
                        onPress={() => webviewClient.postMessage('addDeployable', { id: entry.id })}
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
                        parsed && webviewClient.postMessage('addDeployable', {
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

/** The integrations list + add-a-deployable affordance. */
export function DeployablesList({ project, catalog }: DeployablesListProps) {
    const [showPicker, setShowPicker] = useState(false);
    // One dialog instance for the whole list; the pending id identifies the row
    // awaiting confirmation (avoids a per-row dialog + cross-row state leak).
    const [pendingRemoveId, setPendingRemoveId] = useState<string | null>(null);

    const integrations = listDeployables(project).filter((d) => d.kind === 'integration');

    const closeRemoveDialog = () => setPendingRemoveId(null);
    const confirmRemove = () => {
        if (pendingRemoveId) {
            webviewClient.postMessage('removeDeployable', { id: pendingRemoveId });
        }
        closeRemoveDialog();
    };

    return (
        <View>
            <Heading level={3}>Integrations</Heading>

            <Flex direction="column" gap="size-200">
                {integrations.map((deployable) => (
                    <DeployableRow
                        key={deployable.id}
                        deployable={deployable}
                        onRemove={() => setPendingRemoveId(deployable.id)}
                    />
                ))}
            </Flex>

            <DeployableRemoveDialog
                isOpen={pendingRemoveId !== null}
                deployableId={pendingRemoveId ?? ''}
                onConfirm={confirmRemove}
                onClose={closeRemoveDialog}
            />

            {showPicker ? (
                <AddDeployablePicker catalog={catalog} />
            ) : (
                <Flex>
                    <Button variant="primary" onPress={() => setShowPicker(true)}>
                        Add a deployable
                    </Button>
                </Flex>
            )}
        </View>
    );
}
