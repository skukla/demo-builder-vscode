/**
 * IntegrationsGrid — the dashboard integrations surface (integrations grid,
 * Step 7). Supersedes AppBuilderComponentsList + AppBuilderComponentRow +
 * MeshComponentRow: a calm card per integration with the mesh as a peer card
 * FIRST, the add tile as the last cell (it IS the empty state), and all detail
 * plus every non-face action in the slide-in detail drawer.
 *
 * The grid owns exactly one instance each of the drawer, the remove-confirm
 * dialog and the Manage-APIs modal (no per-card dialogs, no cross-card state
 * leak), and ONE `handleAction` switch — the single place a card model turns into
 * an operation or a mesh callback. The operation progress modal is the SCREEN's,
 * because it must also open for an Add on a screen with no grid yet:
 *   - mesh card    → onDeployMesh / onReAuthenticate (never keyed messages)
 *   - integration  → an operation through the screen's `operations` (deploy,
 *                    redeploy, update, install, and remove once confirmed), which
 *                    opens the progress modal; or the Manage-APIs modal
 *   - open         → openLiveSite {url} (both card face and drawer link)
 *
 * Card models come from {@link buildIntegrationCards} / {@link deriveMeshCard}
 * and are re-derived every render, so an open drawer stays live as pushes
 * arrive and closes by itself when its card leaves the map.
 *
 * @module features/dashboard/ui/components/integrations/IntegrationsGrid
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import type { ComponentOperationControls } from '../../hooks/useComponentOperation';
import { AppBuilderComponentRemoveDialog } from '../AppBuilderComponentRemoveDialog';
import { ManageApisModal } from '../ManageApisModal';
import { type CardAction, type IntegrationCardModel } from './integrationCardModel';
import { IntegrationDetailPanel } from './IntegrationDetailPanel';
import { requestRename } from './requestRename';
import { IntegrationCard } from '@/core/ui/components/integrations/IntegrationCard';
import { IntegrationRow } from '@/core/ui/components/integrations/IntegrationRow';
import type { ViewMode } from '@/core/ui/components/navigation/SearchHeader';
import { webviewClient } from '@/core/ui/utils/WebviewClient';

export interface IntegrationsGridProps {
    /**
     * The cards to render, already derived and filtered. Derivation lives in the
     * SCREEN (same split as ProjectsDashboard → ProjectsGrid: the screen owns and
     * filters the data, the grid renders it), so the screen can count and filter
     * without a second source of truth.
     */
    cards: IntegrationCardModel[];
    /** Cards (the default) or rows: same models, drawer and actions; only each item's shape changes. */
    viewMode?: ViewMode;
    /** Mesh callbacks — the mesh card routes here, never to the keyed messages. */
    onDeployMesh?: () => void;
    /** User-initiated re-auth for the mesh needs-auth state. */
    onReAuthenticate?: () => void;
    /**
     * Shared deploy destination ("<project> · <workspace>"), shown as a row in
     * the detail panel. The page header names it once above the grid.
     */
    destinationLabel?: string;
    /**
     * The screen's operation controls (PL-59). The screen owns them because its Add
     * flow starts operations too, and both must open the same progress modal.
     */
    operations: ComponentOperationControls;
}

/** The integrations card grid + its hosted drawer, modals, and confirm dialog. */
export function IntegrationsGrid({
    cards,
    viewMode = 'cards',
    onDeployMesh,
    onReAuthenticate,
    destinationLabel,
    operations,
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
            // The Commerce-install row's link. Reuses the dashboard tile's own
            // message: the extension side resolves the admin URL per flavor
            // (explicit PaaS field or derived ACCS tenant URL) and already
            // offers a jump to Configure when it cannot.
            if (action === 'open-admin') {
                webviewClient.postMessage('openAdminPanel', {});
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
            operations.run(model.id, model.name, action);
        },
        [handleMeshAction, operations],
    );

    // A tile whose operation started here and is still running reopens its progress
    // modal; any other tile opens its flyout.
    const openCard = useCallback(
        (id: string): void => {
            // An operation is keyed by the COMPONENT id; the mesh card's own id is
            // 'mesh', so the lookup goes through componentId.
            const card = cards.find((candidate) => candidate.id === id);
            const componentId = card?.componentId ?? id;
            if (card?.status === 'deploying' && operations.reopen(componentId)) return;
            setSelectedId(id);
        },
        [cards, operations],
    );


    // The mesh's teardown reaches past itself: removeAppBuilderComponent
    // regenerates the storefront config WITHOUT the MESH_ENDPOINT it provided, so
    // the storefront has no data layer until a mesh is deployed again. That is the
    // honest consequence of the verb, and it belongs in front of the click.
    const pendingRemove = useMemo(
        () => cards.find((card) => (card.componentId ?? card.id) === pendingRemoveId),
        [cards, pendingRemoveId],
    );
    const removeConsequence = pendingRemove?.isMesh
        ? 'Your storefront loses its API Mesh endpoint until you deploy a new mesh.'
        : undefined;

    const Item = viewMode === 'rows' ? IntegrationRow : IntegrationCard;
    const closeRemoveDialog = useCallback((): void => setPendingRemoveId(null), []);
    const confirmRemove = useCallback((): void => {
        if (pendingRemoveId) {
            operations.run(pendingRemoveId, pendingRemove?.name ?? pendingRemoveId, 'remove');
        }
        setPendingRemoveId(null);
    }, [operations, pendingRemove, pendingRemoveId]);

    return (
        // No section heading, count, or Add button here: the SCREEN's page header
        // and sticky action band own those (the same division ProjectsDashboard
        // uses). This component is the card surface only.
        <div className="integrations-surface">
            {/* The grid owns the full width; the detail FLYOUT overlays it rather
                than taking a column beside it. Plain divs — a Spectrum Flex caps
                at 450px (utilities.css). */}
            {/* Cards or rows: the same models and handlers, one item component or the other. */}
            <div className={viewMode === 'rows' ? 'integration-row-list' : 'integrations-grid'}>
                {cards.map((model) => (
                    <Item
                        key={model.id}
                        model={model}
                        onOpen={openCard}
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
                componentName={pendingRemove?.name ?? pendingRemoveId ?? ''}
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
