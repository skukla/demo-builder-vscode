import FileTxt from '@spectrum-icons/workflow/FileTxt';
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
 *
 * Storefront Report wears a dot when there is something in it to read: links in
 * the content to pages that do not exist (2026-10-07). It is where they are
 * listed, with the page each is on, instead of a pop-up on every create and reset.
 */
export function StorefrontZone({
    needsRepublish,
    handleRepublishContent,
    handleSyncStorefront,
    handleRefreshBlockLibrary,
    handleOpenSiteAccess,
    handleOpenStorefrontReport,
    brokenLinkCount = 0,
}: {
    needsRepublish: boolean;
    handleRepublishContent?: () => void;
    handleSyncStorefront?: () => void;
    handleRefreshBlockLibrary?: () => void;
    handleOpenSiteAccess?: () => void;
    handleOpenStorefrontReport?: () => void;
    /** Above zero, the report tile wears a dot saying so. */
    brokenLinkCount?: number;
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
            {handleOpenStorefrontReport && (
                <DashboardTile
                    label="Storefront Report"
                    icon={<FileTxt size="L" />}
                    onPress={handleOpenStorefrontReport}
                    action="storefront-report"
                    tooltip="What this storefront is built on, and anything in it to look at"
                    status={
                        brokenLinkCount > 0
                            ? {
                                  variant: 'info',
                                  tooltip: brokenLinksTooltip(brokenLinkCount),
                                  label: 'Broken links',
                                  testId: 'storefront-report-dot',
                              }
                            : undefined
                    }
                />
            )}
        </DashboardZone>
    );
}

/** "2 links go to pages that don't exist. Open the report to see where." */
function brokenLinksTooltip(count: number): string {
    const links = count === 1 ? '1 link goes' : `${count} links go`;
    return `${links} to pages that don't exist. Open the report to see where.`;
}

