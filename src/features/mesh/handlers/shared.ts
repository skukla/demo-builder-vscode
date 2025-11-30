/**
 * Mesh Handlers - Shared utilities and helper functions
 *
 * Common helpers used across mesh handler modules.
 */

import { ServiceLocator } from '@/core/di';
import { HandlerContext } from '@/commands/handlers/HandlerContext';
import {
    getSetupInstructions as getSetupInstructionsHelper,
    getEndpoint as getEndpointHelper,
} from '@/features/project-creation/helpers';

/**
 * Get setup instructions for API Mesh
 *
 * Returns step-by-step instructions for enabling API Mesh if not available.
 */
export function getSetupInstructions(
    context: HandlerContext,
    selectedComponents: string[] = [],
): { step: string; details: string; important?: boolean }[] | undefined {
    return getSetupInstructionsHelper(
        context.sharedState.apiServicesConfig,
        selectedComponents,
        context.sharedState.componentsData as import('../../../types/components').ComponentRegistry | undefined,
    );
}

/**
 * Get mesh endpoint using single source of truth approach
 *
 * Uses a 3-tier strategy:
 * 1. Use cached endpoint if available (instant)
 * 2. Call aio api-mesh:describe (official Adobe method, ~3s)
 * 3. Construct from meshId as reliable fallback
 */
export async function getEndpoint(
    context: HandlerContext,
    meshId: string,
    cachedEndpoint?: string,
): Promise<string> {
    const commandManager = ServiceLocator.getCommandExecutor();
    return getEndpointHelper(
        meshId,
        cachedEndpoint,
        commandManager,
        context.logger,
        context.debugLogger,
    );
}
