/**
 * UtilityBar Component
 *
 * Three-icon utility row for the sidebar: Tools, Help, Settings. These are
 * infrequent global actions; the row is intentionally minimal. AI access lives
 * in the `AiZone` component (project / configure modes), not here.
 */

import { Flex, Text, ActionButton } from '@adobe/react-spectrum';
import Help from '@spectrum-icons/workflow/Help';
import Settings from '@spectrum-icons/workflow/Settings';
import Wrench from '@spectrum-icons/workflow/Wrench';
import React from 'react';

export interface UtilityBarProps {
    /** Callback when user clicks Tools button */
    onOpenTools?: () => void;
    /** Callback when user clicks Help link */
    onOpenHelp?: () => void;
    /** Callback when user clicks Settings */
    onOpenSettings?: () => void;
    /** If true, use auto height instead of filling container (for footer placement) */
    compact?: boolean;
}

/**
 * UtilityBar — three-icon utility row.
 *
 * Buttons render only when their callback prop is provided; the AI button
 * removal here is intentional: AI is project-scoped and now lives in the
 * `AiZone` zone within project / configure mode bodies.
 */
export const UtilityBar: React.FC<UtilityBarProps> = ({
    onOpenTools,
    onOpenHelp,
    onOpenSettings,
    compact = false,
}) => {
    return (
        <Flex
            direction="row"
            gap="size-300"
            alignItems="center"
            justifyContent="center"
            height={compact ? undefined : '100%'}
            UNSAFE_className="sidebar-utility-bar"
        >
            {onOpenTools && (
                <Flex direction="column" alignItems="center" gap="size-75">
                    <ActionButton isQuiet onPress={onOpenTools} aria-label="Tools">
                        <Wrench size="L" />
                    </ActionButton>
                    <Text UNSAFE_className="text-sm opacity-70">Tools</Text>
                </Flex>
            )}

            {onOpenHelp && (
                <Flex direction="column" alignItems="center" gap="size-75">
                    <ActionButton isQuiet onPress={onOpenHelp} aria-label="Get Help">
                        <Help size="L" />
                    </ActionButton>
                    <Text UNSAFE_className="text-sm opacity-70">Help</Text>
                </Flex>
            )}

            {onOpenSettings && (
                <Flex direction="column" alignItems="center" gap="size-75">
                    <ActionButton isQuiet onPress={onOpenSettings} aria-label="Settings">
                        <Settings size="L" />
                    </ActionButton>
                    <Text UNSAFE_className="text-sm opacity-70">Settings</Text>
                </Flex>
            )}
        </Flex>
    );
};
