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

import {
    ComponentUpdater,
    fs,
    vscode,
    setupUpdater,
} from './componentUpdater.testUtils';
import type { Logger } from '@/types/logger';
import type { Project } from '@/types/base';


describe('ComponentUpdater - Extended Coverage', () => {
    let updater: ComponentUpdater;
    let mockLogger: jest.Mocked<Logger>;
    let mockProject: Project;
    let moveToRelease: jest.Mock;

    beforeEach(() => {
        ({
            updater,
            logger: mockLogger,
            project: mockProject,
            moveToRelease,
        } = setupUpdater());
    });

    describe('.env file preservation', () => {
        it('should read the .env files before the move', async () => {
            const tag = 'v1.0.0';
            const newVersion = '1.0.0';

            // Reset mock to track calls properly
            (fs.readFile as jest.Mock).mockReset();
            (fs.readFile as jest.Mock)
                .mockResolvedValueOnce('OLD_VAR=old_value') // .env
                .mockResolvedValueOnce('LOCAL_VAR=local') // .env.local
                .mockResolvedValue('{"name": "test"}'); // package.json

            await updater.updateComponent(mockProject, 'test-component', tag, newVersion);

            // Verify .env was read (first calls should be for .env files)
            expect(fs.readFile).toHaveBeenCalledWith(expect.stringContaining('.env'), 'utf-8');
        });

        it('should restore .env unchanged when no .env.example exists', async () => {
            const tag = 'v1.0.0';
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

            await updater.updateComponent(mockProject, 'test-component', tag, newVersion);

            // Old content should be written back
            expect(fs.writeFile).toHaveBeenCalledWith(
                expect.stringMatching(/\.env$/),
                oldEnvContent,
                'utf-8'
            );
        });

        it('should merge .env preserving user values and adding new defaults', async () => {
            const tag = 'v1.0.0';
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

            await updater.updateComponent(mockProject, 'test-component', tag, newVersion);

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
            const tag = 'v1.0.0';
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

            await updater.updateComponent(mockProject, 'test-component', tag, newVersion);

            expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
                'demoBuilder._internal.registerProgrammaticWrites',
                expect.any(Array)
            );
        });
    });

    describe('Version tracking', () => {
        it('should update version after successful verification', async () => {
            const tag = 'v1.0.0';
            const newVersion = '1.0.0';

            await updater.updateComponent(mockProject, 'test-component', tag, newVersion);

            expect(mockProject.componentVersions).toBeDefined();
            expect(mockProject.componentVersions?.['test-component']).toEqual({
                version: '1.0.0',
                lastUpdated: expect.any(String),
            });
        });

        it('keeps the INSTALLED component in step with the version record', async () => {
            const tag = 'v1.0.0';

            await updater.updateComponent(mockProject, 'test-component', tag, '1.0.0');

            // Two places record a version and the project loader PREFERS this one. If it
            // is not moved, a successful update leaves the dashboard showing the old
            // version while the version record says the new one — and nothing fails.
            expect(mockProject.componentInstances?.['test-component']?.version).toBe('1.0.0');
        });

        it('updates a project that has no version record yet', async () => {
            const tag = 'v1.0.0';
            // Older projects predate the field entirely. The default fixture already has
            // an empty one, so the branch that CREATES it was never taken.
            delete (mockProject as { componentVersions?: unknown }).componentVersions;

            await updater.updateComponent(mockProject, 'test-component', tag, '1.0.0');

            expect(mockProject.componentVersions?.['test-component']).toMatchObject({
                version: '1.0.0',
            });
        });

        it('should NOT update version when verification fails', async () => {
            const tag = 'v1.0.0';
            const newVersion = '1.0.0';

            // Only package.json: the folder itself must still pass the guard before the snapshot.
            (fs.access as jest.Mock).mockImplementation(async (p: string) => {
                if (p.endsWith('/package.json')) throw new Error('ENOENT');
            });

            await expect(
                updater.updateComponent(mockProject, 'test-component', tag, newVersion)
            ).rejects.toThrow('The new version is incomplete');

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
        async function failedUpdate(): Promise<string> {
            let message = '';
            await updater
                .updateComponent(mockProject, 'test-component', 'v1.0.0', '1.0.0')
                .catch((e: Error) => { message = e.message; });
            expect(message).not.toBe('');
            expect(mockLogger.error).not.toHaveBeenCalledWith(
                '[Updates] CRITICAL: Rollback failed',
                expect.anything()
            );
            return message;
        }

        it('network failure', async () => {
            moveToRelease.mockRejectedValueOnce(new Error('fetch failed'));

            expect(await failedUpdate()).toBe(
                'Update failed: No internet connection. Please check your network and try again.'
            );
            expect(mockLogger.error).toHaveBeenCalledWith(
                '[Updates] Update failed, rolling back to snapshot',
                expect.any(Error)
            );
        });

        it('timeout', async () => {
            moveToRelease.mockRejectedValueOnce(new Error('Command timed out after 60000ms'));

            expect(await failedUpdate()).toBe(
                'Update failed: GitHub timed out. Please try again with a better connection.'
            );
        });

        it('anything else: the original reason, after a rollback', async () => {
            moveToRelease.mockRejectedValueOnce(new Error('Could not fetch refs/tags/v1.0.0 from GitHub: bad object.'));

            expect(await failedUpdate()).toBe(
                'Update failed and was rolled back: '
                + 'Could not fetch refs/tags/v1.0.0 from GitHub: bad object.'
            );
        });
    });

    describe('Verification edge cases', () => {
        it('should verify package.json exists after the move', async () => {
            const tag = 'v1.0.0';
            const newVersion = '1.0.0';

            await updater.updateComponent(mockProject, 'test-component', tag, newVersion);

            expect(fs.access).toHaveBeenCalledWith(expect.stringContaining('package.json'));
        });

        it('should throw when component not found in project', async () => {
            await expect(
                updater.updateComponent(
                    mockProject,
                    'non-existent-component',
                    'v1.0.0',
                    '1.0.0'
                )
            ).rejects.toThrow('Component non-existent-component not found');
        });

        it('should throw critical error when rollback fails', async () => {
            const tag = 'v1.0.0';
            const newVersion = '1.0.0';

            moveToRelease.mockRejectedValueOnce(new Error('Could not fetch refs/tags/v1.0.0 from GitHub: bad object.'));

            // Make rollback also fail: the snapshot cannot be put back.
            (fs.rename as jest.Mock).mockRejectedValueOnce(new Error('Cannot rename'));

            await expect(
                updater.updateComponent(mockProject, 'test-component', tag, newVersion)
            ).rejects.toThrow(/Manual recovery required/);
        });

        it('should validate package.json is valid JSON', async () => {
            const tag = 'v1.0.0';
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
                updater.updateComponent(mockProject, 'test-component', tag, newVersion)
            ).rejects.toThrow(
                'Update failed: The new version is incomplete. Please try again.'
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
            const tag = 'v1.0.0';
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

            await updater.updateComponent(mockProject, 'test-component', tag, newVersion);

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
            const tag = 'v1.0.0';
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

            await updater.updateComponent(mockProject, 'test-component', tag, newVersion);

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
