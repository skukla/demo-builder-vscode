/**
 * Sidebar Types
 *
 * Type definitions for the sidebar context and navigation.
 */

import type { Project } from '@/types/base';

/**
 * Sidebar context - determines what the sidebar displays.
 *
 * Wizard mode is intentionally absent: the wizard's progress timeline lives
 * inside the wizard webview's own left column (`WizardContainer`), not in
 * the sidebar. While the wizard is active the sidebar falls through to one
 * of the four contexts below (typically `projects` if no project is loaded).
 */
export type SidebarContext =
    | { type: 'projects' }                                                          // Projects Dashboard (no project loaded)
    | { type: 'projectsList' }                                                      // Projects List (utility icons only)
    | { type: 'project'; project: Project }                                         // Project Detail
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
    | 'back'
    | 'openAiChat'
    | 'showPrompts';

/**
 * Navigation target
 */
export type NavigationTarget =
    | 'projects'
    | 'project-detail'
    | 'configure'
    | 'updates';
