/**
 * UtilityBar Component
 *
 * Minimal sidebar content showing quick-access utility icons.
 * Displayed in all contexts except wizard mode.
 */

import React from 'react';
import styles from '../styles/sidebar.module.css';
import { Flex, Text, ActionButton } from '@/core/ui/components/aria';
import { BookIcon, HelpIcon, SettingsIcon } from '@/core/ui/components/aria/icons';

export interface UtilityBarProps {
    /** Callback when user clicks Documentation link */
    onOpenDocs?: () => void;
    /** Callback when user clicks Help link */
    onOpenHelp?: () => void;
    /** Callback when user clicks Settings */
    onOpenSettings?: () => void;
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
}) => {
    return (
        <Flex
            direction="row"
            gap="size-300"
            alignItems="center"
            justifyContent="center"
            className={styles.utilityBar}
            style={{ height: '100%' }}
        >
            {onOpenDocs && (
                <Flex direction="column" alignItems="center" gap="size-50">
                    <ActionButton onPress={onOpenDocs} aria-label="Documentation">
                        <BookIcon size="L" />
                    </ActionButton>
                    <Text className="text-sm opacity-70">Docs</Text>
                </Flex>
            )}

            {onOpenHelp && (
                <Flex direction="column" alignItems="center" gap="size-50">
                    <ActionButton onPress={onOpenHelp} aria-label="Get Help">
                        <HelpIcon size="L" />
                    </ActionButton>
                    <Text className="text-sm opacity-70">Help</Text>
                </Flex>
            )}

            {onOpenSettings && (
                <Flex direction="column" alignItems="center" gap="size-50">
                    <ActionButton onPress={onOpenSettings} aria-label="Settings">
                        <SettingsIcon size="L" />
                    </ActionButton>
                    <Text className="text-sm opacity-70">Settings</Text>
                </Flex>
            )}
        </Flex>
    );
};
