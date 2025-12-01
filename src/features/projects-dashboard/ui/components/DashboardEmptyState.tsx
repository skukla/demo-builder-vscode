/**
 * DashboardEmptyState Component
 *
 * Displays an empty state for the Projects Dashboard with a CTA to create a project.
 * Includes utility icons for Documentation, Help, and Settings.
 */

import React, { useEffect, useRef } from 'react';
import { Flex, Text, Button, Well, ActionButton, Tooltip, TooltipTrigger } from '@adobe/react-spectrum';
import Add from '@spectrum-icons/workflow/Add';
import Book from '@spectrum-icons/workflow/Book';
import Help from '@spectrum-icons/workflow/Help';
import Settings from '@spectrum-icons/workflow/Settings';

export interface DashboardEmptyStateProps {
    /** Callback when the create button is clicked */
    onCreate: () => void;
    /** Custom title (defaults to "No projects yet") */
    title?: string;
    /** Custom button text (defaults to "New Project") */
    buttonText?: string;
    /** Whether to auto-focus the button */
    autoFocus?: boolean;
    /** Callback when Documentation icon is clicked */
    onOpenDocs?: () => void;
    /** Callback when Help icon is clicked */
    onOpenHelp?: () => void;
    /** Callback when Settings icon is clicked */
    onOpenSettings?: () => void;
}

/**
 * DashboardEmptyState - Shows empty state with CTA for first-time users
 */
export const DashboardEmptyState: React.FC<DashboardEmptyStateProps> = ({
    onCreate,
    title = 'No projects yet',
    buttonText = 'New Project',
    autoFocus = false,
    onOpenDocs,
    onOpenHelp,
    onOpenSettings,
}) => {
    const buttonRef = useRef<HTMLButtonElement>(null);

    useEffect(() => {
        if (autoFocus && buttonRef.current) {
            buttonRef.current.focus();
        }
    }, [autoFocus]);

    const hasIcons = onOpenDocs || onOpenHelp || onOpenSettings;

    return (
        <Flex
            justifyContent="center"
            alignItems="center"
            height="100%"
            minHeight="350px"
        >
            <Well UNSAFE_className="max-w-400 text-center">
                <Flex
                    direction="column"
                    alignItems="center"
                    gap="size-300"
                >
                    <Text UNSAFE_className="text-lg">
                        <strong>{title}</strong>
                    </Text>
                    <Text UNSAFE_className="text-sm text-gray-600">
                        Get started by creating your first demo project.
                    </Text>
                    <Button
                        ref={buttonRef as any}
                        variant="cta"
                        onPress={onCreate}
                    >
                        <Add />
                        <Text>{buttonText}</Text>
                    </Button>

                    {/* Utility Icons */}
                    {hasIcons && (
                        <Flex direction="row" gap="size-100" marginTop="size-100">
                            {onOpenDocs && (
                                <TooltipTrigger delay={0}>
                                    <ActionButton isQuiet onPress={onOpenDocs} aria-label="Documentation">
                                        <Book size="S" />
                                    </ActionButton>
                                    <Tooltip>Documentation</Tooltip>
                                </TooltipTrigger>
                            )}

                            {onOpenHelp && (
                                <TooltipTrigger delay={0}>
                                    <ActionButton isQuiet onPress={onOpenHelp} aria-label="Get Help">
                                        <Help size="S" />
                                    </ActionButton>
                                    <Tooltip>Get Help</Tooltip>
                                </TooltipTrigger>
                            )}

                            {onOpenSettings && (
                                <TooltipTrigger delay={0}>
                                    <ActionButton isQuiet onPress={onOpenSettings} aria-label="Settings">
                                        <Settings size="S" />
                                    </ActionButton>
                                    <Tooltip>Settings</Tooltip>
                                </TooltipTrigger>
                            )}
                        </Flex>
                    )}
                </Flex>
            </Well>
        </Flex>
    );
};
