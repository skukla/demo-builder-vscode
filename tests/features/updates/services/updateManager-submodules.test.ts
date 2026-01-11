/**
 * UpdateManager Test Suite - Submodule Updates
 *
 * Tests submodule update checking functionality:
 * - Checking updates for submodules within parent components
 * - Git commit retrieval from submodule paths
 * - Handling missing submodule paths
 * - Handling unmapped submodule repositories
 * - Update detection based on commit comparison
 *
 * Total tests: 8
 */

// Mock vscode
jest.mock('vscode', () => ({
    workspace: {
        getConfiguration: jest.fn(),
    },
}), { virtual: true });

// Mock Logger
jest.mock('@/core/logging', () => ({
    Logger: jest.fn().mockImplementation(() => ({
        debug: jest.fn(),
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
    })),
}));

// Mock timeoutConfig - uses semantic categories
jest.mock('@/core/utils/timeoutConfig', () => ({
    TIMEOUTS: {
        QUICK: 5000, // Fast operations (replaces UPDATE_CHECK, QUICK_SHELL)
    },
}));

// Mock security validation
jest.mock('@/core/validation', () => ({
    validateGitHubDownloadURL: jest.fn(),
    sanitizeErrorForLogging: jest.fn((msg: string) => msg),
}));

// Mock ComponentRepositoryResolver to avoid loading actual components.json
jest.mock('@/features/updates/services/componentRepositoryResolver', () => ({
    ComponentRepositoryResolver: jest.fn().mockImplementation(() => ({
        getRepositoryInfo: jest.fn((componentId: string) => {
            const knownComponents: Record<string, any> = {
                'demo-inspector': {
                    id: 'demo-inspector',
                    repository: 'skukla/demo-inspector',
                    name: 'Demo Inspector',
                },
                'commerce-mesh': {
                    id: 'commerce-mesh',
                    repository: 'skukla/headless-citisignal-mesh',
                    name: 'Commerce Mesh',
                },
            };
            return Promise.resolve(knownComponents[componentId] || null);
        }),
        getAllRepositories: jest.fn(() => Promise.resolve(new Map())),
        clearCache: jest.fn(),
    })),
}));

// Mock ServiceLocator
const mockExecute = jest.fn();
jest.mock('@/core/di', () => ({
    ServiceLocator: {
        getCommandExecutor: jest.fn(() => ({
            execute: mockExecute,
        })),
    },
}));

// Mock global fetch
global.fetch = jest.fn() as jest.Mock;

import { UpdateManager } from '@/features/updates/services/updateManager';
import type { SubmoduleConfig } from '@/types';
import * as vscode from 'vscode';
import {
    createMockContext,
    createMockLogger,
    createMockWorkspaceConfig,
    createMockRelease,
    mockSecurityValidationPass,
} from './updateManager.testUtils';

describe('UpdateManager - Submodule Updates', () => {
    let updateManager: UpdateManager;
    let mockContext: any;
    let mockLogger: any;

    beforeEach(() => {
        jest.clearAllMocks();

        mockContext = createMockContext('1.0.0');
        mockLogger = createMockLogger();

        // Setup workspace config
        (vscode.workspace.getConfiguration as jest.Mock).mockReturnValue(
            createMockWorkspaceConfig('stable')()
        );

        updateManager = new UpdateManager(mockContext, mockLogger);
    });

    describe('checkSubmoduleUpdates', () => {
        const parentPath = '/test/project/components/headless';
        const submodules: Record<string, SubmoduleConfig> = {
            'demo-inspector': {
                path: 'src/demo-inspector',
                repository: 'skukla/demo-inspector',
            },
        };

        it('should detect update available when commit differs from release', async () => {
            // Mock git rev-parse returning current commit
            mockExecute.mockResolvedValueOnce({
                code: 0,
                stdout: 'abc1234567890def',
                stderr: '',
            });

            // Mock GitHub release fetch
            const mockRelease = createMockRelease({
                version: '1.1.0',
                assetType: 'zipball',
            });
            (global.fetch as jest.Mock).mockResolvedValueOnce({
                ok: true,
                json: async () => mockRelease,
            });
            mockSecurityValidationPass();

            const results = await updateManager.checkSubmoduleUpdates(parentPath, submodules);

            expect(results.size).toBe(1);
            expect(results.get('demo-inspector')?.hasUpdate).toBe(true);
            expect(results.get('demo-inspector')?.current).toBe('abc12345');
            expect(results.get('demo-inspector')?.latest).toBe('1.1.0');
        });

        it('should report no update when commit matches release version', async () => {
            // Mock git rev-parse returning same as release version
            mockExecute.mockResolvedValueOnce({
                code: 0,
                stdout: '1.1.0', // Matches release version exactly
                stderr: '',
            });

            const mockRelease = createMockRelease({
                version: '1.1.0',
                assetType: 'zipball',
            });
            (global.fetch as jest.Mock).mockResolvedValueOnce({
                ok: true,
                json: async () => mockRelease,
            });
            mockSecurityValidationPass();

            const results = await updateManager.checkSubmoduleUpdates(parentPath, submodules);

            expect(results.get('demo-inspector')?.hasUpdate).toBe(false);
        });

        it('should handle git command failure gracefully', async () => {
            // Mock git rev-parse failing
            mockExecute.mockResolvedValueOnce({
                code: 1,
                stdout: '',
                stderr: 'fatal: not a git repository',
            });

            const mockRelease = createMockRelease({
                version: '1.1.0',
                assetType: 'zipball',
            });
            (global.fetch as jest.Mock).mockResolvedValueOnce({
                ok: true,
                json: async () => mockRelease,
            });
            mockSecurityValidationPass();

            const results = await updateManager.checkSubmoduleUpdates(parentPath, submodules);

            expect(results.get('demo-inspector')?.hasUpdate).toBe(true);
            expect(results.get('demo-inspector')?.current).toBe('unknown');
        });

        it('should skip submodules without repository mapping', async () => {
            const unmappedSubmodules: Record<string, SubmoduleConfig> = {
                'unknown-submodule': {
                    path: 'src/unknown',
                    repository: 'skukla/unknown-repo',
                },
            };

            const results = await updateManager.checkSubmoduleUpdates(parentPath, unmappedSubmodules);

            expect(results.size).toBe(0);
            expect(mockLogger.debug).toHaveBeenCalledWith(
                expect.stringContaining('no Git source in components.json')
            );
        });

        it('should handle GitHub API returning no release', async () => {
            mockExecute.mockResolvedValueOnce({
                code: 0,
                stdout: 'abc1234567890def',
                stderr: '',
            });

            // Mock 404 from GitHub
            (global.fetch as jest.Mock).mockResolvedValueOnce({
                ok: false,
                status: 404,
            });

            const results = await updateManager.checkSubmoduleUpdates(parentPath, submodules);

            expect(results.get('demo-inspector')?.hasUpdate).toBe(false);
            expect(results.get('demo-inspector')?.latest).toBe('unknown');
        });

        it('should check multiple submodules', async () => {
            const multipleSubmodules: Record<string, SubmoduleConfig> = {
                'demo-inspector': {
                    path: 'src/demo-inspector',
                    repository: 'skukla/demo-inspector',
                },
                'commerce-mesh': {
                    path: 'src/mesh',
                    repository: 'skukla/headless-citisignal-mesh',
                },
            };

            // Mock git commands for both submodules
            mockExecute
                .mockResolvedValueOnce({ code: 0, stdout: 'commit1abc', stderr: '' })
                .mockResolvedValueOnce({ code: 0, stdout: 'commit2def', stderr: '' });

            // Mock GitHub releases for both
            const mockRelease1 = createMockRelease({ version: '1.0.0', assetType: 'zipball' });
            const mockRelease2 = createMockRelease({ version: '2.0.0', assetType: 'zipball' });
            (global.fetch as jest.Mock)
                .mockResolvedValueOnce({ ok: true, json: async () => mockRelease1 })
                .mockResolvedValueOnce({ ok: true, json: async () => mockRelease2 });
            mockSecurityValidationPass();
            mockSecurityValidationPass();

            const results = await updateManager.checkSubmoduleUpdates(parentPath, multipleSubmodules);

            expect(results.size).toBe(2);
            expect(results.has('demo-inspector')).toBe(true);
            expect(results.has('commerce-mesh')).toBe(true);
        });

        it('should construct correct submodule path', async () => {
            mockExecute.mockResolvedValueOnce({
                code: 0,
                stdout: 'abc123',
                stderr: '',
            });

            (global.fetch as jest.Mock).mockResolvedValueOnce({
                ok: false,
                status: 404,
            });

            await updateManager.checkSubmoduleUpdates(parentPath, submodules);

            // Verify git command was called with correct path
            expect(mockExecute).toHaveBeenCalledWith(
                'git rev-parse HEAD',
                expect.objectContaining({
                    cwd: '/test/project/components/headless/src/demo-inspector',
                })
            );
        });

        it('should log debug messages during update check', async () => {
            mockExecute.mockResolvedValueOnce({
                code: 0,
                stdout: 'abc1234567890',
                stderr: '',
            });

            const mockRelease = createMockRelease({ version: '2.0.0', assetType: 'zipball' });
            (global.fetch as jest.Mock).mockResolvedValueOnce({
                ok: true,
                json: async () => mockRelease,
            });
            mockSecurityValidationPass();

            await updateManager.checkSubmoduleUpdates(parentPath, submodules);

            expect(mockLogger.debug).toHaveBeenCalledWith(
                expect.stringContaining('Checking submodule demo-inspector')
            );
            expect(mockLogger.debug).toHaveBeenCalledWith(
                expect.stringContaining('update available')
            );
        });
    });
});
