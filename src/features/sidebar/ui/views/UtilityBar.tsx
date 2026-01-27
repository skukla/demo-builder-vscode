/**
 * UtilityBar Component
 *
 * Minimal sidebar content showing quick-access utility icons.
 * Displayed in all contexts except wizard mode.
 */

import { Flex, Text, ActionButton } from '@adobe/react-spectrum';
import Book from '@spectrum-icons/workflow/Book';
import Help from '@spectrum-icons/workflow/Help';
import Settings from '@spectrum-icons/workflow/Settings';
import React from 'react';

export interface UtilityBarProps {
    /** Callback when user clicks Documentation link */
    onOpenDocs?: () => void;
    /** Callback when user clicks Help link */
    onOpenHelp?: () => void;
    /** Callback when user clicks Settings */
    onOpenSettings?: () => void;
    /** If true, use auto height instead of filling container (for footer placement) */
    compact?: boolean;
}

/**
 * UtilityBar - Quick-access utility icons for the sidebar
 *
 * Shows Docs, Help, and Settings icons in a horizontal row with labels.
 */
export const UtilityBar: React.FC<UtilityBarProps> = ({
    onOpenDocs,
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
            {onOpenDocs && (
                <Flex direction="column" alignItems="center" gap="size-75">
                    <ActionButton isQuiet onPress={onOpenDocs} aria-label="Documentation">
                        <Book size="L" />
                    </ActionButton>
                    <Text UNSAFE_className="text-sm opacity-70">Docs</Text>
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
