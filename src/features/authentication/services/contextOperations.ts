/**
 * Context Operations - Console context management for Adobe CLI
 *
 * Handles fetching, validating, and clearing Adobe CLI console context
 * (org, project, workspace). Extracted from AdobeEntityService for SOP compliance.
 */

import { getLogger } from '@/core/logging';
import type { CommandExecutor } from '@/core/shell';
import { TIMEOUTS } from '@/core/utils';
import type { AuthCacheManager } from '@/features/authentication/services/authCacheManager';
import type { AdobeConsoleWhereResponse } from '@/features/authentication/services/types';
import { parseJSON } from '@/types/typeGuards';

/**
 * Dependencies required for context operations
 */
export interface ContextOperationsDeps {
    commandManager: CommandExecutor;
    cacheManager: AuthCacheManager;
}

/**
 * Expected context for context guard operations
 */
export interface ExpectedContext {
    orgId?: string;
    projectId?: string;
}

/**
 * Get console.where context with caching
 *
 * Fetches the current Adobe console context (org, project, workspace) from CLI
 * and caches the result. Used by getCurrentOrganization, getCurrentProject,
 * and getCurrentWorkspace to avoid redundant CLI calls.
 *
 * @returns The console context or undefined if fetch fails
 */
export async function getConsoleWhereContext(
    deps: ContextOperationsDeps,
): Promise<AdobeConsoleWhereResponse | undefined> {
    const debugLogger = getLogger();

    // Check console.where cache first
    let context = deps.cacheManager.getCachedConsoleWhere();

    if (!context) {
        debugLogger.debug('[Context Ops] Fetching context from Adobe CLI');
        const result = await deps.commandManager.execute(
            'aio console where --json',
            { encoding: 'utf8', timeout: TIMEOUTS.NORMAL },
        );

        if (result.code === 0 && result.stdout) {
            // SECURITY: Use parseJSON for type-safe parsing
            const parsedContext = parseJSON<AdobeConsoleWhereResponse>(result.stdout);
            if (!parsedContext) {
                debugLogger.warn('[Context Ops] Failed to parse console.where response');
                return undefined;
            }
            context = parsedContext;
            deps.cacheManager.setCachedConsoleWhere(context);
        } else {
            return undefined;
        }
    }

    return context;
}

/**
 * Extract ID from context value (can be string or object with id)
 */
export function extractContextId(value: string | { id: string } | undefined): string | undefined {
    if (!value) return undefined;
    if (typeof value === 'string') return value;
    return value.id;
}

/**
 * Ensure Adobe CLI context matches expected state before dependent operations.
 * Re-selects org/project if another process changed the global context.
 *
 * @param deps - Dependencies for operations
 * @param expected - The org/project IDs that should be selected
 * @param selectOrganization - Callback to select org if mismatch
 * @param doSelectProject - Callback to select project if mismatch
 * @returns true if context is correct (or was corrected), false on failure
 */
export async function ensureContext(
    deps: ContextOperationsDeps,
    expected: ExpectedContext,
    selectOrganization: (orgId: string) => Promise<boolean>,
    doSelectProject: (projectId: string) => Promise<boolean>,
): Promise<boolean> {
    const debugLogger = getLogger();
    const context = await getConsoleWhereContext(deps);

    // Check organization context
    let currentOrgId = extractContextId(context?.org);

    // If currentOrgId is a name (string from CLI), check cache to resolve to ID
    if (currentOrgId && typeof context?.org === 'string') {
        const cachedOrg = deps.cacheManager.getCachedOrganization();
        if (cachedOrg?.id) {
            currentOrgId = cachedOrg.id;
            debugLogger.trace(`[Context Ops] Resolved org name "${context.org}" to ID: ${currentOrgId}`);
        } else {
            // Try org list cache as fallback
            const cachedOrgList = deps.cacheManager.getCachedOrgList();
            const matchingOrg = cachedOrgList?.find(o => o.name === context.org || o.code === context.org);
            if (matchingOrg?.id) {
                currentOrgId = matchingOrg.id;
                debugLogger.trace(`[Context Ops] Resolved org name "${context.org}" to ID from list: ${currentOrgId}`);
            } else {
                debugLogger.trace(`[Context Ops] Cannot resolve org name "${context.org}" - no cached org`);
            }
        }
    }

    if (expected.orgId && currentOrgId !== expected.orgId) {
        debugLogger.debug(
            `[Context Ops] Context sync: org mismatch (current: "${currentOrgId || 'none'}"), re-selecting...`,
        );
        const orgSelected = await selectOrganization(expected.orgId);
        if (!orgSelected) {
            debugLogger.error('[Context Ops] Failed to restore org context');
            return false;
        }
    }

    // Check project context (re-fetch context if org was changed)
    if (expected.projectId) {
        const currentContext = expected.orgId ? await getConsoleWhereContext(deps) : context;
        const currentProjectId = extractContextId(currentContext?.project);
        
        // If currentProjectId is a name (string from CLI), check cache to resolve to ID
        let resolvedProjectId = currentProjectId;
        if (currentProjectId && typeof currentContext?.project === 'string') {
            const cachedProject = deps.cacheManager.getCachedProject();
            if (cachedProject?.id) {
                resolvedProjectId = cachedProject.id;
                debugLogger.trace(`[Context Ops] Resolved project name "${currentProjectId}" to ID: ${resolvedProjectId}`);
            } else {
                debugLogger.trace(`[Context Ops] Cannot resolve project name "${currentProjectId}" - no cached project`);
            }
        }
        
        if (resolvedProjectId !== expected.projectId) {
            debugLogger.debug(
                `[Context Ops] Context sync: project mismatch (current: "${resolvedProjectId || currentProjectId || 'none'}"), re-selecting...`,
            );
            const projectSelected = await doSelectProject(expected.projectId);
            if (!projectSelected) {
                debugLogger.error('[Context Ops] Failed to restore project context');
                return false;
            }
        }
    }

    return true;
}

/**
 * Clear Adobe CLI console context (org/project/workspace selections)
 * Preserves authentication token (ims context)
 */
export async function clearConsoleContext(
    deps: ContextOperationsDeps,
): Promise<void> {
    const debugLogger = getLogger();

    try {
        // Use established pattern: Promise.all for parallel execution
        await Promise.all([
            deps.commandManager.execute('aio config delete console.org', { encoding: 'utf8' }),
            deps.commandManager.execute('aio config delete console.project', { encoding: 'utf8' }),
            deps.commandManager.execute('aio config delete console.workspace', { encoding: 'utf8' }),
        ]);

        // Clear console.where cache since context was cleared
        deps.cacheManager.clearConsoleWhereCache();

        debugLogger.debug('[Context Ops] Cleared Adobe CLI console context (preserved token)');
    } catch (error) {
        // Fail gracefully - config may not exist
        debugLogger.debug('[Context Ops] Failed to clear console context (non-critical):', error);
    }
}
