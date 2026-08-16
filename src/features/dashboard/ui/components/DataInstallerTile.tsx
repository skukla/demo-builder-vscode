/**
 * Build-zone tile that opens the Data Installer.
 *
 * Sits beside the Integrations tile because both route to a dedicated surface,
 * which is what the Build zone holds.
 *
 * **Not a tab replacement, unlike its neighbour.** `openIntegrations` disposes
 * the dashboard panel and opens in place, because that surface is scoped to the
 * project you came from. The datapack catalog is global to the SERVICE — the
 * same packs whatever project is open — so browsing it must not close what you
 * were looking at. The command's own registration records that decision; the
 * separate `openDataInstaller` message is how this tile honours it.
 *
 * No status dot. The catalog is not a project artifact with a health state, and
 * a dot here would invent one.
 *
 * @module features/dashboard/ui/components/DataInstallerTile
 */

import Data from '@spectrum-icons/workflow/Data';
import React from 'react';
import { DashboardTile } from './DashboardTile';
import { webviewClient } from '@/core/ui/utils/WebviewClient';

export function DataInstallerTile(): React.ReactElement {
    return (
        <DashboardTile
            label="Sample Data"
            icon={<Data size="L" />}
            onPress={() => webviewClient.postMessage('openDataInstaller')}
            action="dataInstaller"
            tooltip="Browse and install Adobe Commerce sample-data datapacks"
        />
    );
}
