/**
 * Read the env var values the API Mesh deployed on Adobe I/O actually carries.
 *
 * Used when a project has a deploy record but no captured env vars: the deployed
 * mesh is the only other place a baseline can come from. Checks the sign-in first,
 * so an expired session answers "unknown" instead of opening a browser.
 */

import type { CommandExecutor } from '@/core/shell/commandExecutor';
import type { AuthenticationService } from '@/features/authentication/services/authenticationService';
import type { Logger } from '@/types/logger';
import { parseJSON } from '@/types/typeGuards';

/** ADR-015: the collaborators mesh staleness detection needs. */
export interface MeshStalenessDeps {
    commandManager: CommandExecutor;
    authManager: AuthenticationService;
}

/**
 * Fetch deployed mesh configuration from Adobe I/O.
 *
 * This IS the exported function now. Until 2026-08-28 there was also a no-argument
 * `fetchDeployedMeshConfig()` wrapper around it; that wrapper had ZERO production
 * callers — only tests and one mock — so the suite was exercising a signature
 * nothing shipped. The wrapper is deleted rather than deprecated, and the tests
 * call this.
 */
export async function fetchDeployedMeshConfig(
    logger: Logger,
    deps: MeshStalenessDeps,
): Promise<Record<string, string> | null> {
    try {
        const { TIMEOUTS } = await import('@/core/utils/timeoutConfig');
        const { demoBuilderNode } = await import('@/core/shell/demoBuilderNode');
        const commandManager = deps.commandManager;

        logger.debug('[Mesh Staleness] Fetching deployed mesh config from Adobe I/O');

        // Pre-check: Verify authentication status without triggering browser auth
        // Use getTokenStatus() which reads token file directly (no CLI call, no browser popup)
        try {
            const authService = deps.authManager;
            const tokenStatus = await authService.getTokenStatus();

            if (!tokenStatus.isAuthenticated) {
                logger.debug('[Mesh Staleness] Token expired or invalid, skipping mesh fetch');
                return null;
            }
        } catch (authError) {
            logger.debug('[Mesh Staleness] Auth check failed, skipping mesh fetch:', authError);
            return null;
        }

        // Query the deployed mesh configuration
        const result = await commandManager.execute('aio api-mesh:get --active --json', {
            timeout: TIMEOUTS.NORMAL,
            useNodeVersion: demoBuilderNode(),
        });

        // Parse the JSON response
        const meshData = parseJSON<{
            meshConfig?: {
                sources?: {
                    name?: string;
                    handler?: {
                        graphql?: { endpoint?: string; operationHeaders?: Record<string, string> };
                    };
                }[];
            };
        }>(result.stdout);
        if (!meshData) {
            logger.debug('[Mesh Staleness] Failed to parse mesh data');
            return null;
        }

        // Extract environment variables from the mesh configuration
        // Match the structure we generate in meshDeployer.ts
        const deployedEnvVars: Record<string, string> = {};

        if (meshData.meshConfig?.sources) {
            for (const source of meshData.meshConfig.sources) {
                // Commerce GraphQL endpoint (source name: 'magento')
                if (source.name === 'magento' && source.handler?.graphql?.endpoint) {
                    deployedEnvVars.ADOBE_COMMERCE_GRAPHQL_ENDPOINT =
                        source.handler.graphql.endpoint;
                }

                // Catalog Service endpoint (source name: 'catalog')
                if (source.name === 'catalog' && source.handler?.graphql?.endpoint) {
                    deployedEnvVars.ADOBE_CATALOG_SERVICE_ENDPOINT =
                        source.handler.graphql.endpoint;
                }

                // Extract API key from catalog source headers
                if (source.name === 'catalog' && source.handler?.graphql?.operationHeaders) {
                    const headers = source.handler.graphql.operationHeaders;
                    // The key might be a placeholder like {context.headers['x-api-key']}
                    // Or an actual value - we want the actual value
                    if (headers['x-api-key'] && !headers['x-api-key'].includes('context.headers')) {
                        deployedEnvVars.ADOBE_CATALOG_API_KEY = headers['x-api-key'];
                    }
                }
            }
        }

        logger.debug('[Mesh Staleness] Successfully fetched deployed mesh config', {
            keyCount: Object.keys(deployedEnvVars).length,
        });

        return deployedEnvVars;
    } catch (error) {
        logger.trace('[Mesh Staleness] Failed to fetch deployed mesh config:', error);
        return null;
    }
}
