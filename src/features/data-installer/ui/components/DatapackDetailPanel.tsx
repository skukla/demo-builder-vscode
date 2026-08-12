/**
 * DatapackDetailPanel — the catalog's detail flyout.
 *
 * `core/ui/Drawer`'s second consumer, which is the trigger its docstring named
 * when it was promoted out of the integrations feature. Structure mirrors
 * `IntegrationDetailPanel` deliberately: an always-mounted Drawer whose `isOpen`
 * is "is something selected", a `db-drawer-head` with the title and close, and a
 * `db-drawer-body` of key/value rows.
 *
 * It borrows `.integration-panel-row*` for those rows. Those classes live in
 * `custom-spectrum.css`, so they reach every bundle — a feature-scoped class
 * would render raw here with no error anywhere. The name is a wart: they are a
 * generic drawer row that predates Drawer's promotion. Renaming them to
 * `db-drawer-row*` is the right cleanup at a THIRD consumer, when the rename is
 * paid for by more than one caller.
 *
 * **The inventory is what earns the flyout.** A pack DECLARES `dataTypes`, but
 * the service may hold no item for some of them — the card can only show the
 * declared count, which would be a lie about what installing gets you. The
 * handler pairs `get-datapack-metadata` with a batch item lookup for exactly this,
 * and the gap is surfaced here rather than silently folded into a number.
 *
 * Presentational: the caller owns the fetch, so the same panel serves the catalog
 * today and the installed view later without either of them owning a client.
 *
 * @module features/data-installer/ui/components/DatapackDetailPanel
 */

import { ActionButton } from '@adobe/react-spectrum';
import Close from '@spectrum-icons/workflow/Close';
import React from 'react';
import type { DataItemInventory, DatapackDetail, DatapackId } from '../../types';
import { renderDataInstallerFailure } from '../dataInstallerFailure';
import type { DataInstallerFailure } from '../hooks/useDataInstallerRequest';
import { LoadingDisplay } from '@/core/ui/components/feedback/LoadingDisplay';
import { Drawer } from '@/core/ui/components/ui/Drawer';

export interface DatapackDetailPanelProps {
    /** The pack whose detail is showing; undefined closes the drawer. */
    selected?: DatapackId;
    /** Loaded detail, or null while loading or failed. */
    detail: DatapackDetail | null;
    /** Which declared types the service actually holds. */
    inventory: DataItemInventory | null;
    /** True while the detail request is in flight. */
    loading: boolean;
    /** Why the detail could not be loaded, or null. */
    failure: DataInstallerFailure | null;
    /** Scrim click, Escape, or the close button. */
    onClose: () => void;
    /** Re-run the detail request. */
    onRetry: () => void;
}

export function DatapackDetailPanel({
    selected,
    detail,
    inventory,
    loading,
    failure,
    onClose,
    onRetry,
}: DatapackDetailPanelProps): React.JSX.Element {
    const title = detail?.displayName ?? selected?.name ?? 'Datapack';

    return (
        // Always mounted so the flyout can SLIDE: `.open` drives translateX,
        // which needs a node already in the tree to animate from.
        <Drawer isOpen={selected !== undefined} onClose={onClose} ariaLabel={`${title} details`}>
            {selected ? (
                <>
                    <div className="db-drawer-head">
                        <div className="datapack-panel-title">{title}</div>
                        <ActionButton isQuiet aria-label="Close details" onPress={onClose}>
                            <Close size="S" />
                        </ActionButton>
                    </div>
                    <div className="db-drawer-body">
                        {renderPanelBody({ detail, inventory, loading, failure, onRetry })}
                    </div>
                </>
            ) : null}
        </Drawer>
    );
}

/** Pick the one body state to show. */
function renderPanelBody(args: {
    detail: DatapackDetail | null;
    inventory: DataItemInventory | null;
    loading: boolean;
    failure: DataInstallerFailure | null;
    onRetry: () => void;
}): React.JSX.Element | null {
    const { detail, inventory, loading, failure, onRetry } = args;

    if (failure) {
        return renderDataInstallerFailure(failure, onRetry);
    }
    if (loading || !detail) {
        return <LoadingDisplay size="M" message="Loading datapack..." />;
    }
    return <DetailRows detail={detail} inventory={inventory} />;
}

/** The loaded detail, as key/value rows. */
function DetailRows({
    detail,
    inventory,
}: {
    detail: DatapackDetail;
    inventory: DataItemInventory | null;
}): React.JSX.Element {
    // Present types come from the INVENTORY, not from `detail.dataTypes`: the
    // second is what the pack claims, the first is what is there to install.
    const present = inventory?.present ?? detail.dataTypes;
    const missing = inventory?.missing ?? [];

    return (
        <>
            <PanelRow label="Version">{detail.id.version}</PanelRow>
            {detail.description ? (
                <PanelRow label="Description">{detail.description}</PanelRow>
            ) : null}
            {detail.owner ? <PanelRow label="Owner">{detail.owner}</PanelRow> : null}
            <PanelRow label="Curation">{detail.shared ? 'Shared' : 'Community'}</PanelRow>
            {detail.updatedAt ? (
                <PanelRow label="Updated">{formatDate(detail.updatedAt)}</PanelRow>
            ) : null}
            <PanelRow label={`Data (${present.length})`}>
                <span className="datapack-panel-types">
                    {present.map((dataType) => (
                        <span key={dataType} className="datapack-panel-type">
                            {dataType}
                        </span>
                    ))}
                </span>
            </PanelRow>
            {missing.length > 0 ? (
                <PanelRow label="Declared, not stored">
                    <span className="datapack-panel-types" data-testid="datapack-detail-missing">
                        {missing.map((dataType) => (
                            <span key={dataType} className="datapack-panel-type is-missing">
                                {dataType}
                            </span>
                        ))}
                    </span>
                </PanelRow>
            ) : null}
        </>
    );
}

/** One key/value detail row. */
function PanelRow({
    label,
    children,
}: {
    label: string;
    children: React.ReactNode;
}): React.JSX.Element {
    return (
        <div className="integration-panel-row">
            <span className="integration-panel-row-key">{label}</span>
            <span className="integration-panel-row-value">{children}</span>
        </div>
    );
}

/**
 * Render an ISO timestamp as a plain date.
 *
 * Locale-formatted rather than sliced: these cross the webview boundary as ISO
 * strings (see `types.ts`), and a `slice(0, 10)` would show a UTC date that is
 * wrong by a day for anyone west of Greenwich in the evening.
 */
function formatDate(iso: string): string {
    const parsed = new Date(iso);
    return Number.isNaN(parsed.getTime()) ? iso : parsed.toLocaleDateString();
}
