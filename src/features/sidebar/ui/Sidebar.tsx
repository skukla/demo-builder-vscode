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
    /** Callback for opening logs */
    onOpenLogs?: () => void;
    /** Callback to open Claude chat — Chat button in AiZone. */
    onOpenAiChat?: () => void;
    /** Callback to show the prompt picker — Prompts button in AiZone. */
    onShowPrompts?: () => void;
    onNewAiChat?: () => void;
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
    onOpenLogs,
    onOpenAiChat,
    onShowPrompts,
    onNewAiChat,
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
            // minHeight, not height: the box fills the panel so the content can
            // centre inside it, but is free to grow past it rather than clipping
            // the last tile off the bottom the way `height: 100%` did.
            // `.sidebar-provider` scrolls whatever overflows.
            minHeight="100%"
            // Centred rather than top-padded — `.sidebar-view` refines this to
            // `safe center` so a too-short panel degrades to top-aligned instead
            // of pushing the first tile out of reach above the scroll origin.
            justifyContent="center"
            alignItems="center"
            gap="size-300"
            UNSAFE_className="sidebar-view"
        >
            {showAiZone && (
                <AiZone
                    onOpenAiChat={onOpenAiChat}
                    onShowPrompts={onShowPrompts}
                    onNewAiChat={onNewAiChat}
                />
            )}
            <UtilityBar
                onOpenTools={onOpenTools}
                onOpenHelp={onOpenHelp}
                onOpenSettings={onOpenSettings}
                onOpenLogs={onOpenLogs}
                compact
            />
        </Flex>
    );
};
