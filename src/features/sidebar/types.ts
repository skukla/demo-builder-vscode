/**
 * Sidebar Types
 *
 * Type definitions for the sidebar context and navigation.
 */

import type { Project } from '@/types/base';

/**
 * Sidebar context - determines what the sidebar displays
 */
export type SidebarContext =
    | { type: 'projects' }                                                          // Projects Dashboard (no project loaded)
    | { type: 'projectsList' }                                                      // Projects List (utility icons only)
    | { type: 'project'; project: Project }                                         // Project Detail
    | { type: 'wizard'; step: number; total: number; completedSteps?: number[]; steps?: WizardStep[]; isEditMode?: boolean }    // Wizard
    | { type: 'configure'; project: Project };                                      // Configure

/**
 * Navigation item for the sidebar
 */
export interface NavItem {
    id: string;
    label: string;
    icon?: string;
    active?: boolean;
}

/**
 * Wizard step definition
 */
export interface WizardStep {
    id: string;
    label: string;
}

/**
 * Sidebar message types for communication
 */
export type SidebarMessageType =
    | 'navigate'
    | 'getContext'
    | 'setContext'
    | 'back';

/**
 * Navigation target
 */
export type NavigationTarget =
    | 'projects'
    | 'project-detail'
    | 'configure'
    | 'updates'
    | 'wizard';
