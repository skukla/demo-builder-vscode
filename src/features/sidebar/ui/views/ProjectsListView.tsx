/**
 * ProjectsListView Component
 *
 * Displayed in the sidebar when viewing the Projects List.
 * Shows utility icons in a row with labels beneath each icon.
 */

import React from 'react';
import { Flex, Text, ActionButton } from '@adobe/react-spectrum';
import Book from '@spectrum-icons/workflow/Book';
import Help from '@spectrum-icons/workflow/Help';
import Settings from '@spectrum-icons/workflow/Settings';

export interface ProjectsListViewProps {
    /** Callback when user clicks Documentation link */
    onOpenDocs?: () => void;
    /** Callback when user clicks Help link */
    onOpenHelp?: () => void;
    /** Callback when user clicks Settings */
    onOpenSettings?: () => void;
}

/**
 * ProjectsListView - Sidebar content when viewing Projects List
 *
 * Shows utility icons in a horizontal row with labels beneath.
 */
export const ProjectsListView: React.FC<ProjectsListViewProps> = ({
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
            height="100%"
            UNSAFE_className="sidebar-projects-list"
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
