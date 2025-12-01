/**
 * WelcomeView Component
 *
 * Displayed in the sidebar when no project is loaded.
 * Minimal action-first design: CTA button + icon row.
 */

import React from 'react';
import { Flex, Text, Button, ActionButton, Tooltip, TooltipTrigger } from '@adobe/react-spectrum';
import Add from '@spectrum-icons/workflow/Add';
import Book from '@spectrum-icons/workflow/Book';
import Help from '@spectrum-icons/workflow/Help';
import Settings from '@spectrum-icons/workflow/Settings';

export interface WelcomeViewProps {
    /** Callback when user clicks "New Project" */
    onCreateProject: () => void;
    /** Callback when user clicks Documentation link */
    onOpenDocs?: () => void;
    /** Callback when user clicks Help link */
    onOpenHelp?: () => void;
    /** Callback when user clicks Settings */
    onOpenSettings?: () => void;
}

/**
 * WelcomeView - Sidebar content for first-time users / no project state
 */
export const WelcomeView: React.FC<WelcomeViewProps> = ({
    onCreateProject,
    onOpenDocs,
    onOpenHelp,
    onOpenSettings,
}) => {
    return (
        <Flex
            direction="column"
            gap="size-200"
            alignItems="center"
            UNSAFE_className="sidebar-welcome"
        >
            {/* Primary CTA */}
            <Button variant="accent" onPress={onCreateProject}>
                <Add size="S" />
                <Text>New Project</Text>
            </Button>

            {/* Quick Links - Icon Row */}
            <Flex direction="row" gap="size-100">
                {onOpenDocs && (
                    <TooltipTrigger delay={0}>
                        <ActionButton isQuiet onPress={onOpenDocs} aria-label="Documentation" UNSAFE_className="sidebar-icon-btn">
                            <Book size="S" />
                        </ActionButton>
                        <Tooltip>Documentation</Tooltip>
                    </TooltipTrigger>
                )}

                {onOpenHelp && (
                    <TooltipTrigger delay={0}>
                        <ActionButton isQuiet onPress={onOpenHelp} aria-label="Get Help" UNSAFE_className="sidebar-icon-btn">
                            <Help size="S" />
                        </ActionButton>
                        <Tooltip>Get Help</Tooltip>
                    </TooltipTrigger>
                )}

                {onOpenSettings && (
                    <TooltipTrigger delay={0}>
                        <ActionButton isQuiet onPress={onOpenSettings} aria-label="Settings" UNSAFE_className="sidebar-icon-btn">
                            <Settings size="S" />
                        </ActionButton>
                        <Tooltip>Settings</Tooltip>
                    </TooltipTrigger>
                )}
            </Flex>
        </Flex>
    );
};
