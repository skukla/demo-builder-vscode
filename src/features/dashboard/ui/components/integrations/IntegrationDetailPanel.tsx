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
import type { CardAction, IntegrationCardModel } from './integrationCardModel';
import { InlineRenameField } from '@/core/ui/components/forms';
import { IntegrationActionsMenu } from '@/core/ui/components/integrations/IntegrationActionsMenu';
import { CopyableText } from '@/core/ui/components/ui/CopyableText';
import { Drawer } from '@/core/ui/components/ui/Drawer';
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
    // Named rather than inlined into the JSX guard: three conditions in a row
    // there is exactly the chain the SOP scan flags, and the name says WHY the
    // mesh check belongs — integrations have no Commerce scope.
    const commerceScope = model.isMesh ? model.commerceScope : undefined;

    return (
        <>
            <div className="db-drawer-head">
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
                {/* The flyout mirrors the CARD: one kebab, no face button. */}
                <IntegrationActionsMenu model={model} onAction={onAction} />
                <ActionButton isQuiet aria-label="Close details" onPress={onClose}>
                    <Close size="S" />
                </ActionButton>
            </div>

            <div className="db-drawer-body">
                <PanelRow label="Status">
                    {/* Same treatment as the card's status line — 6px dot, 6px gap,
                        11px uppercase label. The flyout is the card's detail view, so
                        reading the status differently in each was the odd part. Both
                        share one CSS rule rather than repeating the four declarations. */}
                    <span className="integration-statusline">
                        <StatusDot variant={model.dotVariant} size={6} />
                        <span
                            className={cn(
                                'integration-card-status',
                                model.status === 'error' && 'integration-card-status--error',
                            )}
                        >
                            {model.statusLabel}
                        </span>
                    </span>
                    {model.message && (
                        <span className="integration-panel-status-message">{model.message}</span>
                    )}
                </PanelRow>
                {/* The Commerce install outcome (App Management apps only) —
                    the persisted record NOTHING rendered until AB-5, though it
                    is the one thing that answers "deployed, but is it working?"
                    A failed install's remedy is the kebab's "Install into
                    Commerce", so the row states the fact and the detail line
                    carries the hands-back. */}
                {model.installation && (
                    <PanelRow label="Commerce install">
                        <span
                            className={cn(
                                'integration-card-status',
                                model.installation.failed && 'integration-card-status--error',
                            )}
                        >
                            {model.installation.label}
                        </span>
                        {model.installation.detail && (
                            <span className="integration-panel-status-message">
                                {model.installation.detail}
                            </span>
                        )}
                        {model.installation.at && (
                            <span className="integration-panel-status-message">
                                {model.installation.at}
                            </span>
                        )}
                        {/* The hands-back destination (Apps > App Management),
                            via the SAME openAdminPanel message the dashboard's
                            Admin tile posts — the extension already derives the
                            admin URL for both Commerce flavors. */}
                        <Link isQuiet onPress={() => onAction(model, 'open-admin')}>
                            Open Commerce Admin
                        </Link>
                    </PanelRow>
                )}
                {/* ONE row, not the former Kind + Source pair. They printed the same
                    fact in two registers — worst on the blank starter, where
                    "Custom · blank starter" sat directly above "Blank starter — build
                    it out". The kind becomes a muted PREFIX on the source identifier,
                    so the pre-built/imported distinction (the only thing Kind still
                    carried alone) survives in one line: `Pre-built · acme/repo`.

                    `mono` only for an owner/repo identifier — the blank starter has no
                    repo, so it shows its kind alone and must not be typeset as code.
                    The prefix opts out of mono separately: it is prose. */}
                {model.sourceLine && (
                    <PanelRow label="Source" mono={!model.sourceIsAi}>
                        {showKind && !model.sourceIsAi && (
                            <span className="integration-panel-row-prefix">
                                {model.kindLabel} ·{' '}
                            </span>
                        )}
                        {model.sourceIsAi ? model.kindLabel : model.sourceLine}
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
                {/* What the mesh is DEPLOYED against — a permanent row, not a
                    stale-only diff. The scope it serves is always true, and
                    "what is my mesh pointed at?" should not need a warning badge
                    before it becomes answerable. On a stale mesh the badge says
                    the mesh is behind and this row says what it is behind ON, so
                    the stale case needs no special treatment.

                    `isMesh` guards it rather than the caller: integrations have
                    no Commerce scope, and a stray field on one must not leak a
                    row. */}
                {commerceScope?.length ? (
                    <PanelRow label="Commerce scope">
                        {commerceScope.map(({ label, code, name }) => (
                            <span key={label} className="integration-panel-scope">
                                <span className="integration-panel-scope-key">{label}</span>
                                {/* Name first, code parenthesised and muted: the
                                    name is what the user picked, the code is what
                                    is in the `.env` and what they would grep for.
                                    With no name the code stands ALONE — not
                                    "(unknown)", not an empty bracket. That is the
                                    correct rendering for every project predating
                                    name capture, and it must not look broken. */}
                                <span className="integration-panel-scope-value">
                                    {name && <>{name} </>}
                                    <span
                                        className={cn(
                                            'integration-panel-scope-code',
                                            name && 'integration-panel-scope-code--aside',
                                        )}
                                    >
                                        {name ? `(${code})` : code}
                                    </span>
                                </span>
                            </span>
                        ))}
                    </PanelRow>
                ) : null}
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
