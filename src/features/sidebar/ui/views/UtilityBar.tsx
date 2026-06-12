/**
 * UtilityBar Component
 *
 * A labeled "Utilities" zone — small-caps zone label above three tiles
 * (Tools, Help, Settings), stacked vertically. Mirrors the project
 * dashboard's labeled zones.
 */

import { Flex, Text, ActionButton } from '@adobe/react-spectrum';
import Help from '@spectrum-icons/workflow/Help';
import Settings from '@spectrum-icons/workflow/Settings';
import ViewList from '@spectrum-icons/workflow/ViewList';
import Wrench from '@spectrum-icons/workflow/Wrench';
import React from 'react';

export interface UtilityBarProps {
    /** Callback when user clicks Tools button */
    onOpenTools?: () => void;
    /** Callback when user clicks Help link */
    onOpenHelp?: () => void;
    /** Callback when user clicks Settings */
    onOpenSettings?: () => void;
    /** Callback when user clicks Logs */
    onOpenLogs?: () => void;
    /** Reserved for footer-placement variants; currently no-op. */
    compact?: boolean;
}

/**
 * UtilityBar — labeled zone with Tools, Help, Settings tiles stacked
 * vertically. Tiles render only when their callback prop is provided.
 */
export const UtilityBar: React.FC<UtilityBarProps> = ({
    onOpenTools,
    onOpenHelp,
    onOpenSettings,
    onOpenLogs,
    compact: _compact = false,
}) => {
    return (
        <Flex direction="column" gap="size-100" alignItems="center">
            <Text UNSAFE_className="dashboard-zone-label">Utilities</Text>

            {onOpenTools && (
                <ActionButton
                    isQuiet
                    onPress={onOpenTools}
                    aria-label="Tools"
                    UNSAFE_className="sidebar-action-tile"
                >
                    <Wrench />
                    <Text UNSAFE_className="icon-label">Tools</Text>
                </ActionButton>
            )}

            {onOpenHelp && (
                <ActionButton
                    isQuiet
                    onPress={onOpenHelp}
                    aria-label="Get Help"
                    UNSAFE_className="sidebar-action-tile"
                >
                    <Help />
                    <Text UNSAFE_className="icon-label">Help</Text>
                </ActionButton>
            )}

            {onOpenSettings && (
                <ActionButton
                    isQuiet
                    onPress={onOpenSettings}
                    aria-label="Settings"
                    UNSAFE_className="sidebar-action-tile"
                >
                    <Settings />
                    <Text UNSAFE_className="icon-label">Settings</Text>
                </ActionButton>
            )}

            {onOpenLogs && (
                <ActionButton
                    isQuiet
                    onPress={onOpenLogs}
                    aria-label="View Logs"
                    UNSAFE_className="sidebar-action-tile"
                >
                    <ViewList />
                    <Text UNSAFE_className="icon-label">Logs</Text>
                </ActionButton>
            )}
        </Flex>
    );
};
