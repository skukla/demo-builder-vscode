/**
 * Open-row card that opens this demo's Datapacks, beside Integrations (owner, 2026-11-05: it had been
 * in Build, as Integrations was until 2026-10-06).
 *
 * **Its line names the demo's pack** ("Luma, eds-compatible", or "No Datapack"; owner,
 * 2026-11-07). The sidebar's Datapacks tile opens the Datapack Library, every pack; this card opens
 * the project's Datapacks, named for the project, where Import and Save Changes live. The line is
 * what tells the two apart, so it is the one Open card whose line says what the demo holds rather
 * than where the card leads. The extension reads it (`get-datapack-line`), and the card reads it
 * again each time the dashboard comes back into view: an import in the Datapacks tab changes it.
 *
 * **Not a tab replacement, unlike Integrations.** `openIntegrations` disposes
 * the dashboard panel and opens in place, because that surface is scoped to the
 * project you came from. Datapacks opens beside the dashboard, so it does not
 * close what you were looking at. The command's own registration records that
 * decision; the separate `openDataInstaller` message is how this tile honours it.
 *
 * No status dot. The demo's data is not a deployed artifact with a health state, and
 * a dot here would invent one.
 *
 * @module features/dashboard/ui/components/DataInstallerTile
 */

import Box from '@spectrum-icons/workflow/Box';
import React, { useEffect, useState } from 'react';
import { DashboardTile } from './DashboardTile';
import { webviewClient } from '@/core/ui/utils/WebviewClient';

/** The card's line from the extension, read now and whenever the dashboard is shown again. */
function useDatapackLine(): string | undefined {
    const [line, setLine] = useState<string | undefined>(undefined);
    useEffect(() => {
        let live = true;
        const read = (): void => {
            webviewClient
                .request<{ success?: boolean; data?: { line?: string } }>('get-datapack-line', {})
                .then((answer) => {
                    if (live && answer?.success && answer.data?.line) setLine(answer.data.line);
                })
                .catch(() => undefined);
        };
        const onShown = (): void => {
            if (document.visibilityState === 'visible') read();
        };
        read();
        document.addEventListener('visibilitychange', onShown);
        return () => {
            live = false;
            document.removeEventListener('visibilitychange', onShown);
        };
    }, []);
    return line;
}

export function DataInstallerTile(): React.ReactElement {
    const line = useDatapackLine();
    return (
        <DashboardTile
            label="Datapacks"
            description={line}
            icon={<Box size="L" />}
            onPress={() => webviewClient.postMessage('openDataInstaller')}
            action="dataInstaller"
            tooltip="This demo's datapack: import it, save its changes, or choose another"
        />
    );
}
