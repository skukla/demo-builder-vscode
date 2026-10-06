import Sync from '@spectrum-icons/workflow/Sync';
import UploadToCloud from '@spectrum-icons/workflow/UploadToCloud';
import UserGroup from '@spectrum-icons/workflow/UserGroup';
import ViewGrid from '@spectrum-icons/workflow/ViewGrid';
import React from 'react';
import { DashboardTile } from './DashboardTile';
import { DashboardZone, RemedyTile } from './DashboardZone';

/**
 * The Storefront zone (EDS only) — keeping the site itself in shape.
 *
 * Republish carries the drift dot, NOT Sync Storefront: Sync pushes storefront CODE
 * and never touches edsStorefrontStatusSummary, so a dot there would point at a
 * button that does not fix the state it reports. Only storefrontRepublishService
 * clears it.
 */
export function StorefrontZone({
    needsRepublish,
    handleRepublishContent,
    handleSyncStorefront,
    handleRefreshBlockLibrary,
    handleOpenSiteAccess,
}: {
    needsRepublish: boolean;
    handleRepublishContent?: () => void;
    handleSyncStorefront?: () => void;
    handleRefreshBlockLibrary?: () => void;
    handleOpenSiteAccess?: () => void;
}): React.ReactElement {
    return (
        <DashboardZone id="storefront" title="Storefront" compact>
            {handleRepublishContent && (
                <RemedyTile
                    label="Republish"
                    tooltip="Republish needed — configuration changed since the last publish"
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
                    tooltip="Refresh the block library: bring in the latest blocks from your block libraries"
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

