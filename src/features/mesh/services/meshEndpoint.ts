/**
 * Mesh endpoint resolution utilities
 */

import { Logger } from '@/types/logger';
import { parseJSON } from '@/types/typeGuards';
import { CommandExecutor } from '@/shared/command-execution';
import { validateMeshId } from '@/shared/validation';
import { TIMEOUTS } from '@/utils/timeoutConfig';

/**
 * Get mesh endpoint - single source of truth approach:
 * 1. Use cached endpoint if available (instant)
 * 2. Call aio api-mesh:describe (official Adobe method, ~3s)
 * 3. Construct from meshId as reliable fallback
 *
 * @param meshId - The mesh ID to get the endpoint for
 * @param cachedEndpoint - Optional cached endpoint for instant return
 * @param commandManager - ExternalCommandManager instance for executing commands
 * @param logger - Logger instance for debug messages
 * @param debugLogger - Debug logger for detailed logging
 * @returns The mesh endpoint URL
 */
export async function getEndpoint(
    meshId: string,
    cachedEndpoint: string | undefined,
    commandManager: CommandExecutor,
    logger: Logger,
    debugLogger: Logger,
): Promise<string> {
    // SECURITY: Validate meshId before using in URL construction (defense-in-depth)
    validateMeshId(meshId);

    // Use cache if available (instant)
    if (cachedEndpoint) {
        debugLogger.debug('[API Mesh] Using cached endpoint');
        return cachedEndpoint;
    }

    // Call describe command (official Adobe method)
    try {
        debugLogger.debug('[API Mesh] Fetching endpoint via describe command');
        const result = await commandManager.execute(
            'aio api-mesh:describe',
            {
                timeout: TIMEOUTS.API_CALL,
                configureTelemetry: false,
                useNodeVersion: null,
                enhancePath: true,
            },
        );

        if (result.code === 0) {
            // Parse JSON response
            const jsonMatch = /\{[\s\S]*\}/.exec(result.stdout);
            if (jsonMatch) {
                const meshData = parseJSON<{ meshEndpoint?: string; endpoint?: string }>(jsonMatch[0]);
                if (!meshData) {
                    logger?.warn('[Mesh Endpoint] Failed to parse mesh data');
                    // Continue to fallback
                } else {
                    const endpoint = meshData.meshEndpoint || meshData.endpoint;
                    if (endpoint) {
                        logger.info('[API Mesh] Retrieved endpoint from describe:', endpoint);
                        return endpoint;
                    }
                }
            }
        }
    } catch {
        debugLogger.debug('[API Mesh] Describe failed, using constructed fallback');
    }

    // Construct as reliable fallback
    const endpoint = `https://edge-sandbox-graph.adobe.io/api/${meshId}/graphql`;
    logger.info('[API Mesh] Using constructed endpoint (fallback)');
    return endpoint;
}
