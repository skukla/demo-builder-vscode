/**
 * Open-row card that opens this demo's Datapacks, beside Integrations (owner, 2026-11-05: it had been
 * in Build, as Integrations was until 2026-10-06).
 *
 * **Its line names the demo's pack** ("Luma, eds-compatible", or "None"; owner,
 * 2026-11-07, and step-04 S9). The sidebar's Datapacks tile opens the Datapack Library, every pack; this card opens
 * the project's Datapacks, named for the project, where Import and Save Changes live. The line is
 * what tells the two apart, so it is the one Open card whose line says what the demo holds rather
 * than where the card leads. The extension reads it (`get-datapack-line`), and the card reads it
 * again each time the dashboard comes back into view, and whenever the packs change.
 *
 * **Not a tab replacement, unlike Integrations.** `openIntegrations` disposes
 * the dashboard panel and opens in place, because that surface is scoped to the
 * project you came from. Datapacks opens beside the dashboard, so it does not
 * close what you were looking at. The command's own registration records that
 * decision; the separate `openDataInstaller` message is how this tile honours it.
 *
 * **One dot: a failed install** (step-04 J6-4). When the project's datapack failed to install, the
 * card wears the error dot and its hover says "Install failed", the datapack status vocabulary's
 * words; the line stays the bare name, with no reason beside it (the reason is in the Datapacks
 * flyout). Otherwise no dot: the demo's data is not a deployed artifact with a health state.
 *
 * @module features/dashboard/ui/components/DataInstallerTile
 */

import Box from '@spectrum-icons/workflow/Box';
import React, { useEffect, useState } from 'react';
import { DashboardTile, type DashboardTileStatus } from './DashboardTile';
import { getDatapackStatusDisplay, severityToDot } from '@/core/ui/utils/statusVocabulary';
import { webviewClient } from '@/core/ui/utils/WebviewClient';
import { DATAPACK_LIST_CHANGED_MESSAGE } from '@/features/data-installer/types';
import type { DatapackLine } from '@/types/datapack';

/** The dot for a failed install, in the vocabulary's words; a vocabulary without them fails at load. */
function failedStatus(): DashboardTileStatus {
    const entry = getDatapackStatusDisplay('install-failed');
    if (!entry) throw new Error('The status vocabulary has no install-failed entry.');
    return { variant: severityToDot(entry.severity), tooltip: entry.label, testId: 'datapacks-failed' };
}

const FAILED_STATUS = failedStatus();

/** The card's line from the extension, read now and whenever the dashboard is shown again. */
function useDatapackLine(): DatapackLine | undefined {
    const [line, setLine] = useState<DatapackLine | undefined>(undefined);
    useEffect(() => {
        let live = true;
        const read = (): void => {
            webviewClient
                .request<{ success?: boolean; data?: DatapackLine }>('get-datapack-line', {})
                .then((answer) => {
                    if (live && answer?.success && answer.data?.line) setLine(answer.data);
                })
                .catch(() => undefined);
        };
        const onShown = (): void => {
            if (document.visibilityState === 'visible') read();
        };
        read();
        document.addEventListener('visibilitychange', onShown);
        // The packs changed (an install or uninstall here, in the Datapacks tab, or by an agent):
        // coming back to the tab alone did not re-read it (release test 1.10, 2026-11-16).
        const stopFollowing = webviewClient.onMessage(DATAPACK_LIST_CHANGED_MESSAGE, read);
        return () => {
            live = false;
            document.removeEventListener('visibilitychange', onShown);
            stopFollowing();
        };
    }, []);
    return line;
}

export function DataInstallerTile(): React.ReactElement {
    const line = useDatapackLine();
    return (
        <DashboardTile
            label="Datapacks"
            description={line?.line}
            icon={<Box size="L" />}
            onPress={() => webviewClient.postMessage('openDataInstaller')}
            action="dataInstaller"
            tooltip="Install, save or change this demo's datapack"
            status={line?.failed ? FAILED_STATUS : undefined}
        />
    );
}
