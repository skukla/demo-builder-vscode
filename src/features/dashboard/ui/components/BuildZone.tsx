import Delete from '@spectrum-icons/workflow/Delete';
import Edit from '@spectrum-icons/workflow/Edit';
import ImageAlbum from '@spectrum-icons/workflow/ImageAlbum';
import Revert from '@spectrum-icons/workflow/Revert';
import Settings from '@spectrum-icons/workflow/Settings';
import React from 'react';
import { DashboardTile } from './DashboardTile';
import { DashboardZone } from './DashboardZone';
import { DataInstallerTile } from './DataInstallerTile';

/**
 * Edit — reopens the creation wizard: which brand, stack, components and block
 * libraries the demo HAS. Configure, beside it, changes their VALUES.
 *
 * DISABLED rather than hidden while a non-EDS demo runs (the wizard cannot
 * re-shape a running project): hiding it would reshuffle the row every time the
 * demo starts or stops. EDS has no running state, so it is always enabled there.
 *
 * Extracted for the same reason as its siblings — inline, its conditional plus
 * tooltip ternary pushed ActionGrid past the complexity limit.
 */
function EditTile({
    canEdit,
    onPress,
}: {
    canEdit: boolean;
    onPress: () => void;
}): React.ReactElement {
    return (
        <DashboardTile
            label="Edit"
            icon={<Edit size="L" />}
            onPress={onPress}
            action="edit"
            isDisabled={!canEdit}
            tooltip={
                canEdit
                    ? 'Change the demo\u2019s brand, stack, components or block libraries'
                    : 'Stop the demo to change what it contains'
            }
        />
    );
}

/**
 * The Build zone — what the demo contains, then Reset and Delete: the two
 * rare, destructive actions. Delete is last, per the overflow-menu convention;
 * the confirm dialog behind it remains the real safety net.
 */
export function BuildZone({
    canEdit,
    isMeshActionDisabled,
    dataInstallerAvailable,
    handleEditProject,
    handleConfigure,
    handleOpenAemAssets,
    handleResetProject,
    handleDeleteProject,
}: {
    canEdit: boolean;
    isMeshActionDisabled: boolean;
    dataInstallerAvailable?: boolean;
    handleOpenAemAssets: () => void;
    handleEditProject?: () => void;
    handleConfigure: () => void;
    handleResetProject: () => void;
    handleDeleteProject: () => void;
}): React.ReactElement {
    return (
        <DashboardZone id="build" title="Build" compact>
            {handleEditProject && <EditTile canEdit={canEdit} onPress={handleEditProject} />}

            <DashboardTile
                label="Configure"
                icon={<Settings size="L" />}
                onPress={handleConfigure}
                isDisabled={isMeshActionDisabled}
            />

            {/* Datapacks — the global catalog, opened beside the dashboard. */}
            {dataInstallerAvailable && <DataInstallerTile />}

            {/* AEM Assets (EDS-21) — where the SC gives the demo's products their
                images. Every project type: the bound AEM is a Demo Builder
                setting, not a property of the project, and the host offers the
                setting when none is bound. */}
            <DashboardTile
                label="AEM Assets"
                icon={<ImageAlbum size="L" />}
                onPress={handleOpenAemAssets}
                tooltip="Open the AEM environment your storefronts use for images and assets"
            />

            {/* Reset and Delete — the two rare, destructive actions, last, and
                set apart by a gap. Each opens its own confirmation, which is the
                real safety net; Delete is red so it never reads as routine. */}
            <div className="dashboard-compact-danger">
                <DashboardTile
                    label="Reset"
                    icon={<Revert size="L" />}
                    onPress={handleResetProject}
                    action="reset"
                    tooltip="Put the demo back to how it was first set up"
                />
                <DashboardTile
                    label="Delete"
                    icon={<Delete size="L" />}
                    onPress={handleDeleteProject}
                    action="delete"
                    className="dashboard-action-button--danger"
                    tooltip="Delete this project and what it created"
                />
            </div>
        </DashboardZone>
    );
}
