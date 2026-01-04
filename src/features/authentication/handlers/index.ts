/**
 * Authentication Handlers - Public API
 *
 * Exports unified handler map and individual handlers for
 * authentication, project, and workspace operations.
 */

import { defineHandlers } from '@/types/handlers';
import { handleCheckAuth, handleAuthenticate } from './authenticationHandlers';
import {
    handleEnsureOrgSelected,
    handleGetProjects,
    handleSelectProject,
    handleCheckProjectApis,
} from './projectHandlers';
import { handleGetWorkspaces, handleSelectWorkspace } from './workspaceHandlers';

/**
 * Authentication feature handler map
 * Maps message types to handler functions
 */
export const authenticationHandlers = defineHandlers({
    'check-auth': handleCheckAuth,
    'authenticate': handleAuthenticate,
    'ensure-org-selected': handleEnsureOrgSelected,
    'get-projects': handleGetProjects,
    'select-project': handleSelectProject,
    'check-project-apis': handleCheckProjectApis,
    'get-workspaces': handleGetWorkspaces,
    'select-workspace': handleSelectWorkspace,
});

// Keep existing re-exports for backward compatibility
export * from './authenticationHandlers';
export * from './projectHandlers';
export * from './workspaceHandlers';
