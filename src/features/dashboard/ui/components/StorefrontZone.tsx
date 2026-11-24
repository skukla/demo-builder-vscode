import Draft from '@spectrum-icons/workflow/Draft';
import Sync from '@spectrum-icons/workflow/Sync';
import UploadToCloud from '@spectrum-icons/workflow/UploadToCloud';
import UserGroup from '@spectrum-icons/workflow/UserGroup';
import ViewGrid from '@spectrum-icons/workflow/ViewGrid';
import React from 'react';
import { DashboardTile } from './DashboardTile';
import { DashboardZone, RemedyTile } from './DashboardZone';

/** The Draft Examples tile (EDS-71 step 4c): what pressing it does, and its dot's count. */
export interface DraftExamplesTile {
    /**
     * Blocks the last DA.live block list build left with no example; the dot shows above 0.
     * Undefined when no build has recorded it yet (a project made before the record).
     */
    count: number | undefined;
    /** Opens the SC's AI with the Draft Block Examples prompt. */
    onPress: () => void;
}

/** The Draft Examples dot's words: "13 blocks have no example", "1 block has no example". */
function noExampleTooltip(count: number): string {
    return count === 1 ? '1 block has no example' : `${count} blocks have no example`;
}

/** The hover with no dot: every block has one, or nothing has checked yet. */
function exampleIdleTooltip(count: number | undefined): string {
    if (count === undefined) return 'Refresh Blocks to check which blocks have no example';
    return 'Every block has an example';
}

/**
 * The Storefront zone (EDS only) — keeping the site itself in shape.
 *
 * Republish carries the drift dot, NOT Sync Storefront (and the dot of the Finish Setup step
 * Republish the Code, PL-101): Sync pushes storefront CODE
 * and never touches edsStorefrontStatusSummary, so a dot there would point at a
 * button that does not fix the state it reports. Only storefrontRepublishService
 * clears it.
 *
 * There is no Storefront Report tile (removed 2026-10-23, EDS-64): Diagnostics and the
 * get_storefront_report tool carry what it said, and a reset's last view names broken links.
 *
 * Draft Examples (EDS-71 step 4c) is a remedy tile too: its dot is the blocks the last block list
 * build left with no example, and pressing it opens the SC's AI to write them.
 */
export function StorefrontZone({
    needsRepublish,
    republishTooltip,
    handleRepublishContent,
    handleSyncStorefront,
    handleRefreshBlockLibrary,
    handleOpenSiteAccess,
    draftExamples,
}: {
    needsRepublish: boolean;
    /** Why Republish is needed, when a Finish Setup step says so (PL-101); else the drift's words. */
    republishTooltip?: string;
    handleRepublishContent?: () => void;
    handleSyncStorefront?: () => void;
    handleRefreshBlockLibrary?: () => void;
    handleOpenSiteAccess?: () => void;
    draftExamples?: DraftExamplesTile;
}): React.ReactElement {
    return (
        <DashboardZone id="storefront" title="Storefront" compact>
            {handleRepublishContent && (
                <RemedyTile
                    label="Republish"
                    tooltip={republishTooltip ?? 'Republish needed — configuration changed since the last publish'}
                    idleTooltip="Push config and authored content to the CDN"
                    needed={needsRepublish}
                    icon={<UploadToCloud size="L" />}
                    testId="republish-tile"
                    onPress={handleRepublishContent}
                />
            )}
            {handleSyncStorefront && (
                <DashboardTile
                    label="Sync Storefront"
                    icon={<Sync size="L" />}
                    onPress={handleSyncStorefront}
                    action="sync-storefront"
                    tooltip="Push your local storefront code changes to GitHub"
                />
            )}
            {handleRefreshBlockLibrary && (
                <DashboardTile
                    label="Refresh Blocks"
                    icon={<ViewGrid size="L" />}
                    onPress={handleRefreshBlockLibrary}
                    action="refresh-block-library"
                    tooltip="Rebuild the DA.live block list from the storefront's code and pages"
                />
            )}
            {draftExamples && (
                <RemedyTile
                    label="Draft Examples"
                    tooltip={noExampleTooltip(draftExamples.count ?? 0)}
                    idleTooltip={exampleIdleTooltip(draftExamples.count)}
                    needed={(draftExamples.count ?? 0) > 0}
                    icon={<Draft size="L" />}
                    testId="draft-examples-tile"
                    onPress={draftExamples.onPress}
                />
            )}
            {handleOpenSiteAccess && (
                <DashboardTile
                    label="Site Access"
                    icon={<UserGroup size="L" />}
                    onPress={handleOpenSiteAccess}
                    action="site-access"
                    tooltip="Who administers the storefront and who can read its content"
                />
            )}
        </DashboardZone>
    );
}
