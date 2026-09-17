/**
 * IntegrationsGrid — the dashboard integrations surface (integrations grid,
 * Step 7). Supersedes AppBuilderComponentsList + AppBuilderComponentRow +
 * MeshComponentRow: a calm card per integration with the mesh as a peer card
 * FIRST, the add tile as the last cell (it IS the empty state), and all detail
 * plus every non-face action in the slide-in detail drawer.
 *
 * The grid owns exactly one instance each of the drawer, the add modal, the
 * remove, reset and reinstall confirms, and the Manage-APIs modal (no per-card dialogs, no
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

import { Text } from '@adobe/react-spectrum';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AppBuilderComponentRemoveDialog } from '../AppBuilderComponentRemoveDialog';
import { ConfirmActionDialog } from '../ConfirmActionDialog';
import { ErpResetDialog } from '../ErpResetDialog';
import { ManageApisModal } from '../ManageApisModal';
import { type CardAction, type IntegrationCardModel } from './integrationCardModel';
import { IntegrationDetailPanel } from './IntegrationDetailPanel';
import { useReinstallPrompt } from './useReinstallPrompt';
import { IntegrationCard } from '@/core/ui/components/integrations/IntegrationCard';
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
 * Integration actions that are plain id-scoped posts. Retry rides Deploy;
 * Update has its own message, which fetches the newer code before it
 * redeploys (a redeploy alone deploys the folder as it is).
 */
const KEYED_MESSAGES: Partial<Record<CardAction, string>> = {
    deploy: 'deployAppBuilderComponent',
    retry: 'deployAppBuilderComponent',
    redeploy: 'redeployAppBuilderComponent',
    update: 'updateAppBuilderComponent',
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
    // The ERP reset awaiting confirmation: the INTEGRATION's id (the reset runs
    // through it) and the ERP's name (what the dialog says).
    const [pendingReset, setPendingReset] = useState<{ id: string; erpName: string } | null>(null);
    // The reinstall awaiting confirmation: it removes what the app set up in
    // Commerce before installing again.
    const [pendingReinstall, setPendingReinstall] = useState<{ id: string; name: string } | null>(null);

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
            // The bound system's verbs (the ERP): its screen, its reset (confirmed,
            // through the integration), its own redeploy by its own id.
            if (action === 'open-system') {
                // By the integration's id: the extension finds its ERP and adds the
                // screen key, which never reaches this webview.
                webviewClient.postMessage('openErpScreen', { id: model.id });
                return;
            }
            if (action === 'reset-system') {
                if (model.system) {
                    setPendingReset({ id: model.id, erpName: model.system.name });
                }
                return;
            }
            if (action === 'reinstall') {
                setPendingReinstall({ id: model.id, name: model.name });
                return;
            }
            if (action === 'redeploy-system') {
                if (model.system) {
                    webviewClient.postMessage('redeployAppBuilderComponent', { id: model.system.id });
                }
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
        if (target?.isMesh) {
            return 'Your storefront loses its API Mesh endpoint until you deploy a new mesh.';
        }
        // The pair is a unit (decision 2): removing the integration removes its
        // ERP. Its records outlive the undeploy in the workspace's database.
        if (target?.system) {
            return `Removes the integration and its ${target.system.name} too. The ERP's records stay in the workspace's database until a new ERP replaces them.`;
        }
        return undefined;
    }, [cards, pendingRemoveId]);

    const closeResetDialog = useCallback((): void => setPendingReset(null), []);
    const confirmReset = useCallback((): void => {
        if (pendingReset) {
            webviewClient.postMessage('resetErpRecords', { id: pendingReset.id });
        }
        setPendingReset(null);
    }, [pendingReset]);

    // An update Commerce refused to apply opens the confirm by itself; the
    // card's menu keeps offering it if the SC closes it.
    const promptReinstall = useCallback(
        (card: IntegrationCardModel): void => setPendingReinstall({ id: card.id, name: card.name }),
        [],
    );
    useReinstallPrompt(cards, promptReinstall);

    const closeReinstallDialog = useCallback((): void => setPendingReinstall(null), []);
    const confirmReinstall = useCallback((): void => {
        if (pendingReinstall) {
            webviewClient.postMessage('reinstallAppBuilderComponent', { id: pendingReinstall.id });
        }
        setPendingReinstall(null);
    }, [pendingReinstall]);

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
                at 450px (utilities.css). */}
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

            <ErpResetDialog
                isOpen={pendingReset !== null}
                erpName={pendingReset?.erpName ?? 'the ERP'}
                onConfirm={confirmReset}
                onClose={closeResetDialog}
            />

            <ConfirmActionDialog
                isOpen={pendingReinstall !== null}
                title="Reinstall in Commerce"
                actionLabel="Reinstall"
                onConfirm={confirmReinstall}
                onClose={closeReinstallDialog}
            >
                <Text>
                    Commerce would not upgrade <strong>{pendingReinstall?.name}</strong> in place. Reinstalling
                    removes it from Commerce, then installs the version already deployed.
                </Text>
                <Text>
                    Its webhooks and event subscriptions are set up again. Its saved settings may be reset
                    to their defaults.
                </Text>
            </ConfirmActionDialog>
        </div>
    );
}
