import ShareIcon from '@spectrum-icons/workflow/Share';
import Switch from '@spectrum-icons/workflow/Switch';
import React from 'react';
import { DashboardTile } from './DashboardTile';
import { DashboardZone } from './DashboardZone';

/**
 * The Share zone — moving a demo between people. Share Demo opens the one
 * dialog for a link or a file (owner, 2026-10-22: Export and Save as Package
 * were two tiles for one job); Change Source points a project built on
 * someone else's demo at another copy.
 */
export function ShareZone({
    handleShareDemo,
    handleChangeDemoSource,
}: {
    handleShareDemo: () => void;
    handleChangeDemoSource?: () => void;
}): React.ReactElement {
    return (
        <DashboardZone id="share" title="Share" compact>
            <DashboardTile
                label="Share Demo"
                icon={<ShareIcon size="L" />}
                onPress={handleShareDemo}
                action="share-demo"
                tooltip="Hand this demo to a colleague, as a link or a file"
            />
            {handleChangeDemoSource && (
                <DashboardTile
                    label="Change Source"
                    icon={<Switch size="L" />}
                    onPress={handleChangeDemoSource}
                    action="change-demo-source"
                    tooltip="Change the demo source: point this project at another copy of the demo it was built on"
                />
            )}
        </DashboardZone>
    );
}
