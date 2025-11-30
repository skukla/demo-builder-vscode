/**
 * Sidebar Component
 *
 * Main sidebar container that renders contextual navigation.
 */

import React from 'react';
import { Flex, Text, ActionButton, Divider } from '@adobe/react-spectrum';
import ChevronLeft from '@spectrum-icons/workflow/ChevronLeft';
import { SidebarNav } from './components/SidebarNav';
import { WizardProgress } from './components/WizardProgress';
import type { SidebarContext, NavItem, WizardStep } from '../types';

export interface SidebarProps {
    /** Current sidebar context */
    context: SidebarContext;
    /** Callback for navigation actions */
    onNavigate: (target: string) => void;
    /** Callback for back navigation */
    onBack?: () => void;
}

// Default wizard steps (without Welcome)
const WIZARD_STEPS: WizardStep[] = [
    { id: 'auth', label: 'Sign In' },
    { id: 'project', label: 'Project' },
    { id: 'workspace', label: 'Workspace' },
    { id: 'components', label: 'Components' },
    { id: 'mesh', label: 'API Mesh' },
    { id: 'review', label: 'Review' },
];

/**
 * Sidebar - Main sidebar container
 */
export const Sidebar: React.FC<SidebarProps> = ({
    context,
    onNavigate,
    onBack,
}) => {
    return (
        <Flex
            direction="column"
            gap="size-200"
            UNSAFE_className="p-2"
            height="100%"
        >
            {/* Back button (when applicable) */}
            {context.type !== 'projects' && onBack && (
                <ActionButton isQuiet onPress={onBack}>
                    <ChevronLeft />
                    <Text>
                        {context.type === 'wizard' ? 'Cancel' : 'Projects'}
                    </Text>
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
        case 'projects':
            return (
                <Text UNSAFE_className="font-semibold">
                    Demo Builder
                </Text>
            );
        case 'project':
        case 'configure':
            return (
                <Text UNSAFE_className="font-semibold text-sm truncate">
                    {context.project.name}
                </Text>
            );
        case 'wizard':
            return (
                <Text UNSAFE_className="font-semibold text-sm">
                    NEW DEMO
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
        case 'projects':
            return (
                <SidebarNav
                    items={getProjectsNavItems()}
                    onNavigate={onNavigate}
                />
            );
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
        case 'wizard':
            return (
                <WizardProgress
                    steps={WIZARD_STEPS}
                    currentStep={context.step}
                    completedSteps={getCompletedSteps(context.step)}
                />
            );
        default:
            return null;
    }
}

function getProjectsNavItems(): NavItem[] {
    return [
        { id: 'projects', label: 'Projects', active: true },
    ];
}

function getProjectDetailNavItems(activeId: string): NavItem[] {
    return [
        { id: 'overview', label: 'Overview', active: activeId === 'overview' },
        { id: 'configure', label: 'Configure', active: activeId === 'configure' },
        { id: 'updates', label: 'Updates', active: activeId === 'updates' },
    ];
}

function getCompletedSteps(currentStep: number): number[] {
    return Array.from({ length: currentStep }, (_, i) => i);
}
