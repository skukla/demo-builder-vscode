/**
 * One hash over the API Mesh source files a deploy ships: `mesh.config.js`, the
 * built resolvers and the GraphQL schemas. A different hash means a different
 * mesh even when every env var is unchanged.
 */

import * as crypto from 'crypto';
import * as fsPromises from 'fs/promises';
import * as path from 'path';
import { getLogger } from '@/core/logging/debugLogger';
import type { Logger } from '@/types/logger';

/**
 * Calculate hash of mesh source files
 *
 * @param meshComponentPath - the mesh component's directory
 * @param logger - where a failure is reported; the extension logger when omitted
 * @returns the md5 hex digest, or null when there is nothing to hash
 */
export async function calculateMeshSourceHash(
    meshComponentPath: string,
    logger: Logger = getLogger(),
): Promise<string | null> {
    try {
        const resolversDir = path.join(meshComponentPath, 'build', 'resolvers');
        const schemasDir = path.join(meshComponentPath, 'schema');
        const meshConfigPath = path.join(meshComponentPath, 'mesh.config.js');

        let combinedContent = '';

        // Include mesh config - changes to this ALWAYS require deployment
        try {
            const meshConfig = await fsPromises.readFile(meshConfigPath, 'utf-8');
            combinedContent += meshConfig;
        } catch {
            // mesh.config.js might not exist yet
        }

        // Include all resolver files
        try {
            const resolverFiles = (await fsPromises.readdir(resolversDir))
                .filter((f) => f.endsWith('.js'))
                .sort(); // Sort for consistent hash

            for (const file of resolverFiles) {
                const filePath = path.join(resolversDir, file);
                const content = await fsPromises.readFile(filePath, 'utf-8');
                combinedContent += content;
            }
        } catch {
            // build/resolvers might not exist yet
        }

        // Include all schema files
        try {
            const schemaFiles = (await fsPromises.readdir(schemasDir))
                .filter((f) => f.endsWith('.graphql'))
                .sort();

            for (const file of schemaFiles) {
                const filePath = path.join(schemasDir, file);
                const content = await fsPromises.readFile(filePath, 'utf-8');
                combinedContent += content;
            }
        } catch {
            // schema directory might not exist yet
        }

        if (!combinedContent) {
            return null;
        }

        return crypto.createHash('md5').update(combinedContent).digest('hex');
    } catch (error) {
        logger.error('Error calculating source hash', error instanceof Error ? error : undefined);
        return null;
    }
}
