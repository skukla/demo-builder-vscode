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
 *   - integration  → deploy/redeploy {id}, or the
 *                    hosted dialogs for remove / manage-apis
 *   - open         → openLiveSite {url} (both card face and drawer link)
 *
 * Card models come from {@link buildIntegrationCards} / {@link deriveMeshCard}
 * and are re-derived every render, so an open drawer stays live as pushes
 * arrive and closes by itself when its card leaves the map.
 *
 * @module features/dashboard/ui/components/integrations/IntegrationsGrid
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AppBuilderComponentRemoveDialog } from '../AppBuilderComponentRemoveDialog';
import { ManageApisModal } from '../ManageApisModal';
import { type CardAction, type IntegrationCardModel } from './integrationCardModel';
import { IntegrationDetailPanel } from './IntegrationDetailPanel';
import { IntegrationCard } from '@/core/ui/components/integrations';
import { webviewClient } from '@/core/ui/utils/WebviewClient';

export interface IntegrationsGridProps {
    /**
     * The cards to render, already derived and filtered. Derivation lives in the
     * SCREEN (same split as ProjectsDashboard → ProjectsGrid: the screen owns and
     * filters the data, the grid renders it), so the screen can count and filter
     * without a second source of truth.
     */
    cards: IntegrationCardModel[];
    /** Mesh callbacks — the mesh card routes here, never to the keyed messages. */
    onDeployMesh?: () => void;
    /** User-initiated re-auth for the mesh needs-auth state. */
    onReAuthenticate?: () => void;
    /**
     * Shared deploy destination ("<project> · <workspace>"), shown as a row in
     * the detail panel. The page header names it once above the grid.
     */
    destinationLabel?: string;
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
    // Re-run the Commerce install pass WITHOUT a redeploy (AB-5) — until this,
    // the only retry for a failed install was a full deploy round.
    install: 'installAppBuilderComponent',
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
    cards,
    onDeployMesh,
    onReAuthenticate,
    destinationLabel,
}: IntegrationsGridProps): React.ReactElement {
    const [selectedId, setSelectedId] = useState<string | null>(null);
    // One dialog/modal instance for the whole grid; the pending id identifies
    // the card awaiting confirmation (no per-card dialog, no state leak).
    const [pendingRemoveId, setPendingRemoveId] = useState<string | null>(null);
    // Both halves: the id scopes the write, the name is what the copy says. This
    // used to hold the id alone and pass it as `componentName`, so the modal read
    // "Manage Adobe API access for erp-sync".
    const [manageApis, setManageApis] = useState<{ id: string; name: string } | null>(null);

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
            // Remove is checked BEFORE the mesh branch. handleMeshAction treats
            // every verb it receives as "deploy", so a mesh Remove routed there
            // would DEPLOY the mesh — the exact opposite of the asked-for action.
            if (action === 'remove') {
                setPendingRemoveId(model.componentId ?? model.id);
                return;
            }
            if (model.isMesh) {
                handleMeshAction(action);
                return;
            }
            if (action === 'manage-apis') {
                setManageApis({ id: model.componentId ?? model.id, name: model.name });
                return;
            }
            const message = KEYED_MESSAGES[action];
            if (message) {
                webviewClient.postMessage(message, { id: model.id });
            }
        },
        [handleMeshAction],
    );

    // The mesh's teardown reaches past itself: removeAppBuilderComponent
    // regenerates the storefront config WITHOUT the MESH_ENDPOINT it provided, so
    // the storefront has no data layer until a mesh is deployed again. That is the
    // honest consequence of the verb, and it belongs in front of the click.
    const removeConsequence = useMemo((): string | undefined => {
        const target = cards.find((card) => (card.componentId ?? card.id) === pendingRemoveId);
        return target?.isMesh
            ? 'Your storefront loses its API Mesh endpoint until you deploy a new mesh.'
            : undefined;
    }, [cards, pendingRemoveId]);

    const closeRemoveDialog = useCallback((): void => setPendingRemoveId(null), []);
    const confirmRemove = useCallback((): void => {
        if (pendingRemoveId) {
            webviewClient.postMessage('removeAppBuilderComponent', { id: pendingRemoveId });
        }
        setPendingRemoveId(null);
    }, [pendingRemoveId]);

    return (
        // No section heading, count, or Add button here: the SCREEN's page header
        // and sticky action band own those (the same division ProjectsDashboard
        // uses). This component is the card surface only.
        <div className="integrations-surface">
            {/* The grid owns the full width; the detail FLYOUT overlays it rather
                than taking a column beside it. Plain divs — a Spectrum Flex caps
                at 450px (custom-spectrum.css). */}
            <div className="integrations-grid">
                {cards.map((model) => (
                    <IntegrationCard
                        key={model.id}
                        model={model}
                        onOpen={setSelectedId}
                        onAction={handleAction}
                        onRename={requestRename}
                    />
                ))}
            </div>

            <IntegrationDetailPanel
                model={selected}
                onClose={() => setSelectedId(null)}
                onAction={handleAction}
                onRename={requestRename}
                destinationLabel={destinationLabel}
            />

            <AppBuilderComponentRemoveDialog
                isOpen={pendingRemoveId !== null}
                appBuilderComponentId={pendingRemoveId ?? ''}
                consequence={removeConsequence}
                onConfirm={confirmRemove}
                onClose={closeRemoveDialog}
            />

            <ManageApisModal
                isOpen={manageApis !== null}
                componentId={manageApis?.id}
                componentName={manageApis?.name ?? ''}
                onClose={() => setManageApis(null)}
            />
        </div>
    );
}
