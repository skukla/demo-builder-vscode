/**
 * WelcomeView Component
 *
 * Displayed in the sidebar when no project is loaded.
 * Minimal utility strip design: only quick-access icons.
 * The main "New Project" CTA lives in the main dashboard view.
 */

import React from 'react';
import { Flex, ActionButton, Tooltip, TooltipTrigger } from '@adobe/react-spectrum';
import Book from '@spectrum-icons/workflow/Book';
import Help from '@spectrum-icons/workflow/Help';
import Settings from '@spectrum-icons/workflow/Settings';

export interface WelcomeViewProps {
    /** @deprecated No longer used - CTA moved to main view */
    onCreateProject?: () => void;
    /** Callback when user clicks Documentation link */
    onOpenDocs?: () => void;
    /** Callback when user clicks Help link */
    onOpenHelp?: () => void;
    /** Callback when user clicks Settings */
    onOpenSettings?: () => void;
}

/**
 * WelcomeView - Minimal sidebar utility strip for no-project state
 *
 * The "New Project" CTA now lives in the main Projects Dashboard view.
 * This sidebar shows only quick-access utility icons.
 */
export const WelcomeView: React.FC<WelcomeViewProps> = ({
    onOpenDocs,
    onOpenHelp,
    onOpenSettings,
}) => {
    const hasIcons = onOpenDocs || onOpenHelp || onOpenSettings;

    // If no icons are provided, render nothing
    if (!hasIcons) {
        return null;
    }

    return (
        <Flex
            direction="column"
            gap="size-200"
            alignItems="center"
            UNSAFE_className="sidebar-welcome"
        >
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
