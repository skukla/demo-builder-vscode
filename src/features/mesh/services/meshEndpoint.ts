/**
 * Mesh endpoint resolution utilities
 */

import { getMeshNodeVersion } from './meshConfig';
import type { CommandExecutor } from '@/core/shell';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';
import { validateMeshId } from '@/core/validation';
import type { Logger } from '@/types/logger';
import { parseJSON } from '@/types/typeGuards';

/**
 * Check if aio api-mesh plugin is installed
 *
 * @param commandManager - CommandExecutor instance
 * @param debugLogger - Debug logger for diagnostic messages
 * @returns True if plugin is installed, false otherwise
 */
async function checkApiMeshPlugin(
    commandManager: CommandExecutor,
    debugLogger: Logger,
): Promise<boolean> {
    try {
        // Mesh plugin is installed with the Node version defined for commerce-mesh component
        const result = await commandManager.execute('aio plugins', {
            timeout: TIMEOUTS.QUICK,
            configureTelemetry: false,
            useNodeVersion: getMeshNodeVersion(),
            enhancePath: true,
        });

        if (result.code === 0) {
            const hasPlugin = result.stdout.includes('@adobe/aio-cli-plugin-api-mesh');
            debugLogger.debug(`[API Mesh] Plugin check: ${hasPlugin ? 'installed' : 'not installed'}`);
            return hasPlugin;
        }
    } catch {
        debugLogger.debug('[API Mesh] Plugin check failed, assuming not installed');
    }
    return false;
}

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
 * @param debugLogger - Debug logger for detailed logging (accepts any logger type)
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

    // Check if api-mesh plugin is installed before attempting describe
    const hasPlugin = await checkApiMeshPlugin(commandManager, debugLogger);

    if (hasPlugin) {
        // Call describe command (official Adobe method)
        try {
            debugLogger.debug('[API Mesh] Fetching endpoint via describe command');
            const result = await commandManager.execute(
                'aio api-mesh:describe',
                {
                    timeout: TIMEOUTS.NORMAL,
                    configureTelemetry: false,
                    useNodeVersion: getMeshNodeVersion(),
                    enhancePath: true,
                },
            );

            if (result.code === 0) {
                // Debug: Log raw describe output for troubleshooting
                debugLogger.debug(`[API Mesh] describe stdout (${result.stdout.length} chars): ${result.stdout.substring(0, 500)}`);
                
                // Parse JSON response
                const jsonMatch = /\{[\s\S]*\}/.exec(result.stdout);
                if (jsonMatch) {
                    debugLogger.debug(`[API Mesh] JSON match found: ${jsonMatch[0].substring(0, 300)}`);
                    const meshData = parseJSON<{ meshEndpoint?: string; endpoint?: string }>(jsonMatch[0]);
                    if (!meshData) {
                        logger.warn('[Mesh] Failed to parse mesh data from describe');
                        // Continue to fallback
                    } else {
                        debugLogger.debug(`[API Mesh] Parsed meshData keys: ${Object.keys(meshData).join(', ')}`);
                        debugLogger.debug(`[API Mesh] meshEndpoint: ${meshData.meshEndpoint}, endpoint: ${meshData.endpoint}`);
                        const endpoint = meshData.meshEndpoint || meshData.endpoint;
                        if (endpoint) {
                            logger.debug('[API Mesh] Retrieved endpoint from describe:', endpoint);
                            return endpoint;
                        } else {
                            debugLogger.debug('[API Mesh] No endpoint field found in parsed data');
                        }
                    }
                } else {
                    debugLogger.debug('[API Mesh] No JSON object found in describe output');
                }
            }
        } catch {
            debugLogger.debug('[API Mesh] Describe failed, using constructed fallback');
        }
    } else {
        debugLogger.debug('[API Mesh] Plugin not installed, using constructed endpoint');
    }

    // Construct as reliable fallback
    const endpoint = `https://edge-sandbox-graph.adobe.io/api/${meshId}/graphql`;
    logger.debug('[API Mesh] Using constructed endpoint (fallback)');
    return endpoint;
}
