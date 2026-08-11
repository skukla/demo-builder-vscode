/**
 * ActionGrid Component
 *
 * Displays the project dashboard actions as small, grouped, prioritized tiles
 * grouped into zones (no visible headings — spacing + tile labels carry the grouping):
 *  - Primary zone (accent): Start/Stop (non-EDS, mutually exclusive), Open in
 *    Browser, Author Content (EDS only), and Manage Commerce (all project
 *    types, always visible — resolved backend-side on click: derived from the
 *    ACCS tenant endpoint for SaaS, or the optional ADOBE_COMMERCE_ADMIN_URL
 *    field for PaaS/override). These are the surfaces you use
 *    the project through — see it as a customer, edit it as a creator,
 *    manage it as an admin.
 *  - Storefront zone (EDS only): Republish — the remedy carrying the
 *    storefront-drift dot. Sync Storefront used to sit here and moved to the
 *    More menu: its main consumer is the AI loop, where a PostToolUse hook
 *    commits and pushes automatically, and it is EDS-only in an otherwise
 *    near-universal row.
 *  - Build zone: Configure and a "More" overflow menu holding Export, Sync
 *    Storefront (EDS only), Refresh Block Library (EDS only), Dev Console,
 *    Reset, and Delete (destructive, last).
 *
 *    Edit swapped INTO the tile row for Sync Storefront's old place. It applies
 *    to every project type, has no automation, and changes what the demo
 *    contains — while Configure beside it changes their values. It sits at the
 *    end of Primary rather than in Build so it precedes Republish in the row:
 *    changing what the demo IS comes before fixing how it publishes.
 *
 *    (Logs moved to the sidebar Logs utility; Rename is inline on the dashboard
 *    title / project card name. Deploy Mesh retired in ADR-011 D3 Step 08 — the
 *    mesh deploys from its integrations-list row.)
 *  - Delete footer: isolated below the zones, destructive styling.
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
 * Gating is behavioral, not displayed: Author Content and Sync Storefront
 * render only for EDS projects; Start/Stop only for non-EDS.
 *
 * AI access is provided globally via the sidebar (Chat + Prompts) — the MCP
 * is wired at the extension level, so a project-scoped AI tile here would be
 * a redundant second door to the same surface.
 *
 * Note: EDS Publish and Reset actions are available via the project card kebab menu,
 * not on this dashboard detail view.
 *
 * @module features/dashboard/ui/components/ActionGrid
 */

import { ActionButton, Item, Menu, MenuTrigger, Text } from '@adobe/react-spectrum';
import Edit from '@spectrum-icons/workflow/Edit';
import Globe from '@spectrum-icons/workflow/Globe';
import More from '@spectrum-icons/workflow/More';
import PlayCircle from '@spectrum-icons/workflow/PlayCircle';
import Refresh from '@spectrum-icons/workflow/Refresh';
import Replay from '@spectrum-icons/workflow/Replay';
import Settings from '@spectrum-icons/workflow/Settings';
import StopCircle from '@spectrum-icons/workflow/StopCircle';
import UserAdmin from '@spectrum-icons/workflow/UserAdmin';
import React from 'react';
import type { MeshStatus, StatusDisplay } from '../hooks/useDashboardStatus';
import { DashboardTile } from './DashboardTile';
import { IntegrationsSummaryTile } from './IntegrationsSummaryTile';
import type { AppBuilderComponentState } from '@/types/base';

/** Overflow menu item keys. */
type OverflowKey =
    | 'export'
    | 'syncStorefront'
    | 'refreshBlockLibrary'
    | 'devConsole'
    | 'reset'
    | 'delete';

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
     * Integrations summary tile inputs. The tile lives in the BUILD zone beside
     * Configure — integrations are a "set this up" concern, not a run-time
     * action, and grouping it there keeps the row to a single line.
     */
    hasAdobeContext?: boolean;
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
    /** Handler for Refresh Block Library overflow item (EDS projects only) */
    handleRefreshBlockLibrary?: () => void;
    /** Handler for Republish Content overflow item (EDS projects only) */
    handleRepublishContent?: () => void;
    /** Handler for Configure button */
    handleConfigure: () => void;
    /** Handler for Dev Console button (overflow menu) */
    handleOpenDevConsole: () => void;
    /**
     * Handler for the Edit overflow item. Opens the wizard in edit mode for
     * the current project. Optional — gated like the kebab's Edit action
     * (EDS always; non-EDS only while stopped).
     */
    handleEditProject?: () => void;
    /** Handler for the Export overflow item */
    handleExportProject: () => void;
    /** Handler for the Reset overflow item (always shown, last in the menu) */
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
 * Start and Stop as ONE tile — they were always mutually exclusive, and merging
 * them lets the dot and tooltip be written once rather than twice.
 *
 * The tile shows running-vs-stopped by which verb it offers, so steady states
 * carry no dot. It cannot show the states in between, or a failure — mid-start
 * and mid-failure look identical on it — so those get one, with the wording in
 * the tooltip. That wording used to sit on the surface as a masthead badge.
 */
function LifecycleTile({
    isRunning,
    isDisabled,
    dot,
    statusText,
    onPress,
}: {
    isRunning: boolean;
    isDisabled: boolean;
    dot: 'info' | 'error' | undefined;
    statusText: string | undefined;
    onPress: () => void;
}): React.ReactElement {
    const label = isRunning ? 'Stop' : 'Start';
    return (
        <DashboardTile
            label={label}
            icon={isRunning ? <StopCircle size="L" /> : <PlayCircle size="L" />}
            onPress={onPress}
            isDisabled={isDisabled}
            className="dashboard-action-button--hero"
            tooltip={statusText ?? `${label} the demo`}
            status={
                dot
                    ? {
                          variant: dot,
                          // The status text IS the explanation here — "Starting…",
                          // "Error" — so the dot reuses it rather than inventing
                          // second wording for the same state.
                          tooltip: statusText ?? label,
                          testId: 'lifecycle-tile-dot',
                      }
                    : undefined
            }
        />
    );
}

/**
 * Route a "More" menu key to its handler.
 *
 * A lookup rather than a switch, and outside the component: six cases inline
 * were most of what pushed ActionGrid past its complexity limit. `OverflowKey`
 * keys the record, so adding a menu item without wiring it fails to typecheck.
 */
function dispatchOverflow(
    key: React.Key,
    handlers: Record<OverflowKey, (() => void) | undefined>,
): void {
    handlers[key as OverflowKey]?.();
}

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
 * A remedy tile: the action that fixes a state, wearing a dot when it is needed.
 *
 * Replaces a StatusCard row placed inside the zone, which dangled off the end of
 * the tile row and broke the grid. What was missing was a tile to put the dot
 * on, because both remedies lived elsewhere — Republish Content in the More
 * overflow, Restart nowhere at all.
 *
 * The tile is PERMANENT and only the dot varies. A tile that appeared only when
 * something was wrong would make its own presence the status signal — the flaw
 * that got `Redeploy Mesh` removed from the project kebab — and would reshuffle
 * the grid as the user watched.
 */
function RemedyTile({
    label,
    tooltip,
    idleTooltip,
    needed,
    icon,
    testId,
    onPress,
}: {
    label: string;
    /** Shown when the fix is due. */
    tooltip: string;
    /** Shown otherwise — never the bare label, which would say nothing. */
    idleTooltip: string;
    needed: boolean;
    icon: React.ReactNode;
    testId: string;
    onPress: () => void;
}): React.ReactElement {
    return (
        <DashboardTile
            label={label}
            icon={icon}
            onPress={onPress}
            action={testId}
            tooltip={idleTooltip}
            status={needed ? { variant: 'warning', tooltip, testId: `${testId}-dot` } : undefined}
        />
    );
}

/**
 * The Primary zone — the surfaces you use the project through, plus Edit.
 *
 * Extracted whole: its conditionals were most of ActionGrid's complexity budget
 * (eslint counts every `&&`/`?:`), and collapsing individual branches inline
 * kept trading one operator for another. A zone is a cohesive unit; giving it a
 * component is cheaper than shaving expressions.
 */
function PrimaryZone({
    isEds,
    isRunning,
    isStartDisabled,
    isStopDisabled,
    isOpeningBrowser,
    lifecycleDot,
    statusText,
    canRestart,
    needsRestart,
    canEdit,
    handleStartDemo,
    handleStopDemo,
    handleRestartDemo,
    handleOpenBrowser,
    handleOpenLiveSite,
    handleOpenDaLive,
    handleOpenAdminPanel,
    handleEditProject,
}: {
    isEds: boolean;
    isRunning: boolean;
    isStartDisabled: boolean;
    isStopDisabled: boolean;
    isOpeningBrowser: boolean;
    lifecycleDot: 'info' | 'error' | undefined;
    statusText: string | undefined;
    canRestart: boolean;
    needsRestart: boolean;
    canEdit: boolean;
    handleStartDemo: () => void;
    handleStopDemo: () => void;
    handleRestartDemo?: () => void;
    handleOpenBrowser: () => void;
    handleOpenLiveSite?: () => void;
    handleOpenDaLive?: () => void;
    handleOpenAdminPanel: () => void;
    handleEditProject?: () => void;
}): React.ReactElement {
    return (
        <div className="dashboard-zone-section" data-zone="primary">
            <div className="dashboard-zone-grid">
                {!isEds && (
                    <LifecycleTile
                        isRunning={isRunning}
                        isDisabled={isRunning ? isStopDisabled : isStartDisabled}
                        dot={lifecycleDot}
                        statusText={statusText}
                        onPress={isRunning ? handleStopDemo : handleStartDemo}
                    />
                )}

                {/* Restart — the fix for a config change that landed while
                    running. No runtime status card sits in this zone:
                    Start/Stop already says whether the demo is up, and a
                    green dot on "Stop" meaning "running" is the same fact
                    twice. Only the amber "you need this" is new. */}
                {canRestart && handleRestartDemo && (
                    <RemedyTile
                        label="Restart"
                        tooltip="Restart needed — configuration changed since the demo started"
                        idleTooltip="Stop and start the demo again"
                        needed={needsRestart}
                        icon={<Refresh size="L" />}
                        testId="restart-tile"
                        onPress={handleRestartDemo}
                    />
                )}

                {/* Open in Browser — EDS opens the live site, non-EDS the
                    local demo. ONE button: the two branches differed only
                    in handler and disabled-when, and duplicating the tile
                    to express that cost a whole ternary of complexity. */}
                <ActionButton
                    onPress={isEds ? handleOpenLiveSite : handleOpenBrowser}
                    isQuiet
                    isDisabled={isOpeningBrowser || (!isEds && !isRunning)}
                    UNSAFE_className="dashboard-action-button dashboard-action-button--hero"
                >
                    <Globe size="L" />
                    <Text UNSAFE_className="icon-label">Open in Browser</Text>
                </ActionButton>

                {/* Author — EDS only. Static label: the resolved authoring
                    experience decides WHERE this opens (backend-side),
                    not the tile text. */}
                {isEds && (
                    <ActionButton
                        onPress={handleOpenDaLive}
                        isQuiet
                        isDisabled={isOpeningBrowser}
                        UNSAFE_className="dashboard-action-button dashboard-action-button--hero"
                    >
                        <Edit size="L" />
                        <Text UNSAFE_className="icon-label">Author Content</Text>
                    </ActionButton>
                )}

                {/* Manage Commerce — always visible; the admin URL (optional
                    ADOBE_COMMERCE_ADMIN_URL) resolves backend-side, so no
                    isOpeningBrowser gating here. */}
                <ActionButton
                    onPress={handleOpenAdminPanel}
                    isQuiet
                    UNSAFE_className="dashboard-action-button dashboard-action-button--hero"
                >
                    <UserAdmin size="L" />
                    <Text UNSAFE_className="icon-label">Manage Commerce</Text>
                </ActionButton>

                {handleEditProject && (
                    <EditTile canEdit={canEdit} onPress={handleEditProject} />
                )}
            </div>
        </div>
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
    handleEditProject,
    handleExportProject,
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
    // failure — mid-start and mid-failure look identical on it — so those get
    // one, and the tooltip carries the words that used to sit on the surface.
    const lifecycleDot = LIFECYCLE_DOT[demoStatus?.color ?? 'green'];
    const handleOverflowAction = (key: React.Key): void =>
        dispatchOverflow(key, {
            export: handleExportProject,
            syncStorefront: handleSyncStorefront,
            refreshBlockLibrary: handleRefreshBlockLibrary,
            devConsole: handleOpenDevConsole,
            reset: handleResetProject,
            delete: handleDeleteProject,
        });

    return (
        <div className="dashboard-zones">
            {/* Action row — Primary (universal) + Storefront (EDS-only) + Build,
                side by side as one bar. Storefront hides on non-EDS; groups wrap
                to the next line only if the band is too narrow. */}
            <div className="dashboard-zone-row">
                {/* Primary zone — the surfaces you use the project through:
                    see it as a customer (Open in Browser) and edit it as a
                    creator (Author Content, EDS only). Start/Stop also
                    lives here for non-EDS projects as their lifecycle
                    equivalent. */}
                <PrimaryZone
                    isEds={isEds}
                    isRunning={isRunning}
                    isStartDisabled={isStartDisabled}
                    isStopDisabled={isStopDisabled}
                    isOpeningBrowser={isOpeningBrowser}
                    lifecycleDot={lifecycleDot}
                    statusText={demoStatus?.text}
                    canRestart={canRestart}
                    needsRestart={needsRestart}
                    canEdit={canEdit}
                    handleStartDemo={handleStartDemo}
                    handleStopDemo={handleStopDemo}
                    handleRestartDemo={handleRestartDemo}
                    handleOpenBrowser={handleOpenBrowser}
                    handleOpenLiveSite={handleOpenLiveSite}
                    handleOpenDaLive={handleOpenDaLive}
                    handleOpenAdminPanel={handleOpenAdminPanel}
                    handleEditProject={handleEditProject}
                />

                {/* Storefront cluster — EDS only. Sync Storefront pushes
                    storefront code; placed adjacent to the Author surface so
                    storefront-related actions are visually grouped. */}
                {isEds && (
                    <div className="dashboard-zone-section" data-zone="storefront">
                        <div className="dashboard-zone-grid">

                            {/* Republish — config.json + authored DA.live content to
                                the CDN. It carries the drift dot, NOT Sync
                                Storefront: Sync pushes storefront CODE and never
                                touches edsStorefrontStatusSummary, so a dot there
                                would point at a button that does not fix the state
                                it reports. Only storefrontRepublishService clears
                                it. */}
                            {handleRepublishContent && (
                                <RemedyTile
                                    label="Republish"
                                    tooltip="Republish needed — configuration changed since the last publish"
                                    idleTooltip="Push config and authored content to the CDN"
                                    needed={needsRepublish}
                                    icon={<Replay size="L" />}
                                    testId="republish-tile"
                                    onPress={handleRepublishContent}
                                />
                            )}
                        </div>
                    </div>
                )}
                {/* Build zone — deploy/configure plus an overflow menu. On the same
                    row as Primary + Storefront so the action groups read as a single
                    bar; tiles pack left within the group. */}
                <div className="dashboard-zone-section" data-zone="build">
                    <div className="dashboard-zone-grid">
                        <ActionButton
                            onPress={handleConfigure}
                            isQuiet
                            isDisabled={isMeshActionDisabled}
                            UNSAFE_className="dashboard-action-button"
                        >
                            <Settings size="L" />
                            <Text UNSAFE_className="icon-label">Configure</Text>
                        </ActionButton>

                        {/* Integrations — the whole integrations footprint on the
                            dashboard (count + worst status), routing to the
                            dedicated surface. Renders nothing without an Adobe org. */}
                        <IntegrationsSummaryTile
                            hasAdobeContext={hasAdobeContext}
                            appBuilderComponents={appBuilderComponents}
                            hasMesh={hasMesh}
                            meshStatus={meshStatus}
                        />

                        {/* Overflow — rarely used actions tucked into a menu */}
                        <MenuTrigger>
                            <ActionButton
                                isQuiet
                                UNSAFE_className="dashboard-action-button"
                                aria-label="More actions"
                            >
                                <More size="L" />
                                <Text UNSAFE_className="icon-label">More</Text>
                            </ActionButton>
                            <Menu onAction={handleOverflowAction}>
                                <Item key="export">Export</Item>
                                {isEds && handleSyncStorefront ? (
                                    <Item key="syncStorefront">Sync Storefront</Item>
                                ) : null}
                                {isEds && handleRefreshBlockLibrary ? (
                                    <Item key="refreshBlockLibrary">Refresh Block Library</Item>
                                ) : null}
                                <Item key="devConsole">Dev Console</Item>
                                <Item key="reset">Reset</Item>
                                {/* Destructive — LAST, per overflow-menu convention.
                                    The confirm dialog behind handleDeleteProject
                                    remains the real safety net. */}
                                <Item key="delete" textValue="Delete">
                                    <Text UNSAFE_className="menu-item-destructive">Delete</Text>
                                </Item>
                            </Menu>
                        </MenuTrigger>
                    </div>
                </div>
            </div>
        </div>
    );
}
