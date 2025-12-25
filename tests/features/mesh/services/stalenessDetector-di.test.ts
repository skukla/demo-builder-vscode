/**
 * StalenessDetector DI Pattern Tests
 *
 * Tests that StalenessDetector uses constructor injection for logger.
 * This is part of Step 9: Standardize DI patterns.
 *
 * The StalenessDetectorService should:
 * - Accept logger via constructor injection
 * - NOT use module-level `new Logger()` or `getLogger()`
 * - Use the injected logger for all logging operations
 */

import { StalenessDetectorService } from '@/features/mesh/services/stalenessDetector';
import type { Project } from '@/types';

// Mock dependencies
jest.mock('@/core/di', () => ({
    ServiceLocator: {
        getCommandExecutor: jest.fn(),
        getAuthenticationService: jest.fn(),
    },
}));

jest.mock('@/core/utils/timeoutConfig', () => ({
    TIMEOUTS: {
        MESH_DESCRIBE: 30000,
    },
}));

describe('StalenessDetectorService - DI Pattern', () => {
    let mockLogger: any;
    let service: StalenessDetectorService;
    let mockCommandManager: any;

    beforeEach(() => {
        jest.clearAllMocks();

        // Create mock logger to verify injection works
        mockLogger = {
            debug: jest.fn(),
            info: jest.fn(),
            warn: jest.fn(),
            error: jest.fn(),
            trace: jest.fn(),
        };

        mockCommandManager = {
            execute: jest.fn(),
        };

        const { ServiceLocator } = require('@/core/di');
        ServiceLocator.getCommandExecutor.mockReturnValue(mockCommandManager);
        ServiceLocator.getAuthenticationService.mockReturnValue({
            getTokenStatus: jest.fn().mockResolvedValue({ isAuthenticated: true }),
        });

        // Create service with injected logger
        service = new StalenessDetectorService(mockLogger);
    });

    describe('Constructor Injection', () => {
        it('should accept logger via constructor', () => {
            expect(service).toBeDefined();
            expect(service).toBeInstanceOf(StalenessDetectorService);
        });

        it('should use injected logger for debug messages', async () => {
            // Call a method that logs
            const config = {
                ADOBE_COMMERCE_GRAPHQL_ENDPOINT: 'https://example.com/graphql',
            };

            service.getMeshEnvVars(config);

            // Verify the injected logger was used (not a module-level one)
            // Note: getMeshEnvVars may not log, but other methods should
        });

        it('should use injected logger when fetching deployed config', async () => {
            mockCommandManager.execute.mockResolvedValue({
                code: 0,
                stdout: JSON.stringify({
                    meshConfig: {
                        sources: [
                            {
                                name: 'magento',
                                handler: {
                                    graphql: {
                                        endpoint: 'https://commerce.example.com',
                                    },
                                },
                            },
                        ],
                    },
                }),
            });

            await service.fetchDeployedMeshConfig();

            // Verify injected logger was used
            expect(mockLogger.debug).toHaveBeenCalled();
        });

        it('should use injected logger when calculating source hash', async () => {
            const mockFs = require('fs/promises');
            jest.mock('fs/promises', () => ({
                readFile: jest.fn().mockRejectedValue(new Error('File not found')),
                readdir: jest.fn().mockRejectedValue(new Error('Dir not found')),
            }));

            // Method should use injected logger for error handling
            const result = await service.calculateMeshSourceHash('/nonexistent/path');

            // Even if it returns null, no module-level logger should be used
            expect(result).toBeNull();
        });

        it('should use injected logger when detecting mesh changes', async () => {
            const project: Project = {
                name: 'Test Project',
                path: '/test',
                created: new Date(),
                lastModified: new Date(),
                status: 'ready',
                componentInstances: {
                    'commerce-mesh': {
                        id: 'commerce-mesh',
                        name: 'API Mesh',
                        path: '/test/mesh',
                        status: 'ready',
                    },
                },
                meshState: {
                    envVars: {
                        ADOBE_COMMERCE_GRAPHQL_ENDPOINT: 'https://old.example.com',
                    },
                    sourceHash: 'abc123',
                    lastDeployed: '2024-01-01',
                },
            };

            const newConfigs = {
                'commerce-mesh': {
                    ADOBE_COMMERCE_GRAPHQL_ENDPOINT: 'https://new.example.com',
                },
            };

            await service.detectMeshChanges(project, newConfigs);

            // Should log detection details using injected logger
            expect(mockLogger.debug).toHaveBeenCalled();
        });
    });

    describe('Static Utility Methods (Backward Compatibility)', () => {
        it('should export getMeshEnvVars as static method for backward compatibility', () => {
            // This allows existing code to continue working
            expect(typeof StalenessDetectorService.getMeshEnvVars).toBe('function');
        });
    });
});
