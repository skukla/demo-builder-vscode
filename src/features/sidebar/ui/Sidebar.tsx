/**
 * Sidebar Component
 *
 * Main sidebar container that renders contextual content based on state.
 * Shows different views depending on whether user has a project, is in wizard, etc.
 */

import React from 'react';
import { Flex, Text, ActionButton, Divider } from '@adobe/react-spectrum';
import ChevronLeft from '@spectrum-icons/workflow/ChevronLeft';
import { SidebarNav } from './components/SidebarNav';
import { TimelineNav, TimelineStep } from '@/core/ui/components/TimelineNav';
import { WelcomeView, ProjectView } from './views';
import type { SidebarContext, NavItem } from '../types';

export interface SidebarProps {
    /** Current sidebar context */
    context: SidebarContext;
    /** Callback for navigation actions */
    onNavigate: (target: string) => void;
    /** Callback for back navigation */
    onBack?: () => void;
    /** Callback for creating a new project */
    onCreateProject: () => void;
    /** Callback for opening documentation */
    onOpenDocs?: () => void;
    /** Callback for opening help */
    onOpenHelp?: () => void;
    /** Callback for opening settings */
    onOpenSettings?: () => void;
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
    /** Callback when wizard step is clicked (for back navigation) */
    onWizardStepClick?: (stepIndex: number) => void;
}

/**
 * Sidebar - Main sidebar container
 */
export const Sidebar: React.FC<SidebarProps> = ({
    context,
    onNavigate,
    onBack,
    onCreateProject,
    onOpenDocs,
    onOpenHelp,
    onOpenSettings,
    onStartDemo,
    onStopDemo,
    onOpenDashboard,
    onOpenConfigure,
    onCheckUpdates,
    onWizardStepClick,
}) => {
    // For 'projects' context (no project loaded), show WelcomeView
    if (context.type === 'projects') {
        return (
            <WelcomeView
                onCreateProject={onCreateProject}
                onOpenDocs={onOpenDocs}
                onOpenHelp={onOpenHelp}
                onOpenSettings={onOpenSettings}
            />
        );
    }

    // For 'project' context (project loaded), show ProjectView with controls
    if (context.type === 'project' && onStartDemo && onStopDemo && onOpenDashboard && onOpenConfigure && onCheckUpdates) {
        return (
            <ProjectView
                project={context.project}
                onStartDemo={onStartDemo}
                onStopDemo={onStopDemo}
                onOpenDashboard={onOpenDashboard}
                onOpenConfigure={onOpenConfigure}
                onCheckUpdates={onCheckUpdates}
            />
        );
    }

    // For wizard context, show wizard progress using shared TimelineNav
    if (context.type === 'wizard') {
        // Convert steps to TimelineStep format (id, name)
        const timelineSteps: TimelineStep[] = context.steps?.map(s => ({
            id: s.id,
            name: s.label,
        })) || [];

        return (
            <Flex
                direction="column"
                height="100%"
                UNSAFE_className="sidebar-wizard-view"
            >
                {/* Wizard progress using shared TimelineNav */}
                <TimelineNav
                    steps={timelineSteps}
                    currentStepIndex={context.step - 1}
                    completedStepIndices={context.completedSteps || []}
                    onStepClick={onWizardStepClick}
                    compact={true}
                    showHeader={true}
                    headerText="Setup Progress"
                />
            </Flex>
        );
    }

    // For configure context, show navigation-based UI
    return (
        <Flex
            direction="column"
            gap="size-200"
            UNSAFE_className="p-2"
            height="100%"
        >
            {/* Back button */}
            {onBack && (
                <ActionButton isQuiet onPress={onBack}>
                    <ChevronLeft />
                    <Text>Projects</Text>
                </ActionButton>
            )}

            {/* Context-specific header */}
            {renderHeader(context)}

            <Divider size="S" />

            {/* Context-specific navigation */}
            {renderContent(context, onNavigate)}
        </Flex>
    );
};

function renderHeader(context: SidebarContext): React.ReactNode {
    switch (context.type) {
        case 'project':
        case 'configure':
            return (
                <Text UNSAFE_className="font-semibold text-sm truncate">
                    {context.project.name}
                </Text>
            );
        default:
            return null;
    }
}

function renderContent(
    context: SidebarContext,
    onNavigate: (target: string) => void
): React.ReactNode {
    switch (context.type) {
        case 'project':
            return (
                <SidebarNav
                    items={getProjectDetailNavItems('overview')}
                    onNavigate={onNavigate}
                />
            );
        case 'configure':
            return (
                <SidebarNav
                    items={getProjectDetailNavItems('configure')}
                    onNavigate={onNavigate}
                />
            );
        default:
            return null;
    }
}

function getProjectDetailNavItems(activeId: string): NavItem[] {
    return [
        { id: 'overview', label: 'Overview', active: activeId === 'overview' },
        { id: 'configure', label: 'Configure', active: activeId === 'configure' },
        { id: 'updates', label: 'Updates', active: activeId === 'updates' },
    ];
}
