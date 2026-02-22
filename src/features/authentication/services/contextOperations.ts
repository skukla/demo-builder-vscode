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
import { getMeshNodeVersion } from '@/features/mesh/services/meshConfig';
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
 * Resolve org name/code from CLI context to numeric ID using cache
 */
function resolveOrgId(
    deps: ContextOperationsDeps,
    rawOrgId: string | undefined,
    orgContextValue: string | { id: string } | undefined,
): string | undefined {
    const debugLogger = getLogger();
    if (!rawOrgId || typeof orgContextValue !== 'string') return rawOrgId;

    const cachedOrg = deps.cacheManager.getCachedOrganization();
    if (cachedOrg?.id) {
        debugLogger.trace(`[Context Ops] Resolved org name "${orgContextValue}" to ID: ${cachedOrg.id}`);
        return cachedOrg.id;
    }

    const cachedOrgList = deps.cacheManager.getCachedOrgList();
    const matchingOrg = cachedOrgList?.find(o => o.name === orgContextValue || o.code === orgContextValue);
    if (matchingOrg?.id) {
        debugLogger.trace(`[Context Ops] Resolved org name "${orgContextValue}" to ID from list: ${matchingOrg.id}`);
        return matchingOrg.id;
    }

    debugLogger.trace(`[Context Ops] Cannot resolve org name "${orgContextValue}" - no cached org`);
    return rawOrgId;
}

/**
 * Resolve project name from CLI context to numeric ID using cache
 */
function resolveProjectId(
    deps: ContextOperationsDeps,
    rawProjectId: string | undefined,
    projectContextValue: string | { id: string } | undefined,
): string | undefined {
    const debugLogger = getLogger();
    if (!rawProjectId || typeof projectContextValue !== 'string') return rawProjectId;

    const cachedProject = deps.cacheManager.getCachedProject();
    if (cachedProject?.id) {
        debugLogger.trace(`[Context Ops] Resolved project name "${rawProjectId}" to ID: ${cachedProject.id}`);
        return cachedProject.id;
    }

    debugLogger.trace(`[Context Ops] Cannot resolve project name "${rawProjectId}" - no cached project`);
    return rawProjectId;
}

/**
 * Ensure org context matches expected, re-select if needed
 */
async function ensureOrgContext(
    deps: ContextOperationsDeps,
    context: AdobeConsoleWhereResponse | undefined,
    expectedOrgId: string,
    selectOrganization: (orgId: string) => Promise<boolean>,
): Promise<boolean> {
    const debugLogger = getLogger();
    const currentOrgId = resolveOrgId(deps, extractContextId(context?.org), context?.org);

    if (currentOrgId === expectedOrgId) return true;

    debugLogger.debug(`[Context Ops] Context sync: org mismatch (current: "${currentOrgId || 'none'}"), re-selecting...`);
    const orgSelected = await selectOrganization(expectedOrgId);
    if (!orgSelected) {
        debugLogger.error('[Context Ops] Failed to restore org context');
        return false;
    }
    return true;
}

/**
 * Ensure project context matches expected, re-select if needed
 */
async function ensureProjectContext(
    deps: ContextOperationsDeps,
    context: AdobeConsoleWhereResponse | undefined,
    expectedProjectId: string,
    orgWasChanged: boolean,
    doSelectProject: (projectId: string) => Promise<boolean>,
): Promise<boolean> {
    const debugLogger = getLogger();
    const currentContext = orgWasChanged ? await getConsoleWhereContext(deps) : context;
    const resolvedId = resolveProjectId(deps, extractContextId(currentContext?.project), currentContext?.project);

    if (resolvedId === expectedProjectId) return true;

    debugLogger.debug(`[Context Ops] Context sync: project mismatch (current: "${resolvedId || 'none'}"), re-selecting...`);
    const projectSelected = await doSelectProject(expectedProjectId);
    if (!projectSelected) {
        debugLogger.error('[Context Ops] Failed to restore project context');
        return false;
    }
    return true;
}

/**
 * Ensure Adobe CLI context matches expected state before dependent operations.
 * Re-selects org/project if another process changed the global context.
 */
export async function ensureContext(
    deps: ContextOperationsDeps,
    expected: ExpectedContext,
    selectOrganization: (orgId: string) => Promise<boolean>,
    doSelectProject: (projectId: string) => Promise<boolean>,
): Promise<boolean> {
    const context = await getConsoleWhereContext(deps);

    if (expected.orgId) {
        const orgOk = await ensureOrgContext(deps, context, expected.orgId, selectOrganization);
        if (!orgOk) return false;
    }

    if (expected.projectId) {
        const orgWasChanged = !!expected.orgId;
        const projectOk = await ensureProjectContext(deps, context, expected.projectId, orgWasChanged, doSelectProject);
        if (!projectOk) return false;
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
            deps.commandManager.execute('aio config delete console.org', { encoding: 'utf8', useNodeVersion: getMeshNodeVersion() }),
            deps.commandManager.execute('aio config delete console.project', { encoding: 'utf8', useNodeVersion: getMeshNodeVersion() }),
            deps.commandManager.execute('aio config delete console.workspace', { encoding: 'utf8', useNodeVersion: getMeshNodeVersion() }),
        ]);

        // Clear console.where cache since context was cleared
        deps.cacheManager.clearConsoleWhereCache();

        debugLogger.debug('[Context Ops] Cleared Adobe CLI console context (preserved token)');
    } catch (error) {
        // Fail gracefully - config may not exist
        debugLogger.debug('[Context Ops] Failed to clear console context (non-critical):', error);
    }
}
