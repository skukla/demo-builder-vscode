/**
 * Sidebar Component
 *
 * Single layout across all contexts: AiZone (Chat + Prompts) above UtilityBar
 * (Tools + Help + Settings), vertically centered as one group. AI is globally
 * available — MCP is wired at the extension level, not per project — so the
 * AiZone renders in every sidebar context.
 *
 * Surfaces that previously rendered inside the sidebar (wizard's TimelineNav,
 * a now-deleted configure-mode nav) have moved into their own webviews.
 */

import { Flex } from '@adobe/react-spectrum';
import React from 'react';
import type { SidebarContext } from '../types';
import { AiZone } from './components/AiZone';
import { UtilityBar } from './views';

export interface SidebarProps {
    /**
     * Current sidebar context — retained for the message protocol but unused
     * by the rendered layout (all contexts render identically).
     */
    context: SidebarContext;
    /** Callback for navigation actions */
    onNavigate: (target: string) => void;
    /** Callback for back navigation */
    onBack?: () => void;
    /** Callback for creating a new project */
    onCreateProject: () => void;
    /** Callback for opening tools */
    onOpenTools?: () => void;
    /** Callback for opening help */
    onOpenHelp?: () => void;
    /** Callback for opening settings */
    onOpenSettings?: () => void;
    /** Callback to open Claude chat — Chat button in AiZone. */
    onOpenAiChat?: () => void;
    /** Callback to show the prompt picker — Prompts button in AiZone. */
    onShowPrompts?: () => void;
    /** Callback to start demo */
    onStartDemo?: () => void;
    /** Callback to stop demo */
    onStopDemo?: () => void;
    /** Callback to open dashboard */
    onOpenDashboard?: () => void;
    /** Callback to open configure */
    onOpenConfigure?: () => void;
    /** Callback to check for updates */
    onCheckUpdates?: () => void;
}

/**
 * Sidebar — single centered group: AiZone above UtilityBar.
 */
export const Sidebar: React.FC<SidebarProps> = ({
    context: _context,
    onNavigate: _onNavigate,
    onBack: _onBack,
    onCreateProject: _onCreateProject,
    onOpenTools,
    onOpenHelp,
    onOpenSettings,
    onOpenAiChat,
    onShowPrompts,
    onStartDemo: _onStartDemo,
    onStopDemo: _onStopDemo,
    onOpenDashboard: _onOpenDashboard,
    onOpenConfigure: _onOpenConfigure,
    onCheckUpdates: _onCheckUpdates,
}) => {
    const showAiZone = onOpenAiChat && onShowPrompts;
    return (
        <Flex
            direction="column"
            height="100%"
            justifyContent="center"
            alignItems="center"
            gap="size-400"
            UNSAFE_className="sidebar-view"
        >
            {showAiZone && (
                <AiZone
                    onOpenAiChat={onOpenAiChat}
                    onShowPrompts={onShowPrompts}
                />
            )}
            <UtilityBar
                onOpenTools={onOpenTools}
                onOpenHelp={onOpenHelp}
                onOpenSettings={onOpenSettings}
                compact
            />
        </Flex>
    );
};
