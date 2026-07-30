/**
 * IntegrationsGrid — the dashboard integrations surface (integrations grid,
 * Step 7). Supersedes AppBuilderComponentsList + AppBuilderComponentRow +
 * MeshComponentRow: a calm card per integration with the mesh as a peer card
 * FIRST, the add tile as the last cell (it IS the empty state), and all detail
 * plus every non-face action in the slide-in detail drawer.
 *
 * The grid owns exactly one instance each of the drawer, the add modal, the
 * remove-confirm dialog, and the Manage-APIs modal (no per-card dialogs, no
 * cross-card state leak), and ONE `handleAction` switch — the single place a
 * card model turns into an id-scoped message or a mesh callback:
 *   - mesh card    → onDeployMesh / onReAuthenticate (never keyed messages)
 *   - integration  → deploy/redeploy/verifyAppBuilderComponent {id}, or the
 *                    hosted dialogs for remove / manage-apis
 *   - open         → openLiveSite {url} (both card face and drawer link)
 *
 * Card models come from {@link buildIntegrationCards} / {@link deriveMeshCard}
 * and are re-derived every render, so an open drawer stays live as pushes
 * arrive and closes by itself when its card leaves the map.
 *
 * @module features/dashboard/ui/components/integrations/IntegrationsGrid
 */

import { Button, Heading } from '@adobe/react-spectrum';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import type { MeshStatus, StatusDisplay } from '../../hooks/useDashboardStatus';
import { useLiveAppBuilderComponents } from '../../hooks/useLiveAppBuilderComponents';
import { useRowStatusOverrides } from '../../hooks/useRowStatusOverrides';
import { AppBuilderComponentRemoveDialog } from '../AppBuilderComponentRemoveDialog';
import { ManageApisModal } from '../ManageApisModal';
import { AddIntegrationModal } from './AddIntegrationModal';
import { IntegrationCard } from './IntegrationCard';
import {
    buildIntegrationCards,
    deriveMeshCard,
    type CardAction,
    type IntegrationCardModel,
} from './integrationCardModel';
import { IntegrationDrawer } from './IntegrationDrawer';
import { webviewClient } from '@/core/ui/utils/WebviewClient';
import {
    getMeshAppBuilderComponent,
    listAppBuilderComponents,
} from '@/features/app-builder/services/appBuilderComponentState';
import type { Project } from '@/types';
import type { AppBuilderComponentCatalogEntry } from '@/types/appBuilderComponents';
import type { AppBuilderComponentState } from '@/types/base';

export interface IntegrationsGridProps {
    /** Keyed persisted component map (seed; snapshot pushes supersede it). */
    appBuilderComponents?: Record<string, AppBuilderComponentState>;
    /** Stack-filtered catalog (getAvailableAppBuilderComponents). */
    catalog: AppBuilderComponentCatalogEntry[];
    /** Live mesh status display. Non-null ⇒ the mesh card renders. */
    meshStatusDisplay?: StatusDisplay | null;
    /** Raw mesh status — drives the mesh card's face/bar action. */
    meshStatus?: MeshStatus;
    /** Disables the mesh card's actions while an operation is in flight. */
    isMeshActionDisabled?: boolean;
    /** The existing mesh deploy path (posts 'deployMesh'). */
    onDeployMesh?: () => void;
    /** User-initiated re-auth for the mesh needs-auth state. */
    onReAuthenticate?: () => void;
}

/**
 * Integration actions that are plain id-scoped posts. Update rides Redeploy
 * (a redeploy pulls the latest source) and Retry rides Deploy — the same
 * mapping the retired rows used.
 */
const KEYED_MESSAGES: Partial<Record<CardAction, string>> = {
    deploy: 'deployAppBuilderComponent',
    retry: 'deployAppBuilderComponent',
    redeploy: 'redeployAppBuilderComponent',
    update: 'redeployAppBuilderComponent',
    verify: 'verifyAppBuilderComponent',
};

/**
 * Commit an in-drawer rename. Mirrors the InlineRenameField contract
 * (null = success, string = inline error); the payload `name` makes the
 * handler skip its input box and round-trip validation errors.
 */
async function requestRename(id: string, name: string): Promise<string | null> {
    try {
        const response = await webviewClient.request<{ success: boolean; error?: string }>(
            'renameAppBuilderComponent',
            { id, name },
        );
        return response?.success ? null : (response?.error ?? 'Rename failed');
    } catch (error) {
        return error instanceof Error ? error.message : 'Rename failed';
    }
}

/** The integrations card grid + its hosted drawer, modals, and confirm dialog. */
export function IntegrationsGrid({
    appBuilderComponents,
    catalog,
    meshStatusDisplay,
    meshStatus,
    isMeshActionDisabled,
    onDeployMesh,
    onReAuthenticate,
}: IntegrationsGridProps): React.ReactElement {
    const components = useLiveAppBuilderComponents(appBuilderComponents);
    const overrides = useRowStatusOverrides();

    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [addOpen, setAddOpen] = useState(false);
    // One dialog/modal instance for the whole grid; the pending id identifies
    // the card awaiting confirmation (no per-card dialog, no state leak).
    const [pendingRemoveId, setPendingRemoveId] = useState<string | null>(null);
    const [manageApisId, setManageApisId] = useState<string | null>(null);

    const cards = useMemo((): IntegrationCardModel[] => {
        const project = { appBuilderComponents: components } as Project;
        const integrationCards = buildIntegrationCards(
            listAppBuilderComponents(project),
            overrides,
            catalog,
        );
        if (!meshStatusDisplay) {
            return integrationCards;
        }
        const meshCard = deriveMeshCard(
            meshStatusDisplay,
            meshStatus,
            getMeshAppBuilderComponent(project),
            Boolean(isMeshActionDisabled),
        );
        return [meshCard, ...integrationCards];
    }, [components, overrides, catalog, meshStatusDisplay, meshStatus, isMeshActionDisabled]);

    // Looked up fresh each render: the open drawer tracks live pushes, and a
    // card that left the map closes it.
    const selected = cards.find((card) => card.id === selectedId);

    // Drop a stale selection so a later card reusing that id cannot spring the
    // drawer open unbidden (remove-then-re-add the same catalog entry).
    useEffect(() => {
        if (selectedId !== null && !cards.some((card) => card.id === selectedId)) {
            setSelectedId(null);
        }
    }, [cards, selectedId]);

    const handleMeshAction = useCallback(
        (action: CardAction): void => {
            if (action === 'sign-in') {
                onReAuthenticate?.();
                return;
            }
            onDeployMesh?.();
        },
        [onDeployMesh, onReAuthenticate],
    );

    const handleAction = useCallback(
        (model: IntegrationCardModel, action: CardAction): void => {
            if (action === 'open') {
                if (model.url) {
                    webviewClient.postMessage('openLiveSite', { url: model.url });
                }
                return;
            }
            if (model.isMesh) {
                handleMeshAction(action);
                return;
            }
            if (action === 'remove') {
                setPendingRemoveId(model.id);
                return;
            }
            if (action === 'manage-apis') {
                setManageApisId(model.id);
                return;
            }
            const message = KEYED_MESSAGES[action];
            if (message) {
                webviewClient.postMessage(message, { id: model.id });
            }
        },
        [handleMeshAction],
    );

    const closeRemoveDialog = useCallback((): void => setPendingRemoveId(null), []);
    const confirmRemove = useCallback((): void => {
        if (pendingRemoveId) {
            webviewClient.postMessage('removeAppBuilderComponent', { id: pendingRemoveId });
        }
        setPendingRemoveId(null);
    }, [pendingRemoveId]);

    const openAdd = useCallback((): void => setAddOpen(true), []);

    return (
        // Stretches inside the flex `.dashboard-grid-container` (shared with the
        // ActionGrid, so the stretch lives here): a flex child sizes to its
        // INTRINSIC width by default, which collapses the grid's
        // repeat(auto-fill, minmax(268px, 1fr)) tracks to a single column.
        <div className="integrations-surface">
            <div className="integrations-header">
                <Heading level={3}>Integrations</Heading>
                <span className="integration-count" data-testid="integration-count">
                    {cards.length}
                </span>
                <Button variant="primary" data-testid="integration-add-header" onPress={openAdd}>
                    Add integration
                </Button>
            </div>

            {/* Plain divs: a Spectrum Flex caps at 450px (see custom-spectrum.css). */}
            <div className="integrations-grid">
                {cards.map((model) => (
                    <IntegrationCard
                        key={model.id}
                        model={model}
                        onOpen={setSelectedId}
                        onAction={handleAction}
                    />
                ))}
                <button
                    type="button"
                    className="integration-add-tile"
                    data-testid="integration-add-tile"
                    onClick={openAdd}
                >
                    + Add integration
                </button>
            </div>

            <IntegrationDrawer
                model={selected}
                onClose={() => setSelectedId(null)}
                onAction={handleAction}
                onRename={requestRename}
            />

            <AddIntegrationModal
                isOpen={addOpen}
                catalog={catalog}
                onClose={() => setAddOpen(false)}
            />

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
        </div>
    );
}
