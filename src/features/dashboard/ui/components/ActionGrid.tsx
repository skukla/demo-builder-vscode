/**
 * ActionGrid Component
 *
 * Displays the project dashboard actions as four labelled rows of tiles, one per
 * job the SC is doing (owner, 2026-10-06). Headings came back because the actions
 * no longer fit one row: they were dropped on 2026-07-09 when a single strip of
 * self-describing tiles needed no captions, and the overflow that grew instead
 * hid everyday doors (AEM Assets, Dev Console, Sync, Site Access) beside Delete.
 *
 *  - Open (cards): where you go to use the project. Start/Stop + Restart
 *    (non-EDS), Open in Browser, Author Content (EDS), Manage Commerce, each
 *    saying where it leads, with AEM Assets and Dev Console listed beside them.
 *    Every one opens a surface; none changes the project.
 *  - Storefront (EDS only): keeping the site itself in shape. Republish (the
 *    remedy carrying the drift dot), Sync Storefront, Refresh Blocks, Site Access.
 *  - Build: what the demo contains. Edit (what it HAS), Configure (their
 *    values), Integrations, Datapacks, then — set apart — Reset and Delete.
 *  - Share: moving a demo between people. Export, Save as Package (EDS),
 *    Change Source (only for a project built on an added demo).
 *
 * Storefront, Build and Share are compact lists, where a status dot sits
 * beside the label with its word ("Needed", "Error") rather than in a corner.
 *
 * (Logs moved to the sidebar Logs utility; Rename is inline on the dashboard
 * title / project card name. Deploy Mesh retired in ADR-011 D3 Step 08 — the
 * mesh deploys from its integrations-list row.)
 *
 * WHERE A STATUS GOES
 *
 * Environment health -> the masthead band (DashboardStatusHeader). Artifact
 * state -> the zone that owns the part.
 *
 * "Environment" means whether the tooling works at all: AI Ready, IMS Org.
 * Those would still be meaningful on an empty project, and each carries its own
 * one-shot fix on the badge. "Artifact" means the thing being built — the
 * frontend, the mesh, the integrations — whose fixes are actions down here.
 *
 * It is carried by a REMEDY TILE, not a status line: the button that fixes the
 * state, wearing an amber dot when the fix is due, with a tooltip saying why.
 * Every dotted tile goes through `DashboardTile`, whose `status` prop carries
 * the dot and its wording as one value — a dot with no explanation is not
 * expressible, which is how the integrations tile once shipped a naked one.
 * Restart in Primary, Republish in Storefront, and the Integrations tile that
 * routes to its surface. A status line inside a zone was tried first and
 * dangled off the end of the tile row.
 *
 * Which tile gets the dot is the load-bearing detail. Republish carries the
 * storefront's, NOT Sync Storefront: Sync pushes storefront CODE and never
 * touches `edsStorefrontStatusSummary`, so its dot would point at a button that
 * does not fix what it reports.
 *
 * The Primary zone gets no runtime status of its own — Start/Stop already says
 * whether the demo is up.
 *
 * The rule came from breaking it. The frontend's status lived in the masthead
 * while its fixes lived here — the republish buried in the More overflow, the
 * restart nowhere at all — so it was the only status that named a problem and
 * offered nothing to do about it. It also carried two unrelated axes in one
 * badge (EDS publish state and the non-EDS dev server); splitting it by zone
 * separated them.
 *
 * Republish Content left the More overflow when it gained a tile. One action,
 * one door — and the menu was the worse one, hiding the remedy for a state the
 * dashboard was displaying under "rarely used actions".
 *
 * Gating is behavioral, not displayed: Author Content and the Storefront row
 * render only for EDS projects; Start/Stop only for non-EDS. A tile whose
 * handler the host did not wire is absent, never a dead door.
 *
 * AI access is provided globally via the sidebar (Chat + Prompts) — the MCP
 * is wired at the extension level, so a project-scoped AI tile here would be
 * a redundant second door to the same surface.
 *
 * @module features/dashboard/ui/components/ActionGrid
 */

import Delete from '@spectrum-icons/workflow/Delete';
import Edit from '@spectrum-icons/workflow/Edit';
import Revert from '@spectrum-icons/workflow/Revert';
import Settings from '@spectrum-icons/workflow/Settings';
import React from 'react';
import type { MeshStatus, StatusDisplay } from '../hooks/useDashboardStatus';
import { DashboardTile } from './DashboardTile';
import { DashboardZone } from './DashboardZone';
import { DataInstallerTile } from './DataInstallerTile';
import { IntegrationsSummaryTile } from './IntegrationsSummaryTile';
import { OpenZone } from './OpenZone';
import { ShareZone } from './ShareZone';
import { StorefrontZone } from './StorefrontZone';
import type { AppBuilderComponentState } from '@/types/base';

/**
 * Props for the ActionGrid component
 */
export interface ActionGridProps {
    /** Whether this is an EDS project (always published, no start/stop) */
    isEds?: boolean;
    /** Whether demo is currently running (ignored for EDS projects) */
    isRunning: boolean;
    /** Whether Start button should be disabled (ignored for EDS projects) */
    isStartDisabled: boolean;
    /** Whether Stop button should be disabled (ignored for EDS projects) */
    isStopDisabled: boolean;
    /** Whether mesh-related actions (Configure) should be disabled */
    isMeshActionDisabled: boolean;
    /**
     * Integrations summary tile inputs. The tile lives in the Build zone beside
     * Configure — integrations are a "set this up" concern, not a run-time action.
     */
    hasAdobeContext?: boolean;
    /**
     * Whether to offer the Sample Data tile. The Data Installer needs BOTH
     * `dataInstaller.enabled` and a usable `apiBaseUrl`; without the URL the
     * surface refuses every request, so a tile is an invitation to a dead end.
     * Decided host-side (`isDataInstallerConfigured`) — these are settings, and
     * the webview cannot read them.
     *
     * Defaults to hidden. An undefined flag means the host did not say, and
     * offering a surface we have not confirmed is the failure this prop exists
     * to prevent.
     */
    dataInstallerAvailable?: boolean;
    appBuilderComponents?: Record<string, AppBuilderComponentState>;
    hasMesh?: boolean;
    meshStatus?: MeshStatus;
    /** Whether browser is currently opening */
    isOpeningBrowser: boolean;
    /**
     * The artifact's own status, rendered INSIDE the zone that owns it — the
     * runtime line in Primary for non-EDS, the publish line in Storefront for
     * EDS. It used to be a masthead badge beside AI Ready and IMS Org; those two
     * are environment health, this is the thing being built, and the split is
     * why this one named a problem while offering no fix.
     *
     * Its `remedy` selects the inline action: `restart` -> handleRestartDemo,
     * `republish` -> handleRepublishContent.
     */
    demoStatus?: StatusDisplay;
    /** Handler for the Restart remedy (non-EDS, config changed while running) */
    handleRestartDemo?: () => void;
    /** Handler for Start button (non-EDS only) */
    handleStartDemo: () => void;
    /** Handler for Stop button (non-EDS only) */
    handleStopDemo: () => void;
    /** Handler for Open in Browser button (non-EDS only) */
    handleOpenBrowser: () => void;
    /** Handler for Open Live Site button (EDS only) */
    handleOpenLiveSite?: () => void;
    /** Handler for Open DA.live button (EDS only) */
    handleOpenDaLive?: () => void;
    /** Handler for the Manage Commerce button (admin URL resolved backend-side) */
    handleOpenAdminPanel: () => void;
    /** Handler for Sync Storefront button (EDS projects only) */
    handleSyncStorefront?: () => void;
    /** Handler for the Site Access tile (EDS projects only) */
    handleOpenSiteAccess?: () => void;
    /** Handler for the Refresh Block Library tile (EDS projects only) */
    handleRefreshBlockLibrary?: () => void;
    /** Handler for the Republish tile (EDS projects only) */
    handleRepublishContent?: () => void;
    /** Handler for Configure button */
    handleConfigure: () => void;
    /** Handler for the Dev Console tile */
    handleOpenDevConsole: () => void;
    /**
     * Handler for the AEM Assets tile (EDS-21). Always offered: the
     * bound AEM is a setting the webview cannot read, so the host resolves it
     * and, when none is set, offers the setting instead of failing.
     */
    handleOpenAemAssets: () => void;
    /**
     * Handler for the Edit tile. Opens the wizard in edit mode for
     * the current project. Optional — gated like the kebab's Edit action
     * (EDS always; non-EDS only while stopped).
     */
    handleEditProject?: () => void;
    /** Handler for the Export tile */
    handleExportProject: () => void;
    /**
     * Handler for the Change Demo Source tile. Present only for a
     * project built on an added demo: it points the project at another copy
     * of that demo (the notice offers the same door when the source is gone).
     */
    handleChangeDemoSource?: () => void;
    /**
     * "Save as demo package" (EDS only): turn this storefront into a card on the
     * SC's own Welcome step. About the SC; Export is about handing over.
     */
    handleSaveDemoPackage?: () => void;
    /** Handler for Reset (always shown, at the foot of Build, before Delete) */
    handleResetProject: () => void;
    /** Handler for Delete button */
    handleDeleteProject: () => void;
}

/**
 * Action grid displaying dashboard control tiles grouped into zones (spacing-only, no headings).
 *
 * Tiles are conditionally rendered/disabled based on project type and state.
 *
 * @param props - Component props
 */
/**
 * Which demo-status colours the Start/Stop tile cannot express on its own.
 *
 * Green and gray are steady states the tile already shows by which verb it
 * offers; dotting those would state the same fact twice. Blue (starting,
 * stopping, configuring) and red (error) look identical on the tile, so they
 * get the dot — and the tooltip supplies the wording.
 */
const LIFECYCLE_DOT: Partial<Record<string, 'info' | 'error'>> = {
    blue: 'info',
    red: 'error',
};

/**
 * Edit — reopens the creation wizard: which brand, stack, components and block
 * libraries the demo HAS. Configure, beside it, changes their VALUES.
 *
 * DISABLED rather than hidden while a non-EDS demo runs (the wizard cannot
 * re-shape a running project): hiding it would reshuffle the row every time the
 * demo starts or stops. EDS has no running state, so it is always enabled there.
 *
 * Extracted for the same reason as its siblings — inline, its conditional plus
 * tooltip ternary pushed ActionGrid past the complexity limit.
 */
function EditTile({
    canEdit,
    onPress,
}: {
    canEdit: boolean;
    onPress: () => void;
}): React.ReactElement {
    return (
        <DashboardTile
            label="Edit"
            icon={<Edit size="L" />}
            onPress={onPress}
            action="edit"
            isDisabled={!canEdit}
            tooltip={
                canEdit
                    ? 'Change the demo\u2019s brand, stack, components or block libraries'
                    : 'Stop the demo to change what it contains'
            }
        />
    );
}

/**
 * The Build zone — what the demo contains, then Reset and Delete: the two
 * rare, destructive actions. Delete is last, per the overflow-menu convention;
 * the confirm dialog behind it remains the real safety net.
 */
function BuildZone({
    canEdit,
    isMeshActionDisabled,
    hasAdobeContext,
    dataInstallerAvailable,
    appBuilderComponents,
    hasMesh,
    meshStatus,
    handleEditProject,
    handleConfigure,
    handleResetProject,
    handleDeleteProject,
}: {
    canEdit: boolean;
    isMeshActionDisabled: boolean;
    hasAdobeContext?: boolean;
    dataInstallerAvailable?: boolean;
    appBuilderComponents?: Record<string, AppBuilderComponentState>;
    hasMesh?: boolean;
    meshStatus?: MeshStatus;
    handleEditProject?: () => void;
    handleConfigure: () => void;
    handleResetProject: () => void;
    handleDeleteProject: () => void;
}): React.ReactElement {
    return (
        <DashboardZone id="build" title="Build" compact>
            {handleEditProject && <EditTile canEdit={canEdit} onPress={handleEditProject} />}

            <DashboardTile
                label="Configure"
                icon={<Settings size="L" />}
                onPress={handleConfigure}
                isDisabled={isMeshActionDisabled}
            />

            {/* Integrations — the whole integrations footprint (count + worst
                status), routing to the dedicated surface. Renders nothing
                without an Adobe org. */}
            <IntegrationsSummaryTile
                hasAdobeContext={hasAdobeContext}
                appBuilderComponents={appBuilderComponents}
                hasMesh={hasMesh}
                meshStatus={meshStatus}
            />

            {/* Datapacks — the global catalog, opened beside the dashboard. */}
            {dataInstallerAvailable && <DataInstallerTile />}

            {/* Reset and Delete — the two rare, destructive actions, last, and
                set apart by a gap. Each opens its own confirmation, which is the
                real safety net; Delete is red so it never reads as routine. */}
            <div className="dashboard-compact-danger">
                <DashboardTile
                    label="Reset"
                    icon={<Revert size="L" />}
                    onPress={handleResetProject}
                    action="reset"
                    tooltip="Put the demo back to how it was first set up"
                />
                <DashboardTile
                    label="Delete"
                    icon={<Delete size="L" />}
                    onPress={handleDeleteProject}
                    action="delete"
                    className="dashboard-action-button--danger"
                    tooltip="Delete this project and what it created"
                />
            </div>
        </DashboardZone>
    );
}

export function ActionGrid({
    isEds = false,
    isRunning,
    isStartDisabled,
    isStopDisabled,
    isMeshActionDisabled,
    isOpeningBrowser,
    demoStatus,
    handleRestartDemo,
    hasAdobeContext,
    dataInstallerAvailable,
    appBuilderComponents,
    hasMesh,
    meshStatus,
    handleStartDemo,
    handleStopDemo,
    handleOpenBrowser,
    handleOpenLiveSite,
    handleOpenDaLive,
    handleOpenAdminPanel,
    handleSyncStorefront,
    handleRefreshBlockLibrary,
    handleRepublishContent,
    handleConfigure,
    handleOpenDevConsole,
    handleOpenAemAssets,
    handleOpenSiteAccess,
    handleEditProject,
    handleExportProject,
    handleChangeDemoSource,
    handleSaveDemoPackage,
    handleResetProject,
    handleDeleteProject,
}: ActionGridProps): React.ReactElement {
    // Edit gating mirrors the kebab's Edit: non-EDS only while stopped, EDS always.
    const canEdit = Boolean(handleEditProject) && (isEds || !isRunning);

    // Which fix is due, from the status named where the state is decided.
    const needsRestart = demoStatus?.remedy === 'restart';
    const needsRepublish = demoStatus?.remedy === 'republish';
    // Extracted rather than inlined: a 4-operand && chain in JSX trips the
    // complex-expression SOP scan (tests/sop/complex-expressions.test.ts).
    const canRestart = !isEds && isRunning && Boolean(handleRestartDemo);

    // The Start/Stop tile shows running-vs-stopped by WHICH verb it offers, so a
    // steady state needs no dot. It cannot show the states in between, or a
    // failure, so those get one, and the tooltip carries the words.
    const lifecycleDot = LIFECYCLE_DOT[demoStatus?.color ?? 'green'];

    return (
        <div className="dashboard-zones">
            <OpenZone
                isEds={isEds}
                isRunning={isRunning}
                isStartDisabled={isStartDisabled}
                isStopDisabled={isStopDisabled}
                isOpeningBrowser={isOpeningBrowser}
                lifecycleDot={lifecycleDot}
                statusText={demoStatus?.text}
                canRestart={canRestart}
                needsRestart={needsRestart}
                handleStartDemo={handleStartDemo}
                handleStopDemo={handleStopDemo}
                handleRestartDemo={handleRestartDemo}
                handleOpenBrowser={handleOpenBrowser}
                handleOpenLiveSite={handleOpenLiveSite}
                handleOpenDaLive={handleOpenDaLive}
                handleOpenAdminPanel={handleOpenAdminPanel}
                handleOpenAemAssets={handleOpenAemAssets}
                handleOpenDevConsole={handleOpenDevConsole}
            />
            <div className="dashboard-zones-secondary">
            {isEds && (
                <StorefrontZone
                    needsRepublish={needsRepublish}
                    handleRepublishContent={handleRepublishContent}
                    handleSyncStorefront={handleSyncStorefront}
                    handleRefreshBlockLibrary={handleRefreshBlockLibrary}
                    handleOpenSiteAccess={handleOpenSiteAccess}
                />
            )}
            <BuildZone
                canEdit={canEdit}
                isMeshActionDisabled={isMeshActionDisabled}
                hasAdobeContext={hasAdobeContext}
                dataInstallerAvailable={dataInstallerAvailable}
                appBuilderComponents={appBuilderComponents}
                hasMesh={hasMesh}
                meshStatus={meshStatus}
                handleEditProject={handleEditProject}
                handleConfigure={handleConfigure}
                handleResetProject={handleResetProject}
                handleDeleteProject={handleDeleteProject}
            />
            <ShareZone
                isEds={isEds}
                handleExportProject={handleExportProject}
                handleSaveDemoPackage={handleSaveDemoPackage}
                handleChangeDemoSource={handleChangeDemoSource}
            />
            </div>
        </div>
    );
}
