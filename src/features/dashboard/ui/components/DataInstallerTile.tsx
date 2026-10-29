/**
 * Build-zone tile that opens the Data Installer.
 *
 * Routes to a dedicated surface, like the Integrations card in the Open row
 * (which sat beside it in Build until 2026-10-06).
 *
 * **Not a tab replacement, unlike Integrations.** `openIntegrations` disposes
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

import Box from '@spectrum-icons/workflow/Box';
import React from 'react';
import { DashboardTile } from './DashboardTile';
import { webviewClient } from '@/core/ui/utils/WebviewClient';

export function DataInstallerTile(): React.ReactElement {
    return (
        <DashboardTile
            label="Datapacks"
            icon={<Box size="L" />}
            onPress={() => webviewClient.postMessage('openDataInstaller')}
            action="dataInstaller"
            tooltip="Browse and install Adobe Commerce sample-data datapacks"
        />
    );
}
