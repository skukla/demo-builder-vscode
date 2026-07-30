/**
 * IntegrationDrawer — the detail drawer for one integration card
 * (integrations grid, Step 5). Composes the {@link Drawer} primitive around
 * the drawer content — the grid renders ONE always-mounted instance and
 * passes `model | undefined` (open state derives from model presence, and a
 * fresh model each render keeps the drawer live while open).
 *
 * Layout: head (rename-in-place when `model.canRename`, mesh "Data layer"
 * role tag, quiet ✕) · body (key/value rows, each rendered ONLY when its
 * datum exists) · action bar (`model.barActions` with emphasis→variant
 * mapping; deploying shows a single disabled "Deploying…").
 *
 * Asymmetries all come pre-decided on the model: the mesh endpoint renders
 * as mono TEXT (a GraphQL POST endpoint is not browsable), while an
 * integration URL is a Link routing `onAction(model, 'open')`.
 *
 * @module features/dashboard/ui/components/integrations/IntegrationDrawer
 */

import { ActionButton, Button, Link } from '@adobe/react-spectrum';
import Close from '@spectrum-icons/workflow/Close';
import React from 'react';
import { Drawer } from './Drawer';
import type { BarAction, CardAction, IntegrationCardModel } from './integrationCardModel';
import { InlineRenameField } from '@/core/ui/components/forms';
import { StatusDot } from '@/core/ui/components/ui/StatusDot';
import { cn } from '@/core/ui/utils/classNames';

export interface IntegrationDrawerProps {
    /** The selected card's model, or undefined while no card is open. */
    model: IntegrationCardModel | undefined;
    /** ✕ / scrim / Esc → the grid clears its selection. */
    onClose: () => void;
    /** Bar buttons and the URL link → the grid's single handleAction switch. */
    onAction: (model: IntegrationCardModel, action: CardAction) => void;
    /** Rename commit: resolve null on success, an error string for inline display. */
    onRename: (id: string, name: string) => Promise<string | null>;
}

/** BarAction emphasis → Spectrum Button variant. */
const EMPHASIS_VARIANTS: Record<BarAction['emphasis'], 'accent' | 'secondary' | 'negative'> = {
    primary: 'accent',
    secondary: 'secondary',
    danger: 'negative',
};

/** One key/value detail row. */
function DrawerRow({
    label,
    mono = false,
    children,
}: {
    label: string;
    mono?: boolean;
    children: React.ReactNode;
}): React.ReactElement {
    return (
        <div className="integration-drawer-row">
            <span className="integration-drawer-row-key">{label}</span>
            <span className={cn('integration-drawer-row-value', mono && 'integration-drawer-row-value--mono')}>
                {children}
            </span>
        </div>
    );
}

/** Head + body + action bar for an open drawer. */
function DrawerContent({
    model,
    onClose,
    onAction,
    onRename,
}: IntegrationDrawerProps & { model: IntegrationCardModel }): React.ReactElement {
    const showBar = model.status === 'deploying' || model.barActions.length > 0;

    return (
        <>
            <div className="db-drawer-head">
                <div className="integration-drawer-title">
                    {model.canRename ? (
                        <InlineRenameField
                            name={model.name}
                            onRename={(newName) => onRename(model.id, newName)}
                        />
                    ) : (
                        <span>{model.name}</span>
                    )}
                </div>
                {model.isMesh && <span className="integration-drawer-role">Data layer</span>}
                <ActionButton isQuiet aria-label="Close drawer" onPress={onClose}>
                    <Close size="S" />
                </ActionButton>
            </div>
            <div className="db-drawer-body">
                <DrawerRow label="Status">
                    <StatusDot variant={model.dotVariant} /> <span>{model.statusLabel}</span>
                    {model.message && (
                        <span className="integration-drawer-status-message">{model.message}</span>
                    )}
                </DrawerRow>
                <DrawerRow label="Kind">{model.kindLabel}</DrawerRow>
                <DrawerRow label="Source" mono={!model.sourceIsAi}>
                    {model.sourceLine}
                </DrawerRow>
                {model.url &&
                    (model.isMesh ? (
                        <DrawerRow label={model.urlLabel} mono>
                            {model.url}
                        </DrawerRow>
                    ) : (
                        <DrawerRow label={model.urlLabel}>
                            <Link isQuiet onPress={() => onAction(model, 'open')}>
                                {model.url}
                            </Link>
                        </DrawerRow>
                    ))}
                {Object.entries(model.deployedUrls ?? {}).map(([name, url]) => (
                    <DrawerRow key={name} label={name} mono>
                        {url}
                    </DrawerRow>
                ))}
                {model.apis && model.apis.length > 0 && (
                    <DrawerRow label="APIs">{model.apis.join(', ')}</DrawerRow>
                )}
                {model.lastDeployed && <DrawerRow label="Last deploy">{model.lastDeployed}</DrawerRow>}
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

/** The always-mounted detail drawer (Drawer primitive + content). */
export function IntegrationDrawer(props: IntegrationDrawerProps): React.ReactElement {
    const { model, onClose } = props;
    return (
        <Drawer
            isOpen={model !== undefined}
            onClose={onClose}
            ariaLabel={model ? `${model.name} details` : 'Integration details'}
        >
            {model && <DrawerContent {...props} model={model} />}
        </Drawer>
    );
}
