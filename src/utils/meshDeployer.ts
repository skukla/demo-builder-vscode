import * as fs from 'fs/promises';
import * as path from 'path';
import { ServiceLocator } from '../services/serviceLocator';
import { Project } from '../types';
import { Logger } from '../shared/logging';
import { validateMeshId } from '@/shared/validation';

export class MeshDeployer {
    private logger: Logger;

    constructor(logger: Logger) {
        this.logger = logger;
    }

    public async deploy(project: Project): Promise<{ success: boolean; endpoint?: string }> {
        try {
            // Generate mesh configuration
            const meshConfig = this.generateMeshConfig(project);
            const meshPath = path.join(project.path, 'mesh.json');
            
            // Write mesh configuration
            await fs.writeFile(meshPath, JSON.stringify(meshConfig, null, 2));
            this.logger.info('Generated mesh configuration');

            // Deploy mesh
            this.logger.info('Deploying API Mesh...');
            const commandManager = ServiceLocator.getCommandExecutor();
            const { stdout } = await commandManager.executeAdobeCLI('aio api-mesh:create mesh.json', {
                cwd: project.path,
            });

            // Extract endpoint from output
            const endpointMatch = /https:\/\/[^\s]+/.exec(stdout);
            const endpoint = endpointMatch ? endpointMatch[0] : undefined;

            if (endpoint) {
                this.logger.info(`Mesh deployed successfully: ${endpoint}`);
                return { success: true, endpoint };
            }

            return { success: false };
        } catch (error) {
            this.logger.error('Mesh deployment failed', error as Error);
            return { success: false };
        }
    }

    private generateMeshConfig(project: Project): Record<string, unknown> {
        const sources: Record<string, unknown>[] = [];

        // Add main Commerce GraphQL source
        if (project.commerce) {
            sources.push({
                name: 'magento',
                handler: {
                    graphql: {
                        endpoint: `${project.commerce.instance.url}/graphql`,
                    },
                },
            });
        }

        // Add Catalog Service if configured
        if (project.commerce?.services.catalog?.enabled) {
            sources.push({
                name: 'catalog',
                handler: {
                    graphql: {
                        endpoint: project.commerce.services.catalog.endpoint,
                        operationHeaders: {
                            'x-api-key': '{context.headers[\'x-api-key\']}',
                        },
                    },
                },
            });
        }

        // Add Live Search if configured
        if (project.commerce?.services.liveSearch?.enabled) {
            sources.push({
                name: 'search',
                handler: {
                    graphql: {
                        endpoint: project.commerce.services.liveSearch.endpoint,
                        operationHeaders: {
                            'x-api-key': '{context.headers[\'x-api-key\']}',
                        },
                    },
                },
            });
        }

        return {
            meshConfig: {
                sources,
            },
        };
    }

    public async update(project: Project): Promise<{ success: boolean; endpoint?: string }> {
        try {
            const meshConfig = this.generateMeshConfig(project);
            const meshPath = path.join(project.path, 'mesh.json');
            
            await fs.writeFile(meshPath, JSON.stringify(meshConfig, null, 2));
            
            const commandManager = ServiceLocator.getCommandExecutor();
            const { stdout } = await commandManager.executeAdobeCLI('aio api-mesh:update mesh.json', {
                cwd: project.path,
            });

            const endpointMatch = /https:\/\/[^\s]+/.exec(stdout);
            const endpoint = endpointMatch ? endpointMatch[0] : undefined;

            if (endpoint) {
                this.logger.info(`Mesh updated successfully: ${endpoint}`);
                return { success: true, endpoint };
            }

            return { success: false };
        } catch (error) {
            this.logger.error('Mesh update failed', error as Error);
            return { success: false };
        }
    }

    public async delete(meshId: string): Promise<boolean> {
        try {
            // SECURITY: Validate meshId before using in shell command to prevent command injection
            // Example attack: meshId = "abc123; rm -rf / #"
            validateMeshId(meshId);

            const commandManager = ServiceLocator.getCommandExecutor();
            await commandManager.executeAdobeCLI(`aio api-mesh:delete ${meshId}`);
            this.logger.info(`Mesh ${meshId} deleted`);
            return true;
        } catch (error) {
            this.logger.error('Mesh deletion failed', error as Error);
            return false;
        }
    }
}