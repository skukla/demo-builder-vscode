/**
 * Sidebar Component
 *
 * Main sidebar container that renders contextual content based on state.
 * Aesthetic stays minimal — icons with tiny labels — matching the existing
 * UtilityBar pattern across all modes.
 *
 * Modes:
 *   - `projects` / `projectsList` — UtilityBar only (3 icons). AI is
 *     project-scoped, so it doesn't appear here.
 *   - `project` — AiZone (Chat + Prompts) paired above the UtilityBar footer,
 *     vertically centered as a group.
 *   - `configure` — back + project name + nav, then AiZone paired above the
 *     UtilityBar footer at the bottom.
 *
 * Note: there is no wizard mode. The wizard's progress timeline lives inside
 * the wizard webview's own left column (`WizardContainer`), not the sidebar.
 * While the wizard is active the sidebar shows whatever non-wizard context
 * applies (usually `projects`).
 */

import { Flex, Text, ActionButton } from '@adobe/react-spectrum';
import ChevronLeft from '@spectrum-icons/workflow/ChevronLeft';
import React from 'react';
import type { SidebarContext, NavItem } from '../types';
import { AiZone } from './components/AiZone';
import { SidebarNav } from './components/SidebarNav';
import { UtilityBar } from './views';

export interface SidebarProps {
    /** Current sidebar context */
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
 * Sidebar - Main sidebar container
 */
export const Sidebar: React.FC<SidebarProps> = ({
    context,
    onNavigate,
    onBack,
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
    // Projects-list / no-project: UtilityBar only. AI is project-scoped, so
    // it intentionally doesn't appear in this mode.
    if (context.type === 'projects' || context.type === 'projectsList') {
        return (
            <UtilityBar
                onOpenTools={onOpenTools}
                onOpenHelp={onOpenHelp}
                onOpenSettings={onOpenSettings}
            />
        );
    }

    const showAiZone = onOpenAiChat && onShowPrompts;

    // Project mode: AiZone + UtilityBar as a single group, vertically centered
    // in the sidebar. No lines, no project header — keeps the surface minimal.
    if (context.type === 'project') {
        return (
            <Flex
                direction="column"
                height="100%"
                justifyContent="center"
                alignItems="center"
                gap="size-400"
                UNSAFE_className="sidebar-project-view"
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
    }

    // Configure: back + project name + nav at top, AiZone + UtilityBar at
    // the bottom as a group. No dividers.
    return (
        <Flex
            direction="column"
            height="100%"
            UNSAFE_className="sidebar-configure-view"
        >
            <Flex direction="column" gap="size-200" UNSAFE_className="p-2" flex={1}>
                {onBack && (
                    <ActionButton isQuiet onPress={onBack}>
                        <ChevronLeft />
                        <Text>Projects</Text>
                    </ActionButton>
                )}

                <Text UNSAFE_className="font-semibold text-sm truncate">
                    {context.project.name}
                </Text>

                <SidebarNav
                    items={getProjectDetailNavItems('configure')}
                    onNavigate={onNavigate}
                />
            </Flex>

            <Flex direction="column" alignItems="center" gap="size-400">
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
        </Flex>
    );
};

function getProjectDetailNavItems(activeId: string): NavItem[] {
    return [
        { id: 'overview', label: 'Overview', active: activeId === 'overview' },
        { id: 'configure', label: 'Configure', active: activeId === 'configure' },
        { id: 'updates', label: 'Updates', active: activeId === 'updates' },
    ];
}
