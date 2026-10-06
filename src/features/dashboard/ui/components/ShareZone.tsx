import ExportIcon from '@spectrum-icons/workflow/Export';
import SaveFloppy from '@spectrum-icons/workflow/SaveFloppy';
import Switch from '@spectrum-icons/workflow/Switch';
import React from 'react';
import { DashboardTile } from './DashboardTile';
import { DashboardZone } from './DashboardZone';

/**
 * The Share zone — moving a demo between people. Export hands it to someone
 * else; Save as Demo Package makes it a card on your own Welcome step; Change
 * Demo Source points a project built on someone else's demo at another copy.
 */
export function ShareZone({
    isEds,
    handleExportProject,
    handleSaveDemoPackage,
    handleChangeDemoSource,
}: {
    isEds: boolean;
    handleExportProject: () => void;
    handleSaveDemoPackage?: () => void;
    handleChangeDemoSource?: () => void;
}): React.ReactElement {
    return (
        <DashboardZone id="share" title="Share">
            <DashboardTile
                label="Export"
                icon={<ExportIcon size="L" />}
                onPress={handleExportProject}
                action="export"
                tooltip="Hand this demo to a colleague, as a link or a file"
            />
            {isEds && handleSaveDemoPackage && (
                <DashboardTile
                    label="Save as Demo Package"
                    icon={<SaveFloppy size="L" />}
                    onPress={handleSaveDemoPackage}
                    action="save-demo-package"
                    tooltip="Make this storefront a card on your Welcome step"
                />
            )}
            {handleChangeDemoSource && (
                <DashboardTile
                    label="Change Demo Source"
                    icon={<Switch size="L" />}
                    onPress={handleChangeDemoSource}
                    action="change-demo-source"
                    tooltip="Point this project at another copy of the demo it was built on"
                />
            )}
        </DashboardZone>
    );
}

