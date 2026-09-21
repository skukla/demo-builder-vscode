/**
 * Mesh endpoint resolution utilities
 */

import type { CommandExecutor } from '@/core/shell/commandExecutor';
import { getMeshNodeVersion } from '@/core/utils/meshConfig';
import { sleep } from '@/core/utils/sleep';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';
import { validateMeshId } from '@/core/validation/validators/AdobeResourceValidator';
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
 * Fetch mesh endpoint from aio api-mesh:describe command output
 */
async function fetchEndpointFromDescribe(
    commandManager: CommandExecutor,
    logger: Logger,
    debugLogger: Logger,
): Promise<string | undefined> {
    try {
        debugLogger.debug('[API Mesh] Fetching endpoint via describe command');
        const result = await commandManager.execute('aio api-mesh:describe', {
            timeout: TIMEOUTS.NORMAL,
            configureTelemetry: false,
            useNodeVersion: getMeshNodeVersion(),
            enhancePath: true,
        });

        if (result.code !== 0) return undefined;

        debugLogger.debug(`[API Mesh] describe stdout (${result.stdout.length} chars): ${result.stdout.substring(0, 500)}`);

        const jsonMatch = /\{[\s\S]*\}/.exec(result.stdout);
        if (!jsonMatch) {
            debugLogger.debug('[API Mesh] No JSON object found in describe output');
            return undefined;
        }

        debugLogger.debug(`[API Mesh] JSON match found: ${jsonMatch[0].substring(0, 300)}`);
        const meshData = parseJSON<{ meshEndpoint?: string; endpoint?: string }>(jsonMatch[0]);
        if (!meshData) {
            logger.warn('[Mesh] Failed to parse mesh data from describe');
            return undefined;
        }

        debugLogger.debug(`[API Mesh] Parsed meshData keys: ${Object.keys(meshData).join(', ')}`);
        debugLogger.debug(`[API Mesh] meshEndpoint: ${meshData.meshEndpoint}, endpoint: ${meshData.endpoint}`);

        const endpoint = meshData.meshEndpoint || meshData.endpoint;
        if (endpoint) {
            logger.debug('[API Mesh] Retrieved endpoint from describe:', endpoint);
            return endpoint;
        }

        debugLogger.debug('[API Mesh] No endpoint field found in parsed data');
        return undefined;
    } catch {
        debugLogger.debug('[API Mesh] Describe failed, using constructed fallback');
        return undefined;
    }
}

/**
 * Get mesh endpoint - single source of truth approach:
 * 1. Use cached endpoint if available (instant)
 * 2. Call aio api-mesh:describe (official Adobe method, ~3s)
 * 3. Construct from meshId as reliable fallback
 *
 * @param meshId - The mesh ID to get the endpoint for
 * @param cachedEndpoint - Optional cached endpoint for instant return
 * @param commandManager - CommandExecutor instance for executing commands
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
        const describeEndpoint = await fetchEndpointFromDescribe(commandManager, logger, debugLogger);
        if (describeEndpoint) {
            return describeEndpoint;
        }
    } else {
        debugLogger.debug('[API Mesh] Plugin not installed, using constructed endpoint');
    }

    // Construct as reliable fallback
    const endpoint = `https://edge-sandbox-graph.adobe.io/api/${meshId}/graphql`;
    logger.debug('[API Mesh] Using constructed endpoint (fallback)');
    return endpoint;
}

/** The two hosts Adobe serves meshes from. */
const MESH_HOSTS = ['edge-sandbox-graph.adobe.io', 'edge-graph.adobe.io'] as const;
/** Rounds of asking before settling for the stated address. */
const PROBE_ROUNDS = 3;

/** Whether a mesh answers at this address: anything but a 404 or no reply at all. */
export async function meshAnswersAt(url: string): Promise<boolean> {
    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query: '{ __typename }' }),
            signal: AbortSignal.timeout(TIMEOUTS.QUICK),
        });
        return response.status !== 404;
    } catch {
        return false;
    }
}

/**
 * The address a mesh actually answers on.
 *
 * Adobe serves a mesh from `edge-sandbox-graph` or `edge-graph`, and what it SAYS
 * is not proof: on 2026-09-21 a mesh in a workspace titled "Production" was
 * reported by `aio api-mesh:describe` on the sandbox host, which answered 404
 * "Mesh … does not exist", while `edge-graph` answered 200. That address was
 * published into the live storefront. So the stated address is tried first, then
 * the other host, for a few rounds (a new mesh can take seconds to reach the
 * edge); the first that answers wins. When neither does, the stated one stands.
 *
 * @param endpoint - the address Adobe reported, or one built from the mesh id
 * @param ask - whether a mesh answers at a URL (injected in tests)
 * @returns the address that answers, else `endpoint`
 */
export async function answeringEndpoint(
    endpoint: string,
    ask: (url: string) => Promise<boolean> = meshAnswersAt,
): Promise<string> {
    const match = /^https:\/\/(edge-(?:sandbox-)?graph\.adobe\.io)(\/api\/[^\s]+)$/.exec(endpoint);
    if (!match) return endpoint;
    const [, statedHost, path] = match;
    const candidates = [endpoint, ...MESH_HOSTS.filter((host) => host !== statedHost).map((host) => `https://${host}${path}`)];
    for (let round = 1; round <= PROBE_ROUNDS; round++) {
        for (const url of candidates) {
            if (await ask(url)) return url;
        }
        if (round < PROBE_ROUNDS) await sleep(TIMEOUTS.MESH_ENDPOINT_PROBE_INTERVAL);
    }
    return endpoint;
}
