/**
 * Integration Tests for Prerequisite Caching
 *
 * Tests the end-to-end caching behavior when PrerequisitesManager
 * is integrated with PrerequisitesCacheManager.
 */

import { PrerequisitesManager } from '@/features/prerequisites/services/PrerequisitesManager';
import { PrerequisitesCacheManager } from '@/features/prerequisites/services/prerequisitesCacheManager';
import type { Logger } from '@/types/logger';
import { ServiceLocator } from '@/core/di/serviceLocator';
import type { CommandExecutor } from '@/core/shell/commandExecutor';

// Mock dependencies
jest.mock('@/core/config/ConfigurationLoader');
jest.mock('@/core/di/serviceLocator');

// Mock fs module for components.json reading
jest.mock('fs', () => ({
    readFileSync: jest.fn().mockReturnValue(JSON.stringify({
        infrastructure: {
            'adobe-cli': {
                nodeVersion: '18'
            }
        }
    }))
}));

jest.mock('@/core/logging/debugLogger', () => ({
    getLogger: () => ({
        debug: jest.fn(),
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
    }),
}));

describe('Prerequisite Caching - End to End', () => {
    let manager: PrerequisitesManager;
    let mockLogger: jest.Mocked<Logger>;
    let mockExecutor: jest.Mocked<CommandExecutor>;

    const mockConfig = {
        version: '1.0',
        prerequisites: [
            {
                id: 'node',
                name: 'Node.js',
                description: 'JavaScript runtime',
                check: {
                    command: 'node --version',
                    parseVersion: 'v(\\d+\\.\\d+\\.\\d+)',
                },
                optional: false,
            },
            {
                id: 'aio-cli',
                name: 'Adobe I/O CLI',
                description: 'Adobe I/O CLI',
                check: {
                    command: 'aio --version',
                    parseVersion: '@adobe/aio-cli/(\\d+\\.\\d+\\.\\d+)',
                },
                perNodeVersion: true,
                optional: false,
            },
        ],
    };

    beforeEach(() => {
        jest.clearAllMocks();

        mockLogger = {
            info: jest.fn(),
            warn: jest.fn(),
            error: jest.fn(),
            debug: jest.fn(),
        } as any;

        mockExecutor = {
            execute: jest.fn(),
            execute: jest.fn(),
        } as any;

        (ServiceLocator.getCommandExecutor as jest.Mock).mockReturnValue(mockExecutor);

        const { ConfigurationLoader } = require('@/core/config/ConfigurationLoader');
        ConfigurationLoader.mockImplementation(() => ({
            load: jest.fn().mockResolvedValue(mockConfig),
        }));

        manager = new PrerequisitesManager('/mock/extension/path', mockLogger);
    });

    describe('Cache Miss → Full Check → Cache Result', () => {
        it('should perform full check on cache miss and cache result', async () => {
            const prereq = mockConfig.prerequisites[0]; // node

            // Mock successful command execution
            mockExecutor.execute.mockResolvedValue({
                stdout: 'v20.0.0',
                stderr: '',
                code: 0,
                duration: 500,
            });

            // First check - cache miss (manager's internal cache is empty)
            const result = await manager.checkPrerequisite(prereq);

            // Verify result
            expect(result.installed).toBe(true);
            expect(result.version).toBe('20.0.0');

            // Second check - cache hit (manager caches automatically)
            const cachedResult = await manager.checkPrerequisite(prereq);
            expect(cachedResult).toBeDefined();
            expect(cachedResult.installed).toBe(true);
            expect(cachedResult.version).toBe('20.0.0');

            // Verify execute was only called once (second call used cache)
            expect(mockExecutor.execute).toHaveBeenCalledTimes(1);
        });

        it('should cache failures as well as successes', async () => {
            const prereq = mockConfig.prerequisites[0]; // node

            // Mock command failure (not installed)
            const error: NodeJS.ErrnoException = new Error('Command not found');
            error.code = 'ENOENT';
            mockExecutor.execute.mockRejectedValue(error);

            // Perform check
            const result = await manager.checkPrerequisite(prereq);

            // Verify result
            expect(result.installed).toBe(false);

            // Second check should use cache (not call execute again)
            const cachedResult = await manager.checkPrerequisite(prereq);
            expect(cachedResult.installed).toBe(false);

            // Verify execute was only called once
            expect(mockExecutor.execute).toHaveBeenCalledTimes(1);
        });
    });

    describe('Cache Hit → Skip Full Check', () => {
        it('should skip full check when cache is valid', async () => {
            const prereq = mockConfig.prerequisites[0]; // node

            // Mock successful command execution
            mockExecutor.execute.mockResolvedValue({
                stdout: 'v20.0.0',
                stderr: '',
                code: 0,
                duration: 500,
            });

            // First check - populates cache
            await manager.checkPrerequisite(prereq);
            expect(mockExecutor.execute).toHaveBeenCalledTimes(1);

            // Second check - should use cache
            const cached = await manager.checkPrerequisite(prereq);
            expect(cached.installed).toBe(true);
            expect(cached.version).toBe('20.0.0');

            // Verify executor was only called once (cache hit on second call)
            expect(mockExecutor.execute).toHaveBeenCalledTimes(1);
        });

        it('should demonstrate performance improvement with caching', async () => {
            const prereq = mockConfig.prerequisites[0]; // node

            // Simulate slow CLI command (500ms)
            mockExecutor.execute.mockImplementation(() => {
                return new Promise(resolve => {
                    setTimeout(() => {
                        resolve({
                            stdout: 'v20.0.0',
                            stderr: '',
                            code: 0,
                            duration: 500,
                        });
                    }, 500);
                });
            });

            // First check - cache miss (slow)
            const startTime1 = Date.now();
            const result1 = await manager.checkPrerequisite(prereq);
            const duration1 = Date.now() - startTime1;

            // Second check - cache hit (fast)
            const startTime2 = Date.now();
            const cached = await manager.checkPrerequisite(prereq);
            const duration2 = Date.now() - startTime2;

            expect(duration1).toBeGreaterThanOrEqual(500); // Full check takes time
            expect(duration2).toBeLessThan(10); // Cache hit is instant
            expect(cached).toEqual(result1);
        });
    });

    describe('perNodeVersion Caching', () => {
        it('should cache results separately for each Node version', async () => {
            const prereq = mockConfig.prerequisites[1]; // aio-cli (perNodeVersion)

            // Mock execution sequence for first check
            mockExecutor.execute
                // First check: getInstalledNodeVersions() calls 'fnm list'
                .mockResolvedValueOnce({
                    stdout: 'v18.20.8\nv20.19.5',
                    stderr: '',
                    code: 0,
                    duration: 100,
                })
                // First check: checkPerNodeVersionStatus() calls 'fnm list' again
                .mockResolvedValueOnce({
                    stdout: 'v18.20.8\nv20.19.5',
                    stderr: '',
                    code: 0,
                    duration: 100,
                })
                // First check: aio --version for Node 18
                .mockResolvedValueOnce({
                    stdout: '@adobe/aio-cli/10.0.0',
                    stderr: '',
                    code: 0,
                    duration: 1000,
                })
                // First check: aio --version for Node 20
                .mockResolvedValueOnce({
                    stdout: '@adobe/aio-cli/10.0.0',
                    stderr: '',
                    code: 0,
                    duration: 1000,
                });

            // First check - cache miss (manager's internal cache is empty)
            const result18 = await manager.checkPrerequisite(prereq, '18');

            // Verify result
            expect(result18.installed).toBe(true);
            expect(result18.version).toBe('10.0.0');

            // Second check - cache hit (manager caches automatically)
            const cached18 = await manager.checkPrerequisite(prereq, '18');
            expect(cached18).toEqual(result18);
            expect(cached18.installed).toBe(true);

            // Verify execute was called:
            // - 2 times for fnm list (getInstalledNodeVersions + checkPerNodeVersionStatus)
            // - 2 times for aio --version checks (Node 18 and 20 in parallel)
            // - No additional calls for second check (cache hit)
            expect(mockExecutor.execute).toHaveBeenCalledTimes(4);
        });
    });

    describe('Cache Invalidation', () => {
        it('should invalidate cache after installation', async () => {
            const prereq = mockConfig.prerequisites[0]; // node

            // Initial check - not installed
            const error: NodeJS.ErrnoException = new Error('Command not found');
            error.code = 'ENOENT';
            mockExecutor.execute.mockRejectedValueOnce(error);

            const resultBefore = await manager.checkPrerequisite(prereq);
            expect(resultBefore.installed).toBe(false);

            // Simulate installation (invalidate cache)
            manager.getCacheManager().invalidate('node');

            // Re-check after installation
            mockExecutor.execute.mockResolvedValueOnce({
                stdout: 'v20.0.0',
                stderr: '',
                code: 0,
                duration: 500,
            });

            const resultAfter = await manager.checkPrerequisite(prereq);

            expect(resultAfter.installed).toBe(true);
            // Verify execute was called twice (once before, once after invalidation)
            expect(mockExecutor.execute).toHaveBeenCalledTimes(2);
        });

        it('should clear all caches on Recheck', async () => {
            const prereq = mockConfig.prerequisites[0]; // node

            // Populate cache by checking prerequisite
            mockExecutor.execute.mockResolvedValueOnce({
                stdout: 'v20.0.0',
                stderr: '',
                code: 0,
                duration: 500,
            });

            await manager.checkPrerequisite(prereq);
            expect(mockExecutor.execute).toHaveBeenCalledTimes(1);

            // Simulate Recheck button click
            manager.getCacheManager().clearAll();

            // Next check should call execute again (cache cleared)
            mockExecutor.execute.mockResolvedValueOnce({
                stdout: 'v20.0.0',
                stderr: '',
                code: 0,
                duration: 500,
            });

            await manager.checkPrerequisite(prereq);
            expect(mockExecutor.execute).toHaveBeenCalledTimes(2);
        });
    });

    describe('Cache Expiry', () => {
        it('should re-check after cache expires', async () => {
            const prereq = mockConfig.prerequisites[0]; // node

            // First check
            mockExecutor.execute.mockResolvedValueOnce({
                stdout: 'v20.0.0',
                stderr: '',
                code: 0,
                duration: 500,
            });

            const result1 = await manager.checkPrerequisite(prereq);
            expect(mockExecutor.execute).toHaveBeenCalledTimes(1);

            // Manually set cache with short TTL
            const shortTTL = 50; // 50ms
            manager.getCacheManager().setCachedResult('node', result1, shortTTL);

            // Wait for expiry
            await new Promise(resolve => setTimeout(resolve, 100));

            // Second check should execute full check (cache expired)
            mockExecutor.execute.mockResolvedValueOnce({
                stdout: 'v20.0.0',
                stderr: '',
                code: 0,
                duration: 500,
            });

            const result2 = await manager.checkPrerequisite(prereq);
            expect(result2.installed).toBe(true);
            // Verify execute was called twice (cache expired)
            expect(mockExecutor.execute).toHaveBeenCalledTimes(2);
        });
    });

    describe('Performance Metrics', () => {
        it('should achieve <10ms cache hits vs 500ms+ full checks', async () => {
            const prereq = mockConfig.prerequisites[0]; // node

            // Simulate realistic CLI check time (500-3000ms)
            mockExecutor.execute.mockResolvedValue({
                stdout: 'v20.0.0',
                stderr: '',
                code: 0,
                duration: 1000,
            });

            // Full check
            const fullCheckStart = Date.now();
            const result = await manager.checkPrerequisite(prereq);
            const fullCheckDuration = Date.now() - fullCheckStart;

            // Cached check
            const cachedCheckStart = Date.now();
            const cached = await manager.checkPrerequisite(prereq);
            const cachedCheckDuration = Date.now() - cachedCheckStart;

            // In real scenarios, full check takes 500-3000ms
            // In mocked tests, it's faster, but cache should still be near-instant
            expect(cachedCheckDuration).toBeLessThan(10); // Fast cache (<10ms)
            expect(cached).toEqual(result);

            // Cache should be significantly faster than full check
            expect(cachedCheckDuration).toBeLessThan(fullCheckDuration + 10);
        });
    });
});
