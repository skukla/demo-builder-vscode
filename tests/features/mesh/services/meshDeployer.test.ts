/**
 * MeshDeployer Tests
 *
 * Comprehensive test suite for MeshDeployer utility.
 * Tests mesh configuration building, deployment, updates, and Adobe CLI integration.
 *
 * Target Coverage: 75%+
 */

import { MeshDeployer } from '@/features/mesh/services/meshDeployer';
import { Project } from '@/types';
import { ServiceLocator } from '@/core/di/serviceLocator';
import { CommandExecutor } from '@/core/shell';
import { Logger } from '@/core/logging';
import * as fs from 'fs/promises';

// Mock ServiceLocator
jest.mock('@/core/di/serviceLocator');

// Mock fs/promises
jest.mock('fs/promises');

// Mock securityValidation
jest.mock('@/core/validation/securityValidation', () => ({
    validateMeshId: jest.fn()
}));

// Mock CommandExecutor
const mockCommandExecutor = {
    execute: jest.fn(),
    executeAdobeCLI: jest.fn(),
    executeExclusive: jest.fn(),
    pollUntilCondition: jest.fn(),
    waitForFileSystem: jest.fn(),
    executeSequence: jest.fn(),
    executeParallel: jest.fn(),
    queueCommand: jest.fn(),
    commandExists: jest.fn(),
    isPortAvailable: jest.fn(),
    dispose: jest.fn()
} as unknown as CommandExecutor;

describe('MeshDeployer', () => {
    let meshDeployer: MeshDeployer;
    let mockLogger: Logger;
    let mockProject: Project;

    beforeEach(() => {
        jest.clearAllMocks();

        // Mock logger - Create real Logger instance but mock underlying debugLogger
        mockLogger = new Logger('Test');
        jest.spyOn(mockLogger, 'debug');
        jest.spyOn(mockLogger, 'info');
        jest.spyOn(mockLogger, 'warn');
        jest.spyOn(mockLogger, 'error');

        // Mock ServiceLocator
        (ServiceLocator.getCommandExecutor as jest.Mock).mockReturnValue(mockCommandExecutor);

        // Create test project
        mockProject = {
            name: 'test-project',
            path: '/test/project',
            status: 'ready',
            created: new Date(),
            lastModified: new Date(),
            commerce: {
                type: 'platform-as-a-service',
                instance: {
                    url: 'https://example.magentosite.cloud',
                    environmentId: 'env123',
                    storeView: 'default',
                    websiteCode: 'base',
                    storeCode: 'default'
                },
                services: {}
            }
        };

        // Create MeshDeployer instance
        meshDeployer = new MeshDeployer(mockLogger);

        // Mock successful command execution by default
        (mockCommandExecutor.executeAdobeCLI as jest.Mock).mockResolvedValue({
            stdout: 'https://mesh-endpoint.adobe.io/graphql',
            stderr: '',
            code: 0,
            duration: 1000
        });

        // Mock fs.writeFile
        (fs.writeFile as jest.Mock).mockResolvedValue(undefined);
    });

    describe('generateMeshConfig', () => {
        it('should generate basic mesh config with Commerce GraphQL', () => {
            const config = (meshDeployer as any).generateMeshConfig(mockProject);

            expect(config).toHaveProperty('meshConfig');
            expect(config.meshConfig).toHaveProperty('sources');
            expect(config.meshConfig.sources).toHaveLength(1);
            expect(config.meshConfig.sources[0]).toMatchObject({
                name: 'magento',
                handler: {
                    graphql: {
                        endpoint: 'https://example.magentosite.cloud/graphql'
                    }
                }
            });
        });

        it('should include Catalog Service if enabled', () => {
            mockProject.commerce!.services.catalog = {
                enabled: true,
                endpoint: 'https://catalog-service.adobe.io/graphql',
                apiKey: 'catalog-key-123'
            };

            const config = (meshDeployer as any).generateMeshConfig(mockProject);

            const catalogSource = config.meshConfig.sources.find(
                (s: any) => s.name === 'catalog'
            );
            expect(catalogSource).toBeDefined();
            expect(catalogSource).toMatchObject({
                name: 'catalog',
                handler: {
                    graphql: {
                        endpoint: 'https://catalog-service.adobe.io/graphql',
                        operationHeaders: {
                            'x-api-key': '{context.headers[\'x-api-key\']}'
                        }
                    }
                }
            });
        });

        it('should include Live Search if enabled', () => {
            mockProject.commerce!.services.liveSearch = {
                enabled: true,
                endpoint: 'https://search-service.adobe.io/graphql',
                apiKey: 'search-key-123'
            };

            const config = (meshDeployer as any).generateMeshConfig(mockProject);

            const searchSource = config.meshConfig.sources.find(
                (s: any) => s.name === 'search'
            );
            expect(searchSource).toBeDefined();
            expect(searchSource).toMatchObject({
                name: 'search',
                handler: {
                    graphql: {
                        endpoint: 'https://search-service.adobe.io/graphql',
                        operationHeaders: {
                            'x-api-key': '{context.headers[\'x-api-key\']}'
                        }
                    }
                }
            });
        });

        it('should include all sources when all services enabled', () => {
            mockProject.commerce!.services.catalog = {
                enabled: true,
                endpoint: 'https://catalog-service.adobe.io/graphql',
                apiKey: 'catalog-key'
            };

            mockProject.commerce!.services.liveSearch = {
                enabled: true,
                endpoint: 'https://search-service.adobe.io/graphql',
                apiKey: 'search-key'
            };

            const config = (meshDeployer as any).generateMeshConfig(mockProject);

            expect(config.meshConfig.sources).toHaveLength(3);
            expect(config.meshConfig.sources.map((s: any) => s.name)).toEqual([
                'magento',
                'catalog',
                'search'
            ]);
        });

        it('should not include disabled services', () => {
            mockProject.commerce!.services.catalog = {
                enabled: false,
                endpoint: 'https://catalog-service.adobe.io/graphql'
            };

            const config = (meshDeployer as any).generateMeshConfig(mockProject);

            const catalogSource = config.meshConfig.sources.find(
                (s: any) => s.name === 'catalog'
            );
            expect(catalogSource).toBeUndefined();
        });

        it('should handle project without commerce config', () => {
            const projectWithoutCommerce: Project = {
                name: 'test-project',
                path: '/test/project',
                status: 'ready',
                created: new Date(),
                lastModified: new Date()
            };

            const config = (meshDeployer as any).generateMeshConfig(projectWithoutCommerce);

            expect(config.meshConfig.sources).toHaveLength(0);
        });
    });

    describe('deploy', () => {
        it('should deploy mesh successfully', async () => {
            const result = await meshDeployer.deploy(mockProject);

            expect(result.success).toBe(true);
            expect(result.data!.endpoint).toBe('https://mesh-endpoint.adobe.io/graphql');
        });

        it('should write mesh.json file', async () => {
            await meshDeployer.deploy(mockProject);

            expect(fs.writeFile).toHaveBeenCalledWith(
                '/test/project/mesh.json',
                expect.any(String)
            );

            const writeCall = (fs.writeFile as jest.Mock).mock.calls[0];
            const meshConfig = JSON.parse(writeCall[1]);
            expect(meshConfig).toHaveProperty('meshConfig');
        });

        it('should execute aio api-mesh:create command', async () => {
            await meshDeployer.deploy(mockProject);

            expect(mockCommandExecutor.executeAdobeCLI).toHaveBeenCalledWith(
                'aio api-mesh:create mesh.json',
                expect.objectContaining({
                    cwd: '/test/project'
                })
            );
        });

        it('should extract endpoint from command output', async () => {
            (mockCommandExecutor.executeAdobeCLI as jest.Mock).mockResolvedValue({
                stdout: 'Mesh created successfully\nhttps://custom-mesh.adobe.io/graphql\nDone!',
                stderr: '',
                code: 0,
                duration: 1000
            });

            const result = await meshDeployer.deploy(mockProject);

            expect(result.data!.endpoint).toBe('https://custom-mesh.adobe.io/graphql');
        });

        it('should handle deployment without endpoint', async () => {
            (mockCommandExecutor.executeAdobeCLI as jest.Mock).mockResolvedValue({
                stdout: 'Mesh created but no endpoint provided',
                stderr: '',
                code: 0,
                duration: 1000
            });

            const result = await meshDeployer.deploy(mockProject);

            expect(result.success).toBe(false);
            expect(result.data?.endpoint).toBeUndefined();
        });

        it('should handle deployment failure', async () => {
            (mockCommandExecutor.executeAdobeCLI as jest.Mock).mockRejectedValue(
                new Error('Deployment failed')
            );

            const result = await meshDeployer.deploy(mockProject);

            expect(result.success).toBe(false);
            expect(mockLogger.error).toHaveBeenCalledWith(
                'Mesh deployment failed',
                expect.any(Error)
            );
        });

        it('should handle file write failure', async () => {
            (fs.writeFile as jest.Mock).mockRejectedValue(
                new Error('Permission denied')
            );

            const result = await meshDeployer.deploy(mockProject);

            expect(result.success).toBe(false);
            expect(mockLogger.error).toHaveBeenCalled();
        });

        it('should log info messages during deployment', async () => {
            await meshDeployer.deploy(mockProject);

            expect(mockLogger.info).toHaveBeenCalledWith('Generated mesh configuration');
            expect(mockLogger.info).toHaveBeenCalledWith('Deploying API Mesh...');
            expect(mockLogger.info).toHaveBeenCalledWith(
                expect.stringContaining('Mesh deployed successfully')
            );
        });

        it('should handle multi-line output with endpoint', async () => {
            (mockCommandExecutor.executeAdobeCLI as jest.Mock).mockResolvedValue({
                stdout: `
Deploying mesh...
Configuration validated
https://mesh-123.adobe.io/graphql
Deployment complete
                `,
                stderr: '',
                code: 0,
                duration: 1000
            });

            const result = await meshDeployer.deploy(mockProject);

            expect(result.data!.endpoint).toBe('https://mesh-123.adobe.io/graphql');
        });

        it('should handle multiple URLs in output (use first)', async () => {
            (mockCommandExecutor.executeAdobeCLI as jest.Mock).mockResolvedValue({
                stdout: `
Primary endpoint: https://primary.adobe.io/graphql
Secondary endpoint: https://secondary.adobe.io/graphql
                `,
                stderr: '',
                code: 0,
                duration: 1000
            });

            const result = await meshDeployer.deploy(mockProject);

            expect(result.data!.endpoint).toBe('https://primary.adobe.io/graphql');
        });
    });

    describe('update', () => {
        it('should update mesh successfully', async () => {
            const result = await meshDeployer.update(mockProject);

            expect(result.success).toBe(true);
            expect(result.data!.endpoint).toBe('https://mesh-endpoint.adobe.io/graphql');
        });

        it('should write updated mesh.json file', async () => {
            await meshDeployer.update(mockProject);

            expect(fs.writeFile).toHaveBeenCalledWith(
                '/test/project/mesh.json',
                expect.any(String)
            );
        });

        it('should execute aio api-mesh:update command', async () => {
            await meshDeployer.update(mockProject);

            expect(mockCommandExecutor.executeAdobeCLI).toHaveBeenCalledWith(
                'aio api-mesh:update mesh.json',
                expect.objectContaining({
                    cwd: '/test/project'
                })
            );
        });

        it('should extract endpoint from update output', async () => {
            (mockCommandExecutor.executeAdobeCLI as jest.Mock).mockResolvedValue({
                stdout: 'Mesh updated\nhttps://updated-mesh.adobe.io/graphql',
                stderr: '',
                code: 0,
                duration: 1000
            });

            const result = await meshDeployer.update(mockProject);

            expect(result.data!.endpoint).toBe('https://updated-mesh.adobe.io/graphql');
        });

        it('should handle update without endpoint', async () => {
            (mockCommandExecutor.executeAdobeCLI as jest.Mock).mockResolvedValue({
                stdout: 'Update complete',
                stderr: '',
                code: 0,
                duration: 1000
            });

            const result = await meshDeployer.update(mockProject);

            expect(result.success).toBe(false);
            expect(result.data?.endpoint).toBeUndefined();
        });

        it('should handle update failure', async () => {
            (mockCommandExecutor.executeAdobeCLI as jest.Mock).mockRejectedValue(
                new Error('Update failed')
            );

            const result = await meshDeployer.update(mockProject);

            expect(result.success).toBe(false);
            expect(mockLogger.error).toHaveBeenCalledWith(
                'Mesh update failed',
                expect.any(Error)
            );
        });

        it('should log update success', async () => {
            await meshDeployer.update(mockProject);

            expect(mockLogger.info).toHaveBeenCalledWith(
                expect.stringContaining('Mesh updated successfully')
            );
        });
    });

    describe('delete', () => {
        const { validateMeshId } = require('../../src/core/validation/securityValidation');

        it('should delete mesh successfully', async () => {
            (mockCommandExecutor.executeAdobeCLI as jest.Mock).mockResolvedValue({
                stdout: 'Mesh deleted',
                stderr: '',
                code: 0,
                duration: 500
            });

            const result = await meshDeployer.delete('mesh-123');

            expect(result).toBe(true);
            expect(mockLogger.info).toHaveBeenCalledWith('Mesh mesh-123 deleted');
        });

        it('should validate mesh ID before deletion', async () => {
            await meshDeployer.delete('mesh-123');

            expect(validateMeshId).toHaveBeenCalledWith('mesh-123');
        });

        it('should execute aio api-mesh:delete command', async () => {
            await meshDeployer.delete('mesh-123');

            expect(mockCommandExecutor.executeAdobeCLI).toHaveBeenCalledWith(
                'aio api-mesh:delete mesh-123'
            );
        });

        it('should handle deletion failure', async () => {
            (mockCommandExecutor.executeAdobeCLI as jest.Mock).mockRejectedValue(
                new Error('Deletion failed')
            );

            const result = await meshDeployer.delete('mesh-123');

            expect(result).toBe(false);
            expect(mockLogger.error).toHaveBeenCalledWith(
                'Mesh deletion failed',
                expect.any(Error)
            );
        });

        it('should prevent command injection via mesh ID', async () => {
            (validateMeshId as jest.Mock).mockImplementationOnce((id: string) => {
                if (id.includes(';') || id.includes('&')) {
                    throw new Error('Invalid mesh ID');
                }
            });

            const result = await meshDeployer.delete('mesh-123; rm -rf /');

            expect(result).toBe(false);
            expect(mockCommandExecutor.executeAdobeCLI).not.toHaveBeenCalled();
        });

        it('should handle empty mesh ID', async () => {
            (validateMeshId as jest.Mock).mockImplementationOnce((id: string) => {
                if (!id || id.trim() === '') {
                    throw new Error('Mesh ID is required');
                }
            });

            const result = await meshDeployer.delete('');

            expect(result).toBe(false);
        });

        it('should handle mesh ID with special characters', async () => {
            (validateMeshId as jest.Mock).mockImplementationOnce((id: string) => {
                if (!/^[a-zA-Z0-9-_]+$/.test(id)) {
                    throw new Error('Invalid mesh ID format');
                }
            });

            const result = await meshDeployer.delete('mesh@123');

            expect(result).toBe(false);
        });
    });

    describe('error handling and edge cases', () => {
        it('should handle missing Commerce instance URL', () => {
            mockProject.commerce!.instance.url = '';

            const config = (meshDeployer as any).generateMeshConfig(mockProject);

            expect(config.meshConfig.sources[0].handler.graphql.endpoint).toBe('/graphql');
        });

        it('should handle null commerce config', () => {
            const projectWithoutCommerce: Project = {
                name: 'test-project',
                path: '/test/project',
                status: 'ready',
                created: new Date(),
                lastModified: new Date(),
                commerce: null as any
            };

            const config = (meshDeployer as any).generateMeshConfig(projectWithoutCommerce);

            expect(config.meshConfig.sources).toHaveLength(0);
        });

        it('should handle service config without endpoint', () => {
            mockProject.commerce!.services.catalog = {
                enabled: true,
                endpoint: ''
            };

            const config = (meshDeployer as any).generateMeshConfig(mockProject);

            const catalogSource = config.meshConfig.sources.find(
                (s: any) => s.name === 'catalog'
            );
            expect(catalogSource?.handler.graphql.endpoint).toBe('');
        });

        it('should handle command execution timeout', async () => {
            (mockCommandExecutor.executeAdobeCLI as jest.Mock).mockRejectedValue(
                new Error('Command timed out after 120000ms')
            );

            const result = await meshDeployer.deploy(mockProject);

            expect(result.success).toBe(false);
            expect(mockLogger.error).toHaveBeenCalled();
        });

        it('should handle network errors', async () => {
            (mockCommandExecutor.executeAdobeCLI as jest.Mock).mockRejectedValue(
                new Error('ENOTFOUND: DNS lookup failed')
            );

            const result = await meshDeployer.deploy(mockProject);

            expect(result.success).toBe(false);
        });

        it('should handle Adobe CLI not authenticated', async () => {
            (mockCommandExecutor.executeAdobeCLI as jest.Mock).mockRejectedValue(
                new Error('Not authenticated. Please run: aio auth login')
            );

            const result = await meshDeployer.deploy(mockProject);

            expect(result.success).toBe(false);
        });

        it('should handle invalid mesh configuration', async () => {
            (mockCommandExecutor.executeAdobeCLI as jest.Mock).mockResolvedValue({
                stdout: '',
                stderr: 'Invalid configuration: missing required field "sources"',
                code: 1,
                duration: 100
            });

            const result = await meshDeployer.deploy(mockProject);

            expect(result.success).toBe(false);
        });

        it('should handle workspace not found', async () => {
            (mockCommandExecutor.executeAdobeCLI as jest.Mock).mockRejectedValue(
                new Error('Workspace not found')
            );

            const result = await meshDeployer.deploy(mockProject);

            expect(result.success).toBe(false);
        });
    });

    describe('mesh configuration details', () => {
        it('should format mesh config with proper indentation', async () => {
            await meshDeployer.deploy(mockProject);

            const writeCall = (fs.writeFile as jest.Mock).mock.calls[0];
            const meshConfigJson = writeCall[1] as string;

            // Verify JSON is properly formatted (has newlines and indentation)
            expect(meshConfigJson).toContain('\n');
            expect(meshConfigJson).toContain('  '); // 2-space indentation
        });

        it('should include operationHeaders with context variable syntax', () => {
            mockProject.commerce!.services.catalog = {
                enabled: true,
                endpoint: 'https://catalog-service.adobe.io/graphql',
                apiKey: 'key'
            };

            const config = (meshDeployer as any).generateMeshConfig(mockProject);
            const catalogSource = config.meshConfig.sources.find(
                (s: any) => s.name === 'catalog'
            );

            expect(catalogSource.handler.graphql.operationHeaders).toEqual({
                'x-api-key': '{context.headers[\'x-api-key\']}'
            });
        });

        it('should maintain source order: magento, catalog, search', () => {
            mockProject.commerce!.services.catalog = {
                enabled: true,
                endpoint: 'https://catalog.adobe.io/graphql'
            };
            mockProject.commerce!.services.liveSearch = {
                enabled: true,
                endpoint: 'https://search.adobe.io/graphql'
            };

            const config = (meshDeployer as any).generateMeshConfig(mockProject);
            const sourceNames = config.meshConfig.sources.map((s: any) => s.name);

            expect(sourceNames).toEqual(['magento', 'catalog', 'search']);
        });

        it('should handle multiple GraphQL endpoints correctly', () => {
            mockProject.commerce!.services.catalog = {
                enabled: true,
                endpoint: 'https://catalog.adobe.io/graphql',
                apiKey: 'catalog-key'
            };
            mockProject.commerce!.services.liveSearch = {
                enabled: true,
                endpoint: 'https://search.adobe.io/graphql',
                apiKey: 'search-key'
            };

            const config = (meshDeployer as any).generateMeshConfig(mockProject);

            // Verify all sources have graphql handler
            config.meshConfig.sources.forEach((source: any) => {
                expect(source.handler).toHaveProperty('graphql');
                expect(source.handler.graphql).toHaveProperty('endpoint');
            });
        });
    });

    describe('Adobe CLI integration', () => {
        it('should use correct working directory for commands', async () => {
            await meshDeployer.deploy(mockProject);

            expect(mockCommandExecutor.executeAdobeCLI).toHaveBeenCalledWith(
                expect.any(String),
                expect.objectContaining({
                    cwd: '/test/project'
                })
            );
        });

        it('should handle relative paths in mesh.json reference', async () => {
            await meshDeployer.deploy(mockProject);

            // Command should reference mesh.json relatively
            expect(mockCommandExecutor.executeAdobeCLI).toHaveBeenCalledWith(
                'aio api-mesh:create mesh.json',
                expect.any(Object)
            );
        });

        it('should properly format mesh.json path', async () => {
            await meshDeployer.deploy(mockProject);

            const meshJsonPath = (fs.writeFile as jest.Mock).mock.calls[0][0];
            expect(meshJsonPath).toBe('/test/project/mesh.json');
        });
    });

    describe('concurrent operations', () => {
        it('should handle concurrent deploy calls', async () => {
            const deploy1 = meshDeployer.deploy(mockProject);
            const deploy2 = meshDeployer.deploy(mockProject);

            const results = await Promise.all([deploy1, deploy2]);

            expect(results[0].success).toBe(true);
            expect(results[1].success).toBe(true);
        });

        it('should handle concurrent update calls', async () => {
            const update1 = meshDeployer.update(mockProject);
            const update2 = meshDeployer.update(mockProject);

            const results = await Promise.all([update1, update2]);

            expect(results[0].success).toBe(true);
            expect(results[1].success).toBe(true);
        });

        it('should handle mixed deploy and update calls', async () => {
            const deploy = meshDeployer.deploy(mockProject);
            const update = meshDeployer.update(mockProject);

            const results = await Promise.all([deploy, update]);

            expect(results[0].success).toBe(true);
            expect(results[1].success).toBe(true);
        });
    });
});
