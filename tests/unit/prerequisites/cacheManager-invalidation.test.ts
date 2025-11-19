/**
 * Unit Tests for PrerequisitesCacheManager - Invalidation & TTL
 *
 * Tests cache invalidation, expiry, and TTL-based behavior.
 */

import { PrerequisitesCacheManager } from '@/features/prerequisites/services/prerequisitesCacheManager';
import {
    createMockPrerequisiteStatus,
    createNpmStatus,
    createAioCliStatus,
    wait,
} from './cacheManager.testUtils';

// Mock logger
jest.mock('@/core/logging/debugLogger', () => ({
    getLogger: () => ({
        debug: jest.fn(),
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
    }),
}));

describe('PrerequisitesCacheManager - Invalidation & TTL', () => {
    let cacheManager: PrerequisitesCacheManager;

    beforeEach(() => {
        jest.clearAllMocks();
        cacheManager = new PrerequisitesCacheManager();
    });

    describe('TTL Expiry', () => {
        describe('4. Cache expiry triggers re-check after TTL', () => {
            it('should return undefined after TTL expires', async () => {
                const mockResult = createMockPrerequisiteStatus();

                const shortTTL = 50; // 50ms
                cacheManager.setCachedResult('node', mockResult, shortTTL);

                // Should be cached immediately
                expect(cacheManager.getCachedResult('node')).toBeDefined();

                // Wait for TTL to expire
                await wait(100);

                // Should be expired now
                expect(cacheManager.getCachedResult('node')).toBeUndefined();
            });

            it('should handle expiry check without throwing', async () => {
                const mockResult = createMockPrerequisiteStatus();

                cacheManager.setCachedResult('node', mockResult, 50);
                await wait(100);

                expect(() => cacheManager.getCachedResult('node')).not.toThrow();
            });
        });
    });

    describe('Manual Invalidation', () => {
        describe('6. Cache invalidation on "Recheck" button click', () => {
            it('should clear specific prerequisite cache', () => {
                const mockResult = createMockPrerequisiteStatus();

                cacheManager.setCachedResult('node', mockResult);
                expect(cacheManager.getCachedResult('node')).toBeDefined();

                cacheManager.invalidate('node');
                expect(cacheManager.getCachedResult('node')).toBeUndefined();
            });

            it('should clear all caches with clearAll', () => {
                const nodeResult = createMockPrerequisiteStatus();
                const npmResult = createNpmStatus();

                cacheManager.setCachedResult('node', nodeResult);
                cacheManager.setCachedResult('npm', npmResult);

                cacheManager.clearAll();

                expect(cacheManager.getCachedResult('node')).toBeUndefined();
                expect(cacheManager.getCachedResult('npm')).toBeUndefined();
            });

            it('should invalidate all versions of perNodeVersion prerequisites', () => {
                const result18 = createAioCliStatus(true, '10.0.0');
                const result20 = createAioCliStatus(true, '10.0.0');

                cacheManager.setCachedResult('aio-cli', result18, undefined, '18');
                cacheManager.setCachedResult('aio-cli', result20, undefined, '20');

                cacheManager.invalidate('aio-cli');

                expect(cacheManager.getCachedResult('aio-cli', '18')).toBeUndefined();
                expect(cacheManager.getCachedResult('aio-cli', '20')).toBeUndefined();
            });
        });

        describe('7. Cache invalidation on prerequisite installation', () => {
            it('should invalidate cache after installation', () => {
                const beforeInstall = createMockPrerequisiteStatus({ installed: false });

                cacheManager.setCachedResult('node', beforeInstall);
                expect(cacheManager.getCachedResult('node')?.data.installed).toBe(false);

                // Simulate installation
                cacheManager.invalidate('node');

                expect(cacheManager.getCachedResult('node')).toBeUndefined();
            });
        });
    });
});
