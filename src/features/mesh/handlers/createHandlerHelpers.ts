/**
 * Create Handler Helper Functions (Step 8 - Phase 3)
 *
 * Extracted helper functions to reduce cognitive complexity in createHandler.ts
 */

import { HandlerContext } from '@/commands/handlers/HandlerContext';
import { CommandExecutor } from '@/core/shell';
import type { CommandResult } from '@/core/shell/types';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';
import { getEndpoint } from '@/features/mesh/handlers/shared';
import { getMeshNodeVersion } from '@/features/mesh/services/meshConfig';

/**
 * Create a streaming callback for mesh operations (create/update)
 *
 * Generates an onOutput callback that parses CLI output for progress indicators
 * and calls the onProgress function with appropriate user-facing messages.
 *
 * @param operation - Type of operation ('create' | 'update')
 * @param onProgress - Optional progress callback
 * @param outputAccumulator - Optional object to accumulate output (only used for create operation)
 * @returns Streaming callback function for command execution
 */
export function createProgressCallback(
    operation: 'create' | 'update',
    onProgress?: (message: string, subMessage?: string) => void,
    outputAccumulator?: { value: string },
): (data: string) => void {
    return (data: string) => {
        // Accumulate output ONLY for create operation (update doesn't need it)
        if (operation === 'create' && outputAccumulator) {
            outputAccumulator.value += data;
        }

        // Parse output for progress indicators (case-insensitive)
        const output = data.toLowerCase();

        if (operation === 'create') {
            // Create operation progress messages
            if (output.includes('validating')) {
                onProgress?.('Creating API Mesh...', 'Validating configuration');
            } else if (output.includes('creating')) {
                onProgress?.('Creating API Mesh...', 'Provisioning mesh infrastructure');
            } else if (output.includes('deploying')) {
                onProgress?.('Creating API Mesh...', 'Deploying mesh');
            } else if (output.includes('success')) {
                onProgress?.('Creating API Mesh...', 'Finalizing mesh setup');
            }
        } else {
            // Update operation progress messages
            if (output.includes('validating')) {
                onProgress?.('Deploying API Mesh...', 'Validating mesh configuration');
            } else if (output.includes('updating')) {
                onProgress?.('Deploying API Mesh...', 'Updating mesh infrastructure');
            } else if (output.includes('deploying')) {
                onProgress?.('Deploying API Mesh...', 'Deploying to Adobe infrastructure');
            } else if (output.includes('success')) {
                onProgress?.('API Mesh Ready', 'Mesh deployed successfully');
            }
        }
    };
}

/**
 * Handle "mesh already exists" or "partially created" scenarios
 *
 * When mesh creation fails with specific error patterns (workspace already has a mesh
 * or mesh was created but deployment failed), this helper attempts to update the mesh
 * instead of creating a new one.
 *
 * @param context - Handler context with logger and extension context
 * @param commandExecutor - Command executor for running Adobe CLI commands
 * @param meshConfigPath - Path to mesh configuration file
 * @param createResult - Result from the create command
 * @param lastOutput - Accumulated output from create command
 * @param onProgress - Optional progress callback
 * @returns Success result with meshId and endpoint, or undefined if not "mesh exists" case
 * @throws Error if update command fails
 */
export async function handleMeshAlreadyExists(
    context: HandlerContext,
    commandExecutor: CommandExecutor,
    meshConfigPath: string,
    createResult: CommandResult,
    lastOutput: { value: string },
    onProgress?: (message: string, subMessage?: string) => void,
): Promise<{
    success: boolean;
    meshId?: string;
    endpoint?: string;
    message?: string;
} | undefined> {
    const errorMsg = createResult.stderr || lastOutput.value || 'Failed to create mesh';

    // Check for "mesh already exists" patterns
    const meshAlreadyExists = errorMsg.includes('already has a mesh') || lastOutput.value.includes('already has a mesh');

    // Check for "mesh created but deployment failed" patterns
    const meshCreatedButFailed = createResult.stdout.includes('Mesh created') ||
                                 createResult.stdout.includes('mesh created') ||
                                 lastOutput.value.includes('Mesh created');

    // If neither pattern matches, return undefined (not our case)
    if (!meshAlreadyExists && !meshCreatedButFailed) {
        return undefined;
    }

    // Determine which scenario we're in and log appropriately
    if (meshCreatedButFailed) {
        context.logger.debug('[API Mesh] Mesh created but deployment failed, attempting update to redeploy');
        onProgress?.('Completing API Mesh Setup...', 'Detected partial creation, now deploying mesh');
    } else {
        context.logger.debug('[API Mesh] Mesh already exists, updating with new configuration');
        onProgress?.('Updating Existing Mesh...', 'Found existing mesh, updating configuration');
    }

    // Update the existing mesh to ensure proper deployment
    try {
        const updateResult = await commandExecutor.execute(
            `aio api-mesh:update "${meshConfigPath}" --autoConfirmAction`,
            {
                streaming: true,
                shell: true, // Required for command string with arguments and quoted paths
                timeout: TIMEOUTS.API_MESH_UPDATE,
                onOutput: createProgressCallback('update', onProgress),
                configureTelemetry: false,
                useNodeVersion: getMeshNodeVersion(),
                enhancePath: true,
            },
        );

        if (updateResult.code === 0) {
            context.logger.info('[API Mesh] Mesh updated successfully');

            // Extract mesh ID from output
            const meshIdMatch = /mesh[\s_-]?id\s*:\s*([a-z0-9-]+)/i.exec(updateResult.stdout);
            const meshId = meshIdMatch ? meshIdMatch[1] : undefined;

            // Get endpoint using single source of truth
            const endpoint = meshId ? await getEndpoint(context, meshId) : undefined;

            onProgress?.('✓ API Mesh Ready', 'Mesh successfully deployed and ready to use');

            return {
                success: true,
                meshId,
                endpoint,
                message: 'API Mesh deployed successfully',
            };
        } else {
            const updateError = updateResult.stderr || 'Failed to update mesh';
            context.logger.error('[API Mesh] Update failed', new Error(updateError));
            throw new Error(updateError);
        }
    } catch (updateError) {
        context.logger.error('[API Mesh] Failed to update existing mesh', updateError as Error);
        throw updateError;
    }
}
