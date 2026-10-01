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
 * Two tiers since 2026-10-01 (owner: "the top section … seems overloaded"). The
 * rows an SC acts on stay open: what it uses, its status with the last deploy
 * time on the same line, the Commerce install in one line, its settings and the
 * demo setup. The addresses and provenance — source repo, URL, APIs, every
 * deployed endpoint — fold under one collapsed "Details" disclosure. The
 * Destination row went: the page band above the grid already names it.
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
import { LinkedSection } from './LinkedSection';
import { PanelRow } from './PanelRow';
import { SetupChecklistSection } from './SetupChecklistSection';
import { InlineRenameField } from '@/core/ui/components/forms/InlineRenameField';
import { CommerceScopeList } from '@/core/ui/components/integrations/CommerceScopeList';
import { IntegrationActionsMenu } from '@/core/ui/components/integrations/IntegrationActionsMenu';
import { IntegrationStatusLabel } from '@/core/ui/components/integrations/IntegrationStatusLabel';
import { CopyableText } from '@/core/ui/components/ui/CopyableText';
import { Drawer } from '@/core/ui/components/ui/Drawer';
import { cn } from '@/core/ui/utils/classNames';

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

/**
 * Status and last deploy as ONE line: the dot, the label, and — on a deployed
 * card — when. They were two rows stating one fact. `model.message` (live
 * deploy progress, failure detail) stays underneath; it exists nowhere else.
 */
function StatusRow({ model }: { model: IntegrationCardModel }): React.ReactElement {
    const when = model.status === 'deployed' ? model.lastDeployed : undefined;
    return (
        <PanelRow label="Status">
            <span className="integration-statusline">
                <IntegrationStatusLabel model={model} />
                {when && <span className="integration-panel-status-aside">· {when}</span>}
            </span>
            {model.message && (
                <span className="integration-panel-status-message">{model.message}</span>
            )}
        </PanelRow>
    );
}

/**
 * The Commerce install outcome (App Management apps only), in one line:
 * "Installed · v0.10.0". A failed install adds its reason and the remedy —
 * "Finish install", the idempotent pass that also repairs a record left
 * "failed" by a call that timed out while the app finished (2026-09-30). The
 * Admin link that used to sit here is the kebab's "Open Commerce Admin".
 */
function InstallRow({ model, onAction }: RowsProps): React.ReactElement | null {
    const install = model.installation;
    if (!install) return null;
    return (
        <PanelRow label="Commerce install">
            <span className="integration-statusline">
                <span
                    className={cn(
                        'integration-card-status',
                        install.failed && 'integration-card-status--error',
                    )}
                >
                    {install.label}
                </span>
                {install.version && (
                    <span className="integration-panel-status-aside">· v{install.version}</span>
                )}
            </span>
            {install.detail && (
                <span className="integration-panel-status-message">{install.detail}</span>
            )}
            {install.failed && (
                <Link isQuiet onPress={() => onAction(model, 'install')}>
                    Finish install
                </Link>
            )}
        </PanelRow>
    );
}

/** The address row: click-to-copy for the mesh endpoint, a link for everything else. */
function UrlRow({ model, onAction }: RowsProps): React.ReactElement | null {
    if (!model.url) return null;
    if (model.isMesh) {
        // A GraphQL endpoint answers POSTs, so it is not browsable — copying is the
        // only way to get it out. CopyableText renders its own <code>.
        return (
            <PanelRow label={model.urlLabel}>
                <CopyableText>{model.url}</CopyableText>
            </PanelRow>
        );
    }
    return (
        <PanelRow label={model.urlLabel}>
            {/* A system's screen URL lacks the key the extension adds, so it reads
                as an action, not an address. */}
            <Link isQuiet onPress={() => onAction(model, model.isSystem ? 'open' : 'open-url')}>
                {model.isSystem ? `Open ${model.name}` : model.url}
            </Link>
        </PanelRow>
    );
}

/**
 * The folded tier: source, address, APIs and the deployed endpoints. Provenance an
 * SC reads once, not state they act on, so it opens on demand. Omitted outright
 * when the model carries none of it (a disclosure over nothing).
 *
 * Source is ONE row, not the former Kind + Source pair: the kind is a muted PREFIX
 * on the identifier (`Pre-built · acme/repo`), cut when it would repeat the title.
 * `mono` only for an owner/repo — the blank starter shows its kind alone, as prose.
 *
 * The endpoints come LAST: every other row is one apiece, this group grows with
 * the app's web actions, and the drawer's own overflow absorbs the length.
 */
function DetailsDisclosure({ model, onAction }: RowsProps): React.ReactElement | null {
    const endpoints = selectEndpoints(model.deployedUrls, model.url);
    const apis = model.apis ?? [];
    if (!model.sourceLine && !model.url && apis.length === 0 && endpoints.length === 0) {
        return null;
    }
    const showKind = model.kindLabel !== model.name && !model.sourceIsAi;
    return (
        <details className="integration-panel-details">
            <summary className="integration-panel-details-summary">Details</summary>
            {model.sourceLine && (
                <PanelRow label="Source" mono={!model.sourceIsAi}>
                    {showKind && (
                        <span className="integration-panel-row-prefix">{model.kindLabel} · </span>
                    )}
                    {model.sourceIsAi ? model.kindLabel : model.sourceLine}
                </PanelRow>
            )}
            <UrlRow model={model} onAction={onAction} />
            {apis.length > 0 && (
                <PanelRow label="APIs in use">
                    {/* One per line — three long Adobe API names on one line are unreadable. */}
                    {apis.map((api) => (
                        <span key={api} className="integration-panel-api">
                            {api}
                        </span>
                    ))}
                </PanelRow>
            )}
            {endpoints.length > 0 && (
                <>
                    <div className="integration-panel-group-label">Endpoints</div>
                    {endpoints.map(({ key, label, url }) => (
                        <PanelRow key={key} label={label}>
                            <CopyableText>{url}</CopyableText>
                        </PanelRow>
                    ))}
                </>
            )}
        </details>
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
                <LinkedSection model={model} onOpenLinked={onOpenLinked} />
                <StatusRow model={model} />
                <InstallRow model={model} onAction={onAction} />
                {/* The integration's Settings in one line, with the way to change
                    them (AB-21); the same item is in the header's menu. */}
                {model.settingsSummary !== undefined && (
                    <PanelRow label="Settings">
                        <span>{model.settingsSummary}</span>
                        <Link isQuiet onPress={() => onAction(model, 'settings')}>
                            Edit settings
                        </Link>
                    </PanelRow>
                )}
                <SetupChecklistSection
                    model={model}
                    onOpenGuide={() => onAction(model, 'setup-guide')}
                />
                {/* What the mesh is DEPLOYED against — a permanent row, so "what is
                    my mesh pointed at?" never needs a warning badge to be answerable. */}
                {commerceScope?.length ? (
                    <PanelRow label="Commerce scope">
                        <CommerceScopeList parts={commerceScope} />
                    </PanelRow>
                ) : null}
                <DetailsDisclosure model={model} onAction={onAction} />
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
