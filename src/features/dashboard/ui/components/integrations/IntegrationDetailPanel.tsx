/**
 * IntegrationDetailPanel — the master/detail panel beside the grid.
 *
 * Supersedes the viewport-fixed `Drawer` host (integrations-surface plan,
 * decision 1). On the dedicated full-width surface a page-scoped sticky panel
 * never covers the grid you just navigated to, and it holds its place while the
 * grid scrolls — a modal drawer had to cover the whole webview to show one card.
 *
 * The CONTENT is unchanged from the drawer it replaces: key/value rows that
 * render only when their datum exists, the emphasis→variant action bar, and
 * rename-in-place when `model.canRename`. Only the host changed, so the model
 * and its matrices are untouched.
 *
 * Non-modal by design: no scrim, no focus trap, no Esc-to-close. It sits in the
 * page beside the grid rather than over it, so those modal affordances would be
 * wrong here (that is why the Drawer primitive was deleted rather than kept).
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
import type { BarAction, CardAction, IntegrationCardModel } from './integrationCardModel';
import { InlineRenameField } from '@/core/ui/components/forms';
import { StatusDot } from '@/core/ui/components/ui/StatusDot';
import { cn } from '@/core/ui/utils/classNames';

export interface IntegrationDetailPanelProps {
    /** The selected card's model, or undefined while no card is selected. */
    model: IntegrationCardModel | undefined;
    /** ✕ → the grid clears its selection. */
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

    return (
        <>
            <div className="integration-panel-head">
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
                {model.isMesh && <span className="integration-panel-role">Data layer</span>}
                <ActionButton isQuiet aria-label="Close details" onPress={onClose}>
                    <Close size="S" />
                </ActionButton>
            </div>

            <div className="integration-panel-body">
                <PanelRow label="Status">
                    <StatusDot variant={model.dotVariant} /> <span>{model.statusLabel}</span>
                    {model.message && (
                        <span className="integration-panel-status-message">{model.message}</span>
                    )}
                </PanelRow>
                <PanelRow label="Kind">{model.kindLabel}</PanelRow>
                <PanelRow label="Source" mono={!model.sourceIsAi}>
                    {model.sourceLine}
                </PanelRow>
                {destinationLabel && (
                    <PanelRow label="Destination" mono>
                        {destinationLabel}
                    </PanelRow>
                )}
                {model.url &&
                    (model.isMesh ? (
                        <PanelRow label={model.urlLabel} mono>
                            {model.url}
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
                <div className="integration-panel-actions">
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
export function IntegrationDetailPanel(
    props: IntegrationDetailPanelProps,
): React.ReactElement | null {
    const { model } = props;
    if (!model) {
        return null;
    }
    return (
        <aside
            className="integration-panel"
            aria-label={`${model.name} details`}
            data-testid="integration-detail-panel"
        >
            <PanelContent {...props} model={model} />
        </aside>
    );
}
