/**
 * AppBuilderComponentsList Component (D2 Track B — Step 05; mesh folded in by
 * ADR-011 D3 Step 08)
 *
 * The "integrations" surface on the dashboard. Renders the mesh FIRST via the
 * injected `meshRow` slot (a {@link MeshComponentRow} supplied by
 * {@link IntegrationsBlock} — its status/actions ride the mesh channels, not
 * the keyed messages), then one {@link AppBuilderComponentRow} per
 * `kind:'integration'` entry. Integration rows stay live via the
 * `appBuilderComponentStatusUpdate` per-id overrides. Adds an
 * "Add an App Builder component" affordance: the stack-filtered catalog picker plus a custom
 * GitHub-URL door (reusing the canonical {@link parseGitHubUrl} validator).
 *   - catalog choice → addAppBuilderComponent {id}
 *   - custom URL     → addAppBuilderComponent {source:{owner,repo}}
 *
 * @module features/dashboard/ui/components/AppBuilderComponentsList
 */

import { View, Flex, Heading, Button, TextField, Text } from '@adobe/react-spectrum';
import React, { useEffect, useState } from 'react';
import { AppBuilderComponentRemoveDialog } from './AppBuilderComponentRemoveDialog';
import { AppBuilderComponentRow } from './AppBuilderComponentRow';
import { ManageApisModal } from './ManageApisModal';
import { webviewClient } from '@/core/ui/utils/WebviewClient';
import { parseGitHubUrl } from '@/core/utils/githubUrlParser';
import { listAppBuilderComponents } from '@/features/app-builder/services/appBuilderComponentState';
import type { Project } from '@/types';
import type { AppBuilderComponentCatalogEntry } from '@/types/appBuilderComponents';

export interface AppBuilderComponentsListProps {
    project: Project;
    /** Stack-filtered catalog (getAvailableAppBuilderComponents) for the add picker. */
    catalog: AppBuilderComponentCatalogEntry[];
    /**
     * The mesh's row, rendered FIRST (D3 Step 08: mesh is one deployable in the
     * list, not a masthead badge). Undefined when the project has no mesh.
     */
    meshRow?: React.ReactNode;
}

/** Live per-row status override pushed via `appBuilderComponentStatusUpdate`. */
interface RowStatusOverride {
    status: string;
    message?: string;
    /** Update-borne display name (rename pushes it; deploy pushes omit it). */
    name?: string;
}

/**
 * Subscribe to the per-id `appBuilderComponentStatusUpdate` channel and merge
 * each update into an id-keyed override map, so a deploy flips ONLY its own
 * row (deploying spinner → deployed/error) without re-seeding the whole list.
 * A rename rides the same channel with the entry's current status plus the new
 * `name`, refreshing the row label (the init-seeded map never re-delivers).
 */
function useRowStatusOverrides(): Record<string, RowStatusOverride> {
    const [overrides, setOverrides] = useState<Record<string, RowStatusOverride>>({});

    useEffect(() => {
        return webviewClient.onMessage('appBuilderComponentStatusUpdate', (data: unknown) => {
            const payload = data as {
                id?: string;
                status?: string;
                message?: string;
                name?: string;
            };
            if (!payload?.id || !payload?.status) {
                return;
            }
            const { id, status, message, name } = payload;
            // Merge, don't replace: deploy pushes omit `name`, and a wholesale
            // replace would wipe a prior rename's update-borne label.
            setOverrides((prev) => ({
                ...prev,
                [id]: { status, message, name: name ?? prev[id]?.name },
            }));
        });
    }, []);

    return overrides;
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
                        onPress={() =>
                            webviewClient.postMessage('addAppBuilderComponent', { id: entry.id })
                        }
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
                        parsed &&
                        webviewClient.postMessage('addAppBuilderComponent', {
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

/** The integrations list (mesh row first) + add-a-appBuilderComponent affordance. */
export function AppBuilderComponentsList({ project, catalog, meshRow }: AppBuilderComponentsListProps) {
    const [showPicker, setShowPicker] = useState(false);
    // One dialog instance for the whole list; the pending id identifies the row
    // awaiting confirmation (avoids a per-row dialog + cross-row state leak).
    const [pendingRemoveId, setPendingRemoveId] = useState<string | null>(null);
    // Same single-shared-modal pattern for Manage APIs: one instance for the
    // whole list, keyed by the row id whose API access is being managed.
    const [manageApisId, setManageApisId] = useState<string | null>(null);
    // Live per-id row statuses (deploying → deployed/error) — the mesh row is
    // NOT in this map; it rides the mesh status channels via the meshRow slot.
    const rowOverrides = useRowStatusOverrides();

    const integrations = listAppBuilderComponents(project).filter((d) => d.kind === 'integration');
    const isEmpty = !meshRow && integrations.length === 0;

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
                {meshRow}
                {integrations.map((appBuilderComponent) => {
                    const override = rowOverrides[appBuilderComponent.id];
                    // The widened live status ('deploying') is rendered by the
                    // row's internal string switch; the cast bridges the
                    // persisted union to the live vocabulary. An update-borne
                    // name (rename) replaces the seeded label; name-less pushes
                    // (deploys) keep the persisted one.
                    const merged = override
                        ? {
                              ...appBuilderComponent,
                              status: override.status as typeof appBuilderComponent.status,
                              ...(override.name !== undefined ? { name: override.name } : {}),
                          }
                        : appBuilderComponent;
                    return (
                        <AppBuilderComponentRow
                            key={appBuilderComponent.id}
                            appBuilderComponent={merged}
                            message={override?.message}
                            onRemove={() => setPendingRemoveId(appBuilderComponent.id)}
                            onManageApis={() => setManageApisId(appBuilderComponent.id)}
                        />
                    );
                })}
                {isEmpty && <Text>No integrations yet.</Text>}
            </Flex>

            <AppBuilderComponentRemoveDialog
                isOpen={pendingRemoveId !== null}
                appBuilderComponentId={pendingRemoveId ?? ''}
                onConfirm={confirmRemove}
                onClose={closeRemoveDialog}
            />

            <ManageApisModal
                isOpen={manageApisId !== null}
                componentName={manageApisId ?? ''}
                onClose={() => setManageApisId(null)}
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
