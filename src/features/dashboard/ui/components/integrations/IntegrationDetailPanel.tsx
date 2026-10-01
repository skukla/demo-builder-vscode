/**
 * IntegrationDetailPanel — the detail FLYOUT over the grid.
 *
 * Hosted by the {@link Drawer} primitive: a viewport-fixed right panel with a
 * scrim, Esc-to-close, and a focus trap. That is the original grid prototype's
 * treatment, and it is right HERE because this surface is nothing but the
 * integrations grid — the flyout covers only its own page.
 *
 * (It briefly shipped as a sticky page-scoped panel beside the grid. That was
 * the correct call while the grid lived in a dashboard SUBSECTION, where a
 * viewport drawer covered the whole webview to show one card; it stopped being
 * the right call once the grid owned the surface. See decision 1 in
 * `.rptc/plans/integrations-surface/overview.md`.)
 *
 * The CONTENT is host-independent — key/value rows that render only when their
 * datum exists, the emphasis→variant action bar, rename-in-place when
 * `model.canRename` — which is exactly why swapping the host back cost nothing
 * and the model and its matrices stayed untouched.
 *
 * What an SC uses, in the order they use it (owner, 2026-10-01, after three passes on a
 * mockup): the health line under the title, then "Connected to", then the Demo setup
 * section, then the Actions — visible as a list, because a kebab is easy to miss. The
 * header carries no kebab of its own; the list is the flyout's menu. The mesh keeps its
 * Commerce scope and its endpoint, the one address an SC copies. Source repo, app URL,
 * APIs, deployed endpoints, deploy time and install version are not on screen: an agent
 * reads them through the extension's tools, support works from Diagnostics and the
 * Debug Logs. What an ERP holds is on its own home screen, so its flyout is short.
 *
 * @module features/dashboard/ui/components/integrations/IntegrationDetailPanel
 */

import { ActionButton, Link } from '@adobe/react-spectrum';
import Close from '@spectrum-icons/workflow/Close';
import React from 'react';
import { FlyoutActions } from './FlyoutActions';
import type { CardAction, IntegrationCardModel } from './integrationCardModel';
import { LinkedSection } from './LinkedSection';
import { PanelRow } from './PanelRow';
import { SetupChecklistSection } from './SetupChecklistSection';
import { InlineRenameField } from '@/core/ui/components/forms/InlineRenameField';
import { CommerceScopeList } from '@/core/ui/components/integrations/CommerceScopeList';
import { IntegrationStatusLabel } from '@/core/ui/components/integrations/IntegrationStatusLabel';
import { CopyableText } from '@/core/ui/components/ui/CopyableText';
import { Drawer } from '@/core/ui/components/ui/Drawer';

export interface IntegrationDetailPanelProps {
    /** The selected card's model, or undefined while no card is selected. */
    model: IntegrationCardModel | undefined;
    /** ✕ / scrim / Esc → the grid clears its selection. */
    onClose: () => void;
    /** A linked card's name → the grid selects that card instead. */
    onOpenLinked: (id: string) => void;
    /** Bar buttons and the URL link → the grid's single handleAction switch. */
    onAction: (model: IntegrationCardModel, action: CardAction) => void;
    /** Rename commit: resolve null on success, an error string for inline display. */
    onRename: (id: string, name: string) => Promise<string | null>;
}

interface RowsProps {
    model: IntegrationCardModel;
    onAction: (model: IntegrationCardModel, action: CardAction) => void;
}

/**
 * Health in one line under the title: the deploy status, and on an App Management app
 * the Commerce install beside it. When either needs attention, the reason and the fix
 * sit under it — the deploy's live message, or the failed install's hands-back line and
 * "Finish install" (the idempotent pass that also repairs a record left "failed" by a
 * call that timed out while the app finished, 2026-09-30).
 */
function HealthLine({ model, onAction }: RowsProps): React.ReactElement {
    const install = model.installation;
    return (
        <div className="integration-panel-health">
            <span className="integration-statusline">
                <IntegrationStatusLabel model={model} />
                {install && !install.failed && (
                    <span className="integration-panel-status-aside">
                        · {install.label.toLowerCase()} in Commerce
                    </span>
                )}
            </span>
            {model.message && (
                <span className="integration-panel-status-message">{model.message}</span>
            )}
            {install?.failed && (
                <>
                    <span className="integration-panel-status-message">
                        {install.detail ?? `${install.label} in Commerce`}
                    </span>
                    <Link isQuiet onPress={() => onAction(model, 'install')}>
                        Finish install
                    </Link>
                </>
            )}
        </div>
    );
}

/**
 * The mesh's endpoint, click-to-copy: a GraphQL endpoint answers POSTs, so it is
 * not browsable, and it is the one address an SC pastes elsewhere.
 */
function MeshEndpointRow({ model }: { model: IntegrationCardModel }): React.ReactElement | null {
    if (!model.isMesh || !model.url) return null;
    return (
        <PanelRow label={model.urlLabel}>
            <CopyableText>{model.url}</CopyableText>
        </PanelRow>
    );
}

/** Head + body for the selected card. */
function PanelContent({
    model,
    onClose,
    onOpenLinked,
    onAction,
    onRename,
}: IntegrationDetailPanelProps & { model: IntegrationCardModel }): React.ReactElement {
    // Named rather than inlined into the JSX guard: integrations have no Commerce
    // scope, and a stray field on one must not leak a row.
    const commerceScope = model.isMesh ? model.commerceScope : undefined;

    return (
        <>
            <div className="db-drawer-head integration-panel-head">
                <div className="integration-panel-heading">
                    <div className="integration-panel-title">
                        {model.canRename ? (
                            <InlineRenameField
                                name={model.name}
                                label="New integration name"
                                onRename={(newName) => onRename(model.id, newName)}
                            />
                        ) : (
                            <span>{model.name}</span>
                        )}
                    </div>
                    <HealthLine model={model} onAction={onAction} />
                </div>
                <ActionButton isQuiet aria-label="Close details" onPress={onClose}>
                    <Close size="S" />
                </ActionButton>
            </div>

            <div className="db-drawer-body">
                <div className="integration-panel-rows">
                    <LinkedSection model={model} onOpenLinked={onOpenLinked} />
                    {/* What the mesh is DEPLOYED against — a permanent row, so "what is
                        my mesh pointed at?" never needs a warning badge to be answerable. */}
                    {commerceScope?.length ? (
                        <PanelRow label="Commerce scope">
                            <CommerceScopeList parts={commerceScope} />
                        </PanelRow>
                    ) : null}
                    <MeshEndpointRow model={model} />
                </div>
                <SetupChecklistSection
                    model={model}
                    onOpenGuide={() => onAction(model, 'setup-guide')}
                />
                <FlyoutActions model={model} onAction={onAction} />
            </div>
        </>
    );
}

/** The detail panel. Renders nothing at all when no card is selected. */
export function IntegrationDetailPanel(props: IntegrationDetailPanelProps): React.ReactElement {
    const { model, onClose } = props;
    // Always mounted so the flyout can SLIDE: the Drawer's `.open` class drives
    // translateX, which needs a node already in the tree to animate from.
    return (
        <Drawer
            isOpen={model !== undefined}
            onClose={onClose}
            ariaLabel={model ? `${model.name} details` : 'Integration details'}
        >
            {model && <PanelContent {...props} model={model} />}
        </Drawer>
    );
}
