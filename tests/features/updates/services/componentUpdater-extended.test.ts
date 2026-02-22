/**
 * ComponentUpdater Tests - Extended Coverage
 *
 * Tests for extended coverage:
 * - .env file preservation
 * - Version tracking
 * - formatUpdateError error formatting
 * - Verification edge cases
 * - parseEnvFile edge cases
 */

import { ComponentUpdater } from '@/features/updates/services/componentUpdater';
import { Logger } from '@/core/logging';
import type { Project } from '@/types';

// Mock dependencies
jest.mock('@/core/logging');
jest.mock('@/core/di');
jest.mock('@/core/validation');
jest.mock('fs/promises');
jest.mock('vscode', () => ({
    commands: {
        executeCommand: jest.fn()
    }
}), { virtual: true });
jest.mock('@/features/components/services/ComponentRegistryManager', () => ({
    ComponentRegistryManager: jest.fn().mockImplementation(() => ({
        getComponentById: jest.fn().mockResolvedValue({
            id: 'test-component',
            name: 'Test Component',
            configuration: {
                // No buildScript means build step will be skipped
            }
        })
    }))
}));

import * as fs from 'fs/promises';
import * as vscode from 'vscode';
import { ServiceLocator } from '@/core/di';

describe('ComponentUpdater - Extended Coverage', () => {
    let updater: ComponentUpdater;
    let mockLogger: jest.Mocked<Logger>;
    let mockProject: Project;
    let mockExecutor: Record<string, jest.Mock>;

    beforeEach(() => {
        jest.clearAllMocks();

        mockLogger = {
            info: jest.fn(),
            debug: jest.fn(),
            warn: jest.fn(),
            error: jest.fn(),
        } as unknown as jest.Mocked<Logger>;

        mockExecutor = {
            execute: jest.fn().mockResolvedValue({
                stdout: '',
                stderr: '',
                code: 0,
                duration: 100
            })
        };

        (ServiceLocator.getCommandExecutor as jest.Mock) = jest.fn().mockReturnValue(mockExecutor);

        const securityValidation = require('@/core/validation');
        securityValidation.validateGitHubDownloadURL = jest.fn();

        jest.spyOn(fs, 'cp').mockResolvedValue(undefined);
        jest.spyOn(fs, 'rm').mockResolvedValue(undefined);
        jest.spyOn(fs, 'mkdir').mockResolvedValue(undefined);
        jest.spyOn(fs, 'readFile').mockResolvedValue('{"name": "test"}');
        jest.spyOn(fs, 'writeFile').mockResolvedValue(undefined);
        jest.spyOn(fs, 'access').mockResolvedValue(undefined);
        jest.spyOn(fs, 'unlink').mockResolvedValue(undefined);
        jest.spyOn(fs, 'rename').mockResolvedValue(undefined);

        (vscode.commands.executeCommand as jest.Mock).mockResolvedValue(undefined);

        global.fetch = jest.fn().mockResolvedValue({
            ok: true,
            arrayBuffer: jest.fn().mockResolvedValue(new ArrayBuffer(1024))
        }) as unknown as typeof fetch;

        updater = new ComponentUpdater(mockLogger, '/mock/extension/path');

        mockProject = {
            path: '/path/to/project',
            name: 'test-project',
            componentInstances: {
                'test-component': {
                    id: 'test-component',
                    path: '/path/to/project/components/test-component',
                    port: 3000
                }
            },
            componentVersions: {}
        } as unknown as Project;
    });

    describe('.env file preservation', () => {
        it('should backup .env files before removing component', async () => {
            const downloadUrl = 'https://github.com/test/repo/archive/v1.0.0.zip';
            const newVersion = '1.0.0';

            // Reset mock to track calls properly
            (fs.readFile as jest.Mock).mockReset();
            (fs.readFile as jest.Mock)
                .mockResolvedValueOnce('OLD_VAR=old_value')  // .env
                .mockResolvedValueOnce('LOCAL_VAR=local')   // .env.local
                .mockResolvedValue('{"name": "test"}');     // package.json

            await updater.updateComponent(mockProject, 'test-component', downloadUrl, newVersion);

            // Verify .env was read (first calls should be for .env files)
            expect(fs.readFile).toHaveBeenCalledWith(
                expect.stringContaining('.env'),
                'utf-8'
            );
        });

        it('should restore .env unchanged when no .env.example exists', async () => {
            const downloadUrl = 'https://github.com/test/repo/archive/v1.0.0.zip';
            const newVersion = '1.0.0';
            const oldEnvContent = 'USER_VAR=user_value\nANOTHER=test';

            // Mock: .env exists, .env.example does not
            (fs.readFile as jest.Mock).mockReset();
            (fs.readFile as jest.Mock).mockImplementation(async (filePath: string) => {
                if (filePath.includes('.env.example')) {
                    throw new Error('ENOENT');
                }
                if (filePath.endsWith('.env')) {
                    return oldEnvContent;
                }
                if (filePath.includes('.env.local')) {
                    throw new Error('ENOENT'); // .env.local doesn't exist
                }
                return '{"name": "test"}';
            });

            await updater.updateComponent(mockProject, 'test-component', downloadUrl, newVersion);

            // Old content should be written back
            expect(fs.writeFile).toHaveBeenCalledWith(
                expect.stringMatching(/\.env$/),
                oldEnvContent,
                'utf-8'
            );
        });

        it('should merge .env preserving user values and adding new defaults', async () => {
            const downloadUrl = 'https://github.com/test/repo/archive/v1.0.0.zip';
            const newVersion = '1.0.0';

            // Old .env has USER_VAR, new template has USER_VAR and NEW_VAR
            (fs.readFile as jest.Mock).mockReset();
            (fs.readFile as jest.Mock).mockImplementation(async (filePath: string) => {
                if (filePath.endsWith('.env.example')) {
                    return 'USER_VAR=default\nNEW_VAR=new_default';
                }
                if (filePath.endsWith('.env')) {
                    return 'USER_VAR=user_value';
                }
                if (filePath.includes('.env.local')) {
                    throw new Error('ENOENT');
                }
                return '{"name": "test"}';
            });

            await updater.updateComponent(mockProject, 'test-component', downloadUrl, newVersion);

            // Find the writeFile call for .env
            const writeFileCalls = (fs.writeFile as jest.Mock).mock.calls;
            const envWriteCall = writeFileCalls.find(
                (call: unknown[]) => typeof call[0] === 'string' && (call[0] as string).endsWith('.env')
            );

            expect(envWriteCall).toBeDefined();
            const mergedContent = envWriteCall![1] as string;
            // User value should be preserved
            expect(mergedContent).toContain('USER_VAR=user_value');
            // New key should be added from template
            expect(mergedContent).toContain('NEW_VAR=new_default');
        });

        it('should register programmatic writes before .env operations', async () => {
            const downloadUrl = 'https://github.com/test/repo/archive/v1.0.0.zip';
            const newVersion = '1.0.0';

            (fs.readFile as jest.Mock).mockReset();
            (fs.readFile as jest.Mock).mockImplementation(async (filePath: string) => {
                if (filePath.endsWith('.env')) {
                    return 'VAR=value';
                }
                if (filePath.includes('.env.local') || filePath.includes('.env.example')) {
                    throw new Error('ENOENT');
                }
                return '{"name": "test"}';
            });

            await updater.updateComponent(mockProject, 'test-component', downloadUrl, newVersion);

            expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
                'demoBuilder._internal.registerProgrammaticWrites',
                expect.any(Array)
            );
        });
    });

    describe('Version tracking', () => {
        it('should update version after successful verification', async () => {
            const downloadUrl = 'https://github.com/test/repo/archive/v1.0.0.zip';
            const newVersion = '1.0.0';

            await updater.updateComponent(mockProject, 'test-component', downloadUrl, newVersion);

            expect(mockProject.componentVersions).toBeDefined();
            expect(mockProject.componentVersions['test-component']).toEqual({
                version: '1.0.0',
                lastUpdated: expect.any(String)
            });
        });

        it('should NOT update version when verification fails', async () => {
            const downloadUrl = 'https://github.com/test/repo/archive/v1.0.0.zip';
            const newVersion = '1.0.0';

            // Make verification fail by having package.json access fail
            (fs.access as jest.Mock).mockRejectedValueOnce(new Error('ENOENT'));

            await expect(
                updater.updateComponent(mockProject, 'test-component', downloadUrl, newVersion)
            ).rejects.toThrow();

            // Version should not be set
            expect(mockProject.componentVersions['test-component']).toBeUndefined();
        });
    });

    describe('formatUpdateError error formatting (tested via failed updates)', () => {
        it('should detect network error and format with helpful message', async () => {
            const downloadUrl = 'https://github.com/test/repo/archive/v1.0.0.zip';
            const newVersion = '1.0.0';

            (global.fetch as jest.Mock).mockRejectedValueOnce(new Error('fetch failed'));

            await expect(
                updater.updateComponent(mockProject, 'test-component', downloadUrl, newVersion)
            ).rejects.toThrow();

            expect(mockLogger.error).toHaveBeenCalledWith(
                '[Updates] Update failed, rolling back to snapshot',
                expect.any(Error)
            );

            expect(mockLogger.error).toHaveBeenCalledWith(
                '[Updates] CRITICAL: Rollback failed',
                expect.objectContaining({
                    message: expect.stringContaining('internet connection')
                })
            );
        });

        it('should detect timeout error and format with helpful message', async () => {
            const downloadUrl = 'https://github.com/test/repo/archive/v1.0.0.zip';
            const newVersion = '1.0.0';

            (global.fetch as jest.Mock).mockRejectedValueOnce(new Error('operation timed out'));

            await expect(
                updater.updateComponent(mockProject, 'test-component', downloadUrl, newVersion)
            ).rejects.toThrow();

            expect(mockLogger.error).toHaveBeenCalledWith(
                '[Updates] CRITICAL: Rollback failed',
                expect.objectContaining({
                    message: expect.stringContaining('timed out')
                })
            );
        });

        it('should detect HTTP 404 error and format with version removed message', async () => {
            const downloadUrl = 'https://github.com/test/repo/archive/v1.0.0.zip';
            const newVersion = '1.0.0';

            (global.fetch as jest.Mock).mockResolvedValueOnce({
                ok: false,
                status: 404
            });

            await expect(
                updater.updateComponent(mockProject, 'test-component', downloadUrl, newVersion)
            ).rejects.toThrow();

            expect(mockLogger.error).toHaveBeenCalledWith(
                '[Updates] CRITICAL: Rollback failed',
                expect.objectContaining({
                    message: expect.stringContaining('not found')
                })
            );
        });

        it('should detect HTTP 403 error and format with rate limit message', async () => {
            const downloadUrl = 'https://github.com/test/repo/archive/v1.0.0.zip';
            const newVersion = '1.0.0';

            (global.fetch as jest.Mock).mockResolvedValueOnce({
                ok: false,
                status: 403
            });

            await expect(
                updater.updateComponent(mockProject, 'test-component', downloadUrl, newVersion)
            ).rejects.toThrow();

            expect(mockLogger.error).toHaveBeenCalledWith(
                '[Updates] CRITICAL: Rollback failed',
                expect.objectContaining({
                    message: expect.stringMatching(/rate limit|access denied/i)
                })
            );
        });

        it('should detect generic HTTP error and format with server error message', async () => {
            const downloadUrl = 'https://github.com/test/repo/archive/v1.0.0.zip';
            const newVersion = '1.0.0';

            (global.fetch as jest.Mock).mockResolvedValueOnce({
                ok: false,
                status: 500
            });

            await expect(
                updater.updateComponent(mockProject, 'test-component', downloadUrl, newVersion)
            ).rejects.toThrow();

            expect(mockLogger.error).toHaveBeenCalledWith(
                '[Updates] CRITICAL: Rollback failed',
                expect.objectContaining({
                    message: expect.stringMatching(/server error/i)
                })
            );
        });
    });

    describe('Verification edge cases', () => {
        it('should verify package.json exists after extraction', async () => {
            const downloadUrl = 'https://github.com/test/repo/archive/v1.0.0.zip';
            const newVersion = '1.0.0';

            await updater.updateComponent(mockProject, 'test-component', downloadUrl, newVersion);

            expect(fs.access).toHaveBeenCalledWith(
                expect.stringContaining('package.json')
            );
        });

        it('should verify mesh.json exists for commerce-mesh component', async () => {
            const downloadUrl = 'https://github.com/test/repo/archive/v1.0.0.zip';
            const newVersion = '1.0.0';

            const { ComponentRegistryManager } = require('@/features/components/services/ComponentRegistryManager');
            ComponentRegistryManager.mockImplementation(() => ({
                getComponentById: jest.fn().mockResolvedValue({
                    id: 'eds-commerce-mesh',
                    name: 'Commerce Mesh',
                    configuration: {}
                })
            }));

            const meshProject = {
                ...mockProject,
                componentInstances: {
                    'eds-commerce-mesh': {
                        id: 'eds-commerce-mesh',
                        path: '/path/to/project/components/commerce-mesh',
                        port: 3000
                    }
                }
            } as unknown as Project;

            const meshUpdater = new ComponentUpdater(mockLogger, '/mock/extension/path');

            await meshUpdater.updateComponent(meshProject, 'eds-commerce-mesh', downloadUrl, newVersion);

            expect(fs.access).toHaveBeenCalledWith(
                expect.stringContaining('mesh.json')
            );
        });

        it('should throw when component not found in project', async () => {
            await expect(
                updater.updateComponent(
                    mockProject,
                    'non-existent-component',
                    'https://github.com/test/repo/archive/v1.0.0.zip',
                    '1.0.0'
                )
            ).rejects.toThrow('Component non-existent-component not found');
        });

        it('should throw critical error when rollback fails', async () => {
            const downloadUrl = 'https://github.com/test/repo/archive/v1.0.0.zip';
            const newVersion = '1.0.0';

            // Make extraction fail
            mockExecutor.execute.mockRejectedValueOnce(new Error('Extraction failed'));

            // Make rollback also fail by having both rm and rename fail
            (fs.rm as jest.Mock).mockRejectedValueOnce(new Error('Permission denied'));
            (fs.rename as jest.Mock).mockRejectedValueOnce(new Error('Cannot rename'));

            await expect(
                updater.updateComponent(mockProject, 'test-component', downloadUrl, newVersion)
            ).rejects.toThrow(/Manual recovery required/);
        });

        it('should validate package.json is valid JSON', async () => {
            const downloadUrl = 'https://github.com/test/repo/archive/v1.0.0.zip';
            const newVersion = '1.0.0';

            (fs.access as jest.Mock).mockResolvedValue(undefined);

            (fs.readFile as jest.Mock).mockReset();
            (fs.readFile as jest.Mock).mockImplementation(async (filePath: string) => {
                if (filePath.includes('package.json')) {
                    return 'not valid json {{{';
                }
                if (filePath.includes('.env')) {
                    throw new Error('ENOENT');
                }
                return '{"name": "test"}';
            });

            await expect(
                updater.updateComponent(mockProject, 'test-component', downloadUrl, newVersion)
            ).rejects.toThrow();

            expect(mockLogger.error).toHaveBeenCalledWith(
                '[Updates] Update failed, rolling back to snapshot',
                expect.objectContaining({
                    message: expect.stringContaining('package.json is invalid')
                })
            );

            expect(mockLogger.error).toHaveBeenCalledWith(
                '[Updates] CRITICAL: Rollback failed',
                expect.objectContaining({
                    message: expect.stringContaining('incomplete or corrupted')
                })
            );
        });
    });

    describe('parseEnvFile edge cases (tested via .env merge)', () => {
        it('should skip comments and empty lines when parsing .env', async () => {
            const downloadUrl = 'https://github.com/test/repo/archive/v1.0.0.zip';
            const newVersion = '1.0.0';

            const envWithComments = '# This is a comment\nVAR1=value1\n\n# Another comment\nVAR2=value2';

            (fs.readFile as jest.Mock).mockReset();
            (fs.readFile as jest.Mock).mockImplementation(async (filePath: string) => {
                if (filePath.endsWith('.env.example')) {
                    return 'VAR1=default1\nVAR2=default2';
                }
                if (filePath.endsWith('.env')) {
                    return envWithComments;
                }
                if (filePath.includes('.env.local')) {
                    throw new Error('ENOENT');
                }
                return '{"name": "test"}';
            });

            await updater.updateComponent(mockProject, 'test-component', downloadUrl, newVersion);

            const writeFileCalls = (fs.writeFile as jest.Mock).mock.calls;
            const envWriteCall = writeFileCalls.find(
                (call: unknown[]) => typeof call[0] === 'string' && (call[0] as string).endsWith('.env')
            );

            expect(envWriteCall).toBeDefined();
            const mergedContent = envWriteCall![1] as string;
            expect(mergedContent).toContain('VAR1=value1');
            expect(mergedContent).toContain('VAR2=value2');
            expect(mergedContent).not.toContain('#');
        });

        it('should preserve values containing equals signs', async () => {
            const downloadUrl = 'https://github.com/test/repo/archive/v1.0.0.zip';
            const newVersion = '1.0.0';

            const envWithEquals = 'API_URL=https://example.com?param=value&other=123';

            (fs.readFile as jest.Mock).mockReset();
            (fs.readFile as jest.Mock).mockImplementation(async (filePath: string) => {
                if (filePath.endsWith('.env.example')) {
                    return 'API_URL=http://default.com';
                }
                if (filePath.endsWith('.env')) {
                    return envWithEquals;
                }
                if (filePath.includes('.env.local')) {
                    throw new Error('ENOENT');
                }
                return '{"name": "test"}';
            });

            await updater.updateComponent(mockProject, 'test-component', downloadUrl, newVersion);

            const writeFileCalls = (fs.writeFile as jest.Mock).mock.calls;
            const envWriteCall = writeFileCalls.find(
                (call: unknown[]) => typeof call[0] === 'string' && (call[0] as string).endsWith('.env')
            );

            expect(envWriteCall).toBeDefined();
            const mergedContent = envWriteCall![1] as string;
            expect(mergedContent).toContain('API_URL=https://example.com?param=value&other=123');
        });
    });
});
