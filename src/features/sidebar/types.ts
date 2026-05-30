/**
 * Sidebar Types
 *
 * Type definitions for the sidebar context and navigation.
 */

import type { Project } from '@/types/base';

/**
 * Sidebar context - determines what the sidebar displays.
 *
 * Wizard and Configure modes are intentionally absent:
 *   - Wizard's progress timeline lives inside the wizard webview's own left
 *     column (`WizardContainer`), not the sidebar.
 *   - Configure is a self-contained webview tab with its own Cancel footer;
 *     the sidebar stays in `project` mode while Configure is open.
 */
export type SidebarContext =
    | { type: 'projects' }                                                          // Projects Dashboard (no project loaded)
    | { type: 'projectsList' }                                                      // Projects List (utility icons only)
    | { type: 'project'; project: Project };                                        // Project Detail

/**
 * Sidebar message types for communication
 */
export type SidebarMessageType =
    | 'getContext'
    | 'setContext'
    | 'openAiChat'
    | 'showPrompts';
