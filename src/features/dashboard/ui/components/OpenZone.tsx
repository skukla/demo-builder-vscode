import Code from '@spectrum-icons/workflow/Code';
import Edit from '@spectrum-icons/workflow/Edit';
import Globe from '@spectrum-icons/workflow/Globe';
import ImageAlbum from '@spectrum-icons/workflow/ImageAlbum';
import PlayCircle from '@spectrum-icons/workflow/PlayCircle';
import Refresh from '@spectrum-icons/workflow/Refresh';
import StopCircle from '@spectrum-icons/workflow/StopCircle';
import UserAdmin from '@spectrum-icons/workflow/UserAdmin';
import React from 'react';
import { DashboardTile } from './DashboardTile';
import { DashboardZone, RemedyTile } from './DashboardZone';

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

/** A tile whose host handler is optional still needs something to press. */
const NOOP = (): void => undefined;

/**
 * The Open zone — where you go to use the project: see it as a customer, edit
 * it as a creator, manage it as an admin, and reach its assets and its Adobe
 * project. Every tile opens a surface; none changes the project.
 *
 * Extracted whole: its conditionals were most of ActionGrid's complexity budget
 * (eslint counts every `&&`/`?:`), and a zone is a cohesive unit.
 */
export function OpenZone({
    isEds,
    isRunning,
    isStartDisabled,
    isStopDisabled,
    isOpeningBrowser,
    lifecycleDot,
    statusText,
    canRestart,
    needsRestart,
    handleStartDemo,
    handleStopDemo,
    handleRestartDemo,
    handleOpenBrowser,
    handleOpenLiveSite,
    handleOpenDaLive,
    handleOpenAdminPanel,
    handleOpenAemAssets,
    handleOpenDevConsole,
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
    handleStartDemo: () => void;
    handleStopDemo: () => void;
    handleRestartDemo?: () => void;
    handleOpenBrowser: () => void;
    handleOpenLiveSite?: () => void;
    handleOpenDaLive?: () => void;
    handleOpenAdminPanel: () => void;
    handleOpenAemAssets: () => void;
    handleOpenDevConsole: () => void;
}): React.ReactElement {
    return (
        <DashboardZone id="open" title="Open">
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
                running. Start/Stop already says whether the demo is up, so
                only the amber "you need this" is new. */}
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

            {/* Open in Browser — EDS opens the live site, non-EDS the local
                demo. ONE tile: the two differed only in handler and
                disabled-when. */}
            <DashboardTile
                label="Open in Browser"
                icon={<Globe size="L" />}
                onPress={isEds ? (handleOpenLiveSite ?? NOOP) : handleOpenBrowser}
                isDisabled={isOpeningBrowser || (!isEds && !isRunning)}
                className={isEds ? 'dashboard-action-button--hero' : undefined}
            />

            {/* Author — EDS only. Static label: the resolved authoring
                experience decides WHERE this opens (backend-side). */}
            {isEds && (
                <DashboardTile
                    label="Author Content"
                    icon={<Edit size="L" />}
                    onPress={handleOpenDaLive ?? NOOP}
                    isDisabled={isOpeningBrowser}
                />
            )}

            {/* Manage Commerce — always visible; the admin URL resolves
                backend-side, so no isOpeningBrowser gating here. */}
            <DashboardTile
                label="Manage Commerce"
                icon={<UserAdmin size="L" />}
                onPress={handleOpenAdminPanel}
            />

            {/* AEM Assets (EDS-21) — every project type: the bound AEM is a
                Demo Builder setting, not a property of the project, and the
                host offers the setting when none is bound. */}
            <DashboardTile
                label="AEM Assets"
                icon={<ImageAlbum size="L" />}
                onPress={handleOpenAemAssets}
                tooltip="Open the AEM environment your storefronts use for images and assets"
            />

            <DashboardTile
                label="Dev Console"
                icon={<Code size="L" />}
                onPress={handleOpenDevConsole}
                tooltip="Open this project in the Adobe Developer Console"
            />
        </DashboardZone>
    );
}

