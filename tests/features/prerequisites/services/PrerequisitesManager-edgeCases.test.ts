/**
 * Tests for PrerequisitesManager - Edge Cases and Errors
 * Tests perNodeVersion detection consistency and edge cases
 */

// Mock debugLogger FIRST to prevent "Logger not initialized" errors
jest.mock('@/core/logging/debugLogger', () => ({
    getLogger: () => ({
        debug: jest.fn(),
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
    }),
}));

jest.mock('@/core/config/ConfigurationLoader');
jest.mock('@/core/di');

import { PrerequisitesManager } from '@/features/prerequisites/services/PrerequisitesManager';
import {
    setupMocks,
    setupConfigLoader,
    createPerNodePrerequisite,
    createStandardPrerequisite,
    type TestMocks,
} from './PrerequisitesManager.testUtils';

describe('PrerequisitesManager - Edge Cases and Errors', () => {
    let manager: PrerequisitesManager;
    let mocks: TestMocks;

    beforeEach(() => {
        mocks = setupMocks();
        setupConfigLoader();
        manager = new PrerequisitesManager('/mock/extension/path', mocks.logger);
    });

    describe('checkPrerequisite - perNodeVersion detection consistency (Step 2)', () => {
        // Mock the shared module's checkPerNodeVersionStatus function
        let checkPerNodeVersionStatusSpy: jest.SpyInstance;

        beforeEach(async () => {
            // Dynamic import and spy on checkPerNodeVersionStatus
            const shared = await import('@/features/prerequisites/handlers/shared');
            checkPerNodeVersionStatusSpy = jest.spyOn(shared, 'checkPerNodeVersionStatus');
        });

        afterEach(() => {
            checkPerNodeVersionStatusSpy?.mockRestore();
        });

        it('should detect installed per-node prerequisite using fnm-aware logic', async () => {
            // Given: Adobe CLI installed for Node 20 and 24 (via fnm)
            const aioCliPrereq = createPerNodePrerequisite();

            // Mock fnm list to show Node 20 and 24 installed
            mocks.executor.execute.mockImplementation(async (cmd: string) => {
                if (cmd === 'fnm list') {
                    return {
                        stdout: 'v20.19.5\nv24.0.10\n',
                        stderr: '',
                        code: 0,
                        duration: 100,
                    };
                }
                // Mock aio --version checks for each Node version
                if (cmd === 'aio --version') {
                    return {
                        stdout: '@adobe/aio-cli/10.0.0',
                        stderr: '',
                        code: 0,
                        duration: 100,
                    };
                }
                return { stdout: '', stderr: '', code: 1, duration: 100 };
            });

            // Mock checkPerNodeVersionStatus to return installed status
            checkPerNodeVersionStatusSpy.mockResolvedValue({
                perNodeVersionStatus: [
                    { version: 'Node 20', component: '10.0.0', installed: true },
                    { version: 'Node 24', component: '10.0.0', installed: true },
                ],
                perNodeVariantMissing: false,
                missingVariantMajors: [],
            });

            // When: Initial check called
            const result = await manager.checkPrerequisite(aioCliPrereq);

            // Then: Should detect as installed (not ENOENT)
            expect(result.installed).toBe(true);

            // And: Should return consolidated result with version details
            expect(result.version).toBe('10.0.0');

            // And: Should have called checkPerNodeVersionStatus
            expect(checkPerNodeVersionStatusSpy).toHaveBeenCalledWith(
                aioCliPrereq,
                expect.any(Array), // nodeVersions array
                expect.any(Object) // context-like object
            );
        });

        it('should use checkPerNodeVersionStatus for perNodeVersion prerequisites', async () => {
            // Given: Prerequisite with perNodeVersion: true
            const prereq = createPerNodePrerequisite();

            // Mock fnm list
            mocks.executor.execute.mockResolvedValue({
                stdout: 'v20.19.5\n',
                stderr: '',
                code: 0,
                duration: 100,
            });

            // Mock checkPerNodeVersionStatus
            checkPerNodeVersionStatusSpy.mockResolvedValue({
                perNodeVersionStatus: [
                    { version: 'Node 20', component: '10.0.0', installed: true },
                ],
                perNodeVariantMissing: false,
                missingVariantMajors: [],
            });

            // When: checkPrerequisite called
            await manager.checkPrerequisite(prereq);

            // Then: Should call checkPerNodeVersionStatus (fnm-aware)
            expect(checkPerNodeVersionStatusSpy).toHaveBeenCalled();

            // And: Should NOT directly call deprecated methods or plain execute
            // (This is implicitly tested - if we didn't call checkPerNodeVersionStatus,
            // the mock wouldn't have been invoked)
        });

        it('should use original logic for regular prerequisites (no perNodeVersion)', async () => {
            // Given: Prerequisite without perNodeVersion flag
            const gitPrereq = createStandardPrerequisite();

            // Mock git command
            mocks.executor.execute.mockResolvedValue({
                stdout: 'git version 2.39.0',
                stderr: '',
                code: 0,
                duration: 50,
            });

            // When: checkPrerequisite called
            const result = await manager.checkPrerequisite(gitPrereq);

            // Then: Should use original direct command logic
            expect(result.installed).toBe(true);
            expect(result.version).toBe('2.39.0');

            // And: Should NOT call checkPerNodeVersionStatus
            expect(checkPerNodeVersionStatusSpy).not.toHaveBeenCalled();

            // And: Should call execute directly
            expect(mocks.executor.execute).toHaveBeenCalledWith(
                'git --version',
                expect.objectContaining({ shell: expect.any(String) })
            );
        });

        it('should handle per-node prerequisite not installed for any Node version', async () => {
            // Given: Adobe CLI NOT installed for any Node version
            const aioCliPrereq = createPerNodePrerequisite();

            // Mock fnm list shows Node versions installed
            mocks.executor.execute.mockImplementation(async (cmd: string) => {
                if (cmd === 'fnm list') {
                    return {
                        stdout: 'v20.19.5\nv24.0.10\n',
                        stderr: '',
                        code: 0,
                        duration: 100,
                    };
                }
                // Mock aio command not found
                throw Object.assign(new Error('command not found'), { code: 'ENOENT' });
            });

            // Mock checkPerNodeVersionStatus to return not installed
            checkPerNodeVersionStatusSpy.mockResolvedValue({
                perNodeVersionStatus: [
                    { version: 'Node 20', component: '', installed: false },
                    { version: 'Node 24', component: '', installed: false },
                ],
                perNodeVariantMissing: true,
                missingVariantMajors: ['20', '24'],
            });

            // When: Initial check called
            const result = await manager.checkPrerequisite(aioCliPrereq);

            // Then: Should detect as not installed
            expect(result.installed).toBe(false);

            // And: Should have called checkPerNodeVersionStatus
            expect(checkPerNodeVersionStatusSpy).toHaveBeenCalled();
        });
    });
});
