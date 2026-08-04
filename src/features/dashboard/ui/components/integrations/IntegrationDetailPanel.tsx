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

import { ActionButton, Link } from '@adobe/react-spectrum';
import Close from '@spectrum-icons/workflow/Close';
import React from 'react';
import { Drawer } from './Drawer';
import { IntegrationActionsMenu, IntegrationFaceButton } from './IntegrationActions';
import type { CardAction, IntegrationCardModel } from './integrationCardModel';
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

/**
 * The deployed endpoints worth their own rows, shortest useful label first.
 *
 * Drops the entry that merely repeats `primaryUrl`: `aio app get-url --json`
 * returns ONE flat map, and `parseGetUrlOutput` picks the primary by finding the
 * first `web/` key inside it — so the primary is ALWAYS also an entry. Verified
 * byte-identical on both live integrations. Left in, it renders a second copy
 * target for a URL already on screen.
 *
 * Labels drop to the last path segment: keys arrive as `runtime/<package>/<action>`
 * and the package is the integration id already titling the panel, so the full path
 * spends three wrapped lines of an 88px key column to restate it. The full key stays
 * the React key, so two actions that shorten alike stay distinct rows.
 */
function selectEndpoints(
    deployedUrls: Record<string, string> | undefined,
    primaryUrl: string | undefined,
): { key: string; label: string; url: string }[] {
    return Object.entries(deployedUrls ?? {})
        .filter(([, url]) => url !== primaryUrl)
        .map(([key, url]) => ({ key, label: key.split('/').pop() || key, url }));
}

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
    const deployedEndpoints = selectEndpoints(model.deployedUrls, model.url);

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
                {/* The flyout mirrors the CARD: the at-most-one attention verb as a
                    button, everything deliberate behind the kebab. It used to carry a
                    row of Buttons duplicating those same actions — a third place for
                    them, in a control the card does not use. */}
                {model.status !== 'deploying' && (
                    <IntegrationFaceButton model={model} onAction={onAction} />
                )}
                <IntegrationActionsMenu model={model} onAction={onAction} />
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
                {/* Moved here from the card face (2026-08-03). It was cut from this
                    panel originally BECAUSE the card showed it and the card sits
                    scrimmed behind the flyout — that reason left with the line. On
                    the card it also made every non-mesh kind a row taller than the
                    mesh, so no two cards shared a baseline.
                    `mono` only for an owner/repo identifier: the blank starter's
                    line is prose and must not be typeset as code. */}
                {model.sourceLine && (
                    <PanelRow label="Source" mono={!model.sourceIsAi}>
                        {model.sourceLine}
                    </PanelRow>
                )}
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
                {/* LAST, deliberately. Every row above is fixed-size — one apiece —
                    while this group grows with the app's web actions and is the only
                    thing here without a bound. Above the metadata it strands Last
                    deploy and APIs in use below a scroll; below it, the drawer's own
                    overflow absorbs the length and nothing short gets pushed away.
                    That ordering is why the group needs no scroll container of its
                    own: a nested scroller in a 352px drawer traps trackpad momentum
                    and hides content behind a scrollbar inside a scrollbar.

                    The rows carry the same click-to-copy as the mesh endpoint — an
                    endpoint's whole use is to leave this panel for curl or a browser.
                    As inert mono text they sat between a copyable row and a linked
                    row, three kinds of URL wearing three affordances. One heading
                    covers the group; N unlabelled rows otherwise impersonate metadata
                    peers of Status and Kind. */}
                {deployedEndpoints.length > 0 && (
                    <>
                        <div className="integration-panel-group-label">Endpoints</div>
                        {deployedEndpoints.map(({ key, label, url }) => (
                            <PanelRow key={key} label={label}>
                                <CopyableText>{url}</CopyableText>
                            </PanelRow>
                        ))}
                    </>
                )}
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
