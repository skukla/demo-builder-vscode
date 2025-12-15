/**
 * MeshDeployer Configuration Tests
 *
 * Tests for mesh configuration generation, including:
 * - Basic GraphQL endpoint configuration
 * - Catalog Service integration
 * - Live Search integration
 * - Service enablement/disablement
 * - Configuration formatting
 * - Multiple source handling
 *
 * Target Coverage: 75%+
 */

import { MeshDeployer } from '@/features/mesh/services/meshDeployer';
import { ServiceLocator } from '@/core/di/serviceLocator';
import {
    createMockProject,
    createTestLogger,
    createProjectWithoutCommerce,
    createProjectWithNullCommerce,
    createMockCommandExecutor
} from './testHelpers';

// Mock ServiceLocator
jest.mock('@/core/di/serviceLocator');

// Mock fs/promises
jest.mock('fs/promises');

// Mock securityValidation
jest.mock('@/core/validation', () => ({
    validateMeshId: jest.fn()
}));

// Type definitions for mesh config structure
interface MeshSource {
    name: string;
    handler: {
        graphql: {
            endpoint: string;
            operationHeaders?: Record<string, string>;
        };
    };
}

interface MeshConfig {
    meshConfig: {
        sources: MeshSource[];
    };
}

// Helper to access private method for testing
// Note: Using type assertion to access private method generateMeshConfig for unit testing
interface MeshDeployerWithPrivate {
    generateMeshConfig: (project: unknown) => MeshConfig;
}

describe('MeshDeployer - Configuration Generation', () => {
    let meshDeployer: MeshDeployerWithPrivate;

    beforeEach(() => {
        jest.clearAllMocks();

        const mockCommandExecutor = createMockCommandExecutor();
        (ServiceLocator.getCommandExecutor as jest.Mock).mockReturnValue(mockCommandExecutor);

        meshDeployer = new MeshDeployer(createTestLogger()) as unknown as MeshDeployerWithPrivate;
    });

    describe('generateMeshConfig', () => {
        it('should generate basic mesh config with Commerce GraphQL', () => {
            const mockProject = createMockProject();
            const config = meshDeployer.generateMeshConfig(mockProject);

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
            const mockProject = createMockProject();
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
            const mockProject = createMockProject();
            mockProject.commerce!.services.liveSearch = {
                enabled: true,
                endpoint: 'https://search-service.adobe.io/graphql',
                apiKey: 'search-key-123'
            };

            const config = meshDeployer.generateMeshConfig(mockProject);

            const searchSource = config.meshConfig.sources.find(
                (s) => s.name === 'search'
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
            const mockProject = createMockProject();
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

            const config = meshDeployer.generateMeshConfig(mockProject);

            expect(config.meshConfig.sources).toHaveLength(3);
            expect(config.meshConfig.sources.map((s) => s.name)).toEqual([
                'magento',
                'catalog',
                'search'
            ]);
        });

        it('should not include disabled services', () => {
            const mockProject = createMockProject();
            mockProject.commerce!.services.catalog = {
                enabled: false,
                endpoint: 'https://catalog-service.adobe.io/graphql'
            };

            const config = meshDeployer.generateMeshConfig(mockProject);

            const catalogSource = config.meshConfig.sources.find(
                (s) => s.name === 'catalog'
            );
            expect(catalogSource).toBeUndefined();
        });

        it('should handle project without commerce config', () => {
            const projectWithoutCommerce = createProjectWithoutCommerce();

            const config = meshDeployer.generateMeshConfig(projectWithoutCommerce);

            expect(config.meshConfig.sources).toHaveLength(0);
        });

        it('should handle missing Commerce instance URL', () => {
            const mockProject = createMockProject();
            mockProject.commerce!.instance.url = '';

            const config = meshDeployer.generateMeshConfig(mockProject);

            expect(config.meshConfig.sources[0].handler.graphql.endpoint).toBe('/graphql');
        });

        it('should handle null commerce config', () => {
            const projectWithNullCommerce = createProjectWithNullCommerce();

            const config = meshDeployer.generateMeshConfig(projectWithNullCommerce);

            expect(config.meshConfig.sources).toHaveLength(0);
        });

        it('should handle service config without endpoint', () => {
            const mockProject = createMockProject();
            mockProject.commerce!.services.catalog = {
                enabled: true,
                endpoint: ''
            };

            const config = meshDeployer.generateMeshConfig(mockProject);

            const catalogSource = config.meshConfig.sources.find(
                (s) => s.name === 'catalog'
            );
            expect(catalogSource?.handler.graphql.endpoint).toBe('');
        });
    });

    describe('mesh configuration details', () => {
        it('should include operationHeaders with context variable syntax', () => {
            const mockProject = createMockProject();
            mockProject.commerce!.services.catalog = {
                enabled: true,
                endpoint: 'https://catalog-service.adobe.io/graphql',
                apiKey: 'key'
            };

            const config = meshDeployer.generateMeshConfig(mockProject);
            const catalogSource = config.meshConfig.sources.find(
                (s) => s.name === 'catalog'
            );

            expect(catalogSource?.handler.graphql.operationHeaders).toEqual({
                'x-api-key': '{context.headers[\'x-api-key\']}'
            });
        });

        it('should maintain source order: magento, catalog, search', () => {
            const mockProject = createMockProject();
            mockProject.commerce!.services.catalog = {
                enabled: true,
                endpoint: 'https://catalog.adobe.io/graphql'
            };
            mockProject.commerce!.services.liveSearch = {
                enabled: true,
                endpoint: 'https://search.adobe.io/graphql'
            };

            const config = meshDeployer.generateMeshConfig(mockProject);
            const sourceNames = config.meshConfig.sources.map((s) => s.name);

            expect(sourceNames).toEqual(['magento', 'catalog', 'search']);
        });

        it('should handle multiple GraphQL endpoints correctly', () => {
            const mockProject = createMockProject();
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

            const config = meshDeployer.generateMeshConfig(mockProject);

            // Verify all sources have graphql handler
            config.meshConfig.sources.forEach((source) => {
                expect(source.handler).toHaveProperty('graphql');
                expect(source.handler.graphql).toHaveProperty('endpoint');
            });
        });
    });
});
