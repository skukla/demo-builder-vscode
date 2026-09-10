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

import type { Logger } from '@/types/logger';
import type { Project } from '@/types/base';

import {
    CommandExecutor,
    ComponentUpdater,
    fs,
    vscode,
    setupUpdater,
} from './componentUpdater.testUtils';
import { createMockProject } from '../../../helpers/projectFake';
jest.mock('@/core/validation/URLValidator');

describe('ComponentUpdater - Extended Coverage', () => {
    let updater: ComponentUpdater;
    let mockLogger: jest.Mocked<Logger>;
    let mockProject: Project;
    let mockExecutor: Record<string, jest.Mock>;

    beforeEach(() => {
        ({
            updater,
            logger: mockLogger,
            executor: mockExecutor,
            project: mockProject,
        } = setupUpdater());
    });

    describe('.env file preservation', () => {
        it('should backup .env files before removing component', async () => {
            const downloadUrl = 'https://github.com/test/repo/archive/v1.0.0.zip';
            const newVersion = '1.0.0';

            // Reset mock to track calls properly
            (fs.readFile as jest.Mock).mockReset();
            (fs.readFile as jest.Mock)
                .mockResolvedValueOnce('OLD_VAR=old_value') // .env
                .mockResolvedValueOnce('LOCAL_VAR=local') // .env.local
                .mockResolvedValue('{"name": "test"}'); // package.json

            await updater.updateComponent(mockProject, 'test-component', downloadUrl, newVersion);

            // Verify .env was read (first calls should be for .env files)
            expect(fs.readFile).toHaveBeenCalledWith(expect.stringContaining('.env'), 'utf-8');
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
                (call: unknown[]) => typeof call[0] === 'string' && call[0].endsWith('.env')
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
            expect(mockProject.componentVersions?.['test-component']).toEqual({
                version: '1.0.0',
                lastUpdated: expect.any(String),
            });
        });

        it('keeps the INSTALLED component in step with the version record', async () => {
            const downloadUrl = 'https://github.com/test/repo/archive/v1.0.0.zip';

            await updater.updateComponent(mockProject, 'test-component', downloadUrl, '1.0.0');

            // Two places record a version and the project loader PREFERS this one. If it
            // is not moved, a successful update leaves the dashboard showing the old
            // version while the version record says the new one — and nothing fails.
            expect(mockProject.componentInstances?.['test-component']?.version).toBe('1.0.0');
        });

        it('updates a project that has no version record yet', async () => {
            const downloadUrl = 'https://github.com/test/repo/archive/v1.0.0.zip';
            // Older projects predate the field entirely. The default fixture already has
            // an empty one, so the branch that CREATES it was never taken.
            delete (mockProject as { componentVersions?: unknown }).componentVersions;

            await updater.updateComponent(mockProject, 'test-component', downloadUrl, '1.0.0');

            expect(mockProject.componentVersions?.['test-component']).toMatchObject({
                version: '1.0.0',
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
            expect(mockProject.componentVersions?.['test-component']).toBeUndefined();
        });
    });

    describe('formatUpdateError — what the user is told after a rolled-back failure', () => {
        // The friendly message is the REJECTION. Until 2026-09-03 it was thrown inside
        // the rollback's own try, so the rollback catch swallowed it and every failed
        // update — successful rollback included — surfaced as "Update failed AND
        // rollback failed. Manual recovery required." These tests used to find the
        // friendly text inside that CRITICAL log line, which is how the bug hid.
        const DOWNLOAD = 'https://github.com/test/repo/archive/v1.0.0.zip';

        async function failedUpdate(): Promise<string> {
            let message = '';
            await updater
                .updateComponent(mockProject, 'test-component', DOWNLOAD, '1.0.0')
                .catch((e: Error) => { message = e.message; });
            expect(message).not.toBe('');
            expect(mockLogger.error).not.toHaveBeenCalledWith(
                '[Updates] CRITICAL: Rollback failed',
                expect.anything()
            );
            return message;
        }

        it('network failure', async () => {
            (global.fetch as jest.Mock).mockRejectedValueOnce(new Error('fetch failed'));

            expect(await failedUpdate()).toBe(
                'Update failed: No internet connection. Please check your network and try again.'
            );
            expect(mockLogger.error).toHaveBeenCalledWith(
                '[Updates] Update failed, rolling back to snapshot',
                expect.any(Error)
            );
        });

        it('timeout', async () => {
            (global.fetch as jest.Mock).mockRejectedValueOnce(new Error('operation timed out'));

            expect(await failedUpdate()).toBe(
                'Update failed: Download timed out. Please try again with a better connection.'
            );
        });

        it('HTTP 404', async () => {
            (global.fetch as jest.Mock).mockResolvedValueOnce({ ok: false, status: 404 });

            expect(await failedUpdate()).toBe(
                'Update failed: Release not found on GitHub. The version may have been removed.'
            );
        });

        it('HTTP 403', async () => {
            (global.fetch as jest.Mock).mockResolvedValueOnce({ ok: false, status: 403 });

            expect(await failedUpdate()).toBe(
                'Update failed: Access denied. GitHub rate limit may be exceeded.'
            );
        });

        it('any other HTTP status', async () => {
            (global.fetch as jest.Mock).mockResolvedValueOnce({ ok: false, status: 500 });

            expect(await failedUpdate()).toBe(
                'Update failed: Server error (Download failed: HTTP 500). Please try again later.'
            );
        });

        it('anything else: the original reason, after a rollback', async () => {
            mockExecutor.execute.mockResolvedValueOnce({
                stdout: '', stderr: 'unzip: cannot open file', code: 1, duration: 1,
            });

            expect(await failedUpdate()).toBe(
                'Update failed and was rolled back: '
                + 'Extraction failed (exit code 1): unzip: cannot open file'
            );
        });
    });

    describe('Verification edge cases', () => {
        it('should verify package.json exists after extraction', async () => {
            const downloadUrl = 'https://github.com/test/repo/archive/v1.0.0.zip';
            const newVersion = '1.0.0';

            await updater.updateComponent(mockProject, 'test-component', downloadUrl, newVersion);

            expect(fs.access).toHaveBeenCalledWith(expect.stringContaining('package.json'));
        });

        it('should verify mesh.json exists for commerce-mesh component', async () => {
            const downloadUrl = 'https://github.com/test/repo/archive/v1.0.0.zip';
            const newVersion = '1.0.0';

            const {
                ComponentRegistryManager,
            } = require('@/features/components/services/ComponentRegistryManager');
            ComponentRegistryManager.mockImplementation(() => ({
                getComponentById: jest.fn().mockResolvedValue({
                    id: 'eds-commerce-mesh',
                    name: 'Commerce Mesh',
                    configuration: {},
                }),
            }));

            const meshProject = createMockProject({
                ...mockProject,
                componentInstances: {
                    'eds-commerce-mesh': {
                        name: 'eds-commerce-mesh',
                        status: 'ready',
                        id: 'eds-commerce-mesh',
                        path: '/path/to/project/components/commerce-mesh',
                        port: 3000,
                    },
                },
            });

            const meshUpdater = new ComponentUpdater(
                mockLogger,
                '/mock/extension/path',
                mockExecutor as unknown as CommandExecutor
            );

            await meshUpdater.updateComponent(
                meshProject,
                'eds-commerce-mesh',
                downloadUrl,
                newVersion
            );

            expect(fs.access).toHaveBeenCalledWith(expect.stringContaining('mesh.json'));
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
            ).rejects.toThrow(
                'Update failed: Downloaded component is incomplete or corrupted. Please try again.'
            );

            expect(mockLogger.error).toHaveBeenCalledWith(
                '[Updates] Update failed, rolling back to snapshot',
                expect.objectContaining({
                    message: expect.stringContaining('package.json is invalid'),
                })
            );
        });
    });

    describe('parseEnvFile edge cases (tested via .env merge)', () => {
        it('should skip comments and empty lines when parsing .env', async () => {
            const downloadUrl = 'https://github.com/test/repo/archive/v1.0.0.zip';
            const newVersion = '1.0.0';

            const envWithComments =
                '# This is a comment\nVAR1=value1\n\n# Another comment\nVAR2=value2';

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
                (call: unknown[]) => typeof call[0] === 'string' && call[0].endsWith('.env')
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
                (call: unknown[]) => typeof call[0] === 'string' && call[0].endsWith('.env')
            );

            expect(envWriteCall).toBeDefined();
            const mergedContent = envWriteCall![1] as string;
            expect(mergedContent).toContain('API_URL=https://example.com?param=value&other=123');
        });
    });
});
