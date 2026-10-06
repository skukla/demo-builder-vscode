import Code from '@spectrum-icons/workflow/Code';
import ImageAlbum from '@spectrum-icons/workflow/ImageAlbum';
import React from 'react';
import { DashboardTile } from './DashboardTile';
import { DashboardZone } from './DashboardZone';

/**
 * The Consoles zone — the Adobe web consoles behind the demo, opened during
 * setup rather than in front of a customer. Last of the compact lists, so on a
 * wide panel it sits under the last Open card.
 *
 * It was a list beside the Open cards until 2026-10-06, when Integrations became
 * a fourth card: beside four cards it ran past the content band that every
 * screen shares (the right edge "All Projects" marks), so it moved down into the
 * tier where it makes four columns under four cards.
 */
export function ConsolesZone({
    handleOpenAemAssets,
    handleOpenDevConsole,
}: {
    handleOpenAemAssets: () => void;
    handleOpenDevConsole: () => void;
}): React.ReactElement {
    return (
        <DashboardZone id="consoles" title="Consoles" compact>
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
