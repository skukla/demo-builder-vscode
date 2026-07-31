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
 * Asymmetries arrive pre-decided on the model: the mesh endpoint renders as mono
 * TEXT (a GraphQL POST endpoint is not browsable) while an integration URL is a
 * Link routing `onAction(model, 'open')`.
 *
 * @module features/dashboard/ui/components/integrations/IntegrationDetailPanel
 */

import { ActionButton, Button, Link } from '@adobe/react-spectrum';
import Close from '@spectrum-icons/workflow/Close';
import React from 'react';
import { Drawer } from './Drawer';
import type { BarAction, CardAction, IntegrationCardModel } from './integrationCardModel';
import { InlineRenameField } from '@/core/ui/components/forms';
import { CopyableText } from '@/core/ui/components/ui/CopyableText';
import { StatusDot } from '@/core/ui/components/ui/StatusDot';
import { cn } from '@/core/ui/utils/classNames';

export interface IntegrationDetailPanelProps {
    /** The selected card's model, or undefined while no card is selected. */
    model: IntegrationCardModel | undefined;
    /** ✕ / scrim / Esc → the grid clears its selection. */
    onClose: () => void;
    /** Bar buttons and the URL link → the grid's single handleAction switch. */
    onAction: (model: IntegrationCardModel, action: CardAction) => void;
    /** Rename commit: resolve null on success, an error string for inline display. */
    onRename: (id: string, name: string) => Promise<string | null>;
    /** The shared deploy destination, shown as a row (the banner names it once above). */
    destinationLabel?: string;
}

/** BarAction emphasis → Spectrum Button variant. */
const EMPHASIS_VARIANTS: Record<BarAction['emphasis'], 'accent' | 'secondary' | 'negative'> = {
    primary: 'accent',
    secondary: 'secondary',
    danger: 'negative',
};

/** One key/value detail row. */
function PanelRow({
    label,
    mono = false,
    children,
}: {
    label: string;
    mono?: boolean;
    children: React.ReactNode;
}): React.ReactElement {
    return (
        <div className="integration-panel-row">
            <span className="integration-panel-row-key">{label}</span>
            <span
                className={cn(
                    'integration-panel-row-value',
                    mono && 'integration-panel-row-value--mono',
                )}
            >
                {children}
            </span>
        </div>
    );
}

/** Head + body + action bar for the selected card. */
function PanelContent({
    model,
    onClose,
    onAction,
    onRename,
    destinationLabel,
}: IntegrationDetailPanelProps & { model: IntegrationCardModel }): React.ReactElement {
    const showBar = model.status === 'deploying' || model.barActions.length > 0;

    // Kind is cut when it repeats the TITLE (the mesh: "API Mesh" under "API Mesh").
    //
    // There is no Source row. `model.sourceLine` is what the CARD renders on its
    // face, and the card is on screen — scrimmed — the whole time this flyout is
    // open, so the row was a verbatim second printing that carried no payload of
    // its own. (Status restates the card too, but earns it: `model.message` — live
    // deploy progress and failure detail — exists nowhere else, and the action bar
    // reads as arbitrary without it.) An earlier pass compared rows only against
    // EACH OTHER, which is how a card-duplicating row survived being audited.
    const showKind = model.kindLabel !== model.name;

    return (
        <>
            <div className="db-drawer-head">
                <div className="integration-panel-title">
                    {model.canRename ? (
                        <InlineRenameField
                            name={model.name}
                            onRename={(newName) => onRename(model.id, newName)}
                        />
                    ) : (
                        <span>{model.name}</span>
                    )}
                </div>
                <ActionButton isQuiet aria-label="Close details" onPress={onClose}>
                    <Close size="S" />
                </ActionButton>
            </div>

            <div className="db-drawer-body">
                <PanelRow label="Status">
                    <StatusDot variant={model.dotVariant} /> <span>{model.statusLabel}</span>
                    {model.message && (
                        <span className="integration-panel-status-message">{model.message}</span>
                    )}
                </PanelRow>
                {showKind && <PanelRow label="Kind">{model.kindLabel}</PanelRow>}
                {destinationLabel && (
                    <PanelRow label="Destination" mono>
                        {destinationLabel}
                    </PanelRow>
                )}
                {model.url &&
                    (model.isMesh ? (
                        // Click-to-copy: a GraphQL endpoint answers POSTs, so it is not
                        // browsable — copying is the only way to get it out. CopyableText
                        // renders its own <code>, so no mono modifier here.
                        <PanelRow label={model.urlLabel}>
                            <CopyableText>{model.url}</CopyableText>
                        </PanelRow>
                    ) : (
                        <PanelRow label={model.urlLabel}>
                            <Link isQuiet onPress={() => onAction(model, 'open')}>
                                {model.url}
                            </Link>
                        </PanelRow>
                    ))}
                {Object.entries(model.deployedUrls ?? {}).map(([name, url]) => (
                    <PanelRow key={name} label={name} mono>
                        {url}
                    </PanelRow>
                ))}
                {model.apis && model.apis.length > 0 && (
                    <PanelRow label="APIs in use">
                        {/* One per line (the prototype's treatment) — a comma-joined run
                            of three long Adobe API names is unreadable in a 352px panel. */}
                        {model.apis.map((api) => (
                            <span key={api} className="integration-panel-api">
                                {api}
                            </span>
                        ))}
                    </PanelRow>
                )}
                {model.lastDeployed && (
                    <PanelRow label="Last deploy">{model.lastDeployed}</PanelRow>
                )}
            </div>

            {showBar && (
                <div className="db-drawer-actions">
                    {model.status === 'deploying' ? (
                        <Button variant="secondary" isDisabled>
                            Deploying…
                        </Button>
                    ) : (
                        model.barActions.map((barAction) => (
                            <Button
                                key={barAction.action}
                                variant={EMPHASIS_VARIANTS[barAction.emphasis]}
                                isDisabled={barAction.disabled}
                                onPress={() => onAction(model, barAction.action)}
                                UNSAFE_className={
                                    barAction.emphasis === 'danger'
                                        ? 'integration-panel-danger'
                                        : undefined
                                }
                            >
                                {barAction.label}
                            </Button>
                        ))
                    )}
                </div>
            )}
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
