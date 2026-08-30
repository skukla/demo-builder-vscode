/**
 * ComponentUpdater Tests - Core Workflow
 *
 * Tests for core update functionality:
 * - Shell parameter for unzip command (CRITICAL FIX)
 * - Full update workflow (snapshot, download, extract, verify, merge)
 * - Configuration-driven builds
 * - Snapshot lifecycle
 */

import { DEFAULT_SHELL } from '@/types/shell';
import type { Logger } from '@/types/logger';
import type { Project } from '@/types';

import {
    CommandExecutor,
    ComponentUpdater,
    fs,
    vscode,
} from './componentUpdater.testUtils';

describe('ComponentUpdater - Core Workflow', () => {
    let updater: ComponentUpdater;
    let mockLogger: jest.Mocked<Logger>;
    let mockProject: Project;
    let mockExecutor: Record<string, jest.Mock>;

    beforeEach(() => {
        jest.clearAllMocks();

        // Mock logger
        mockLogger = {
            info: jest.fn(),
            debug: jest.fn(),
            warn: jest.fn(),
            error: jest.fn(),
        } as unknown as jest.Mocked<Logger>;

        // Mock executor with execute method
        mockExecutor = {
            execute: jest.fn().mockResolvedValue({
                stdout: '',
                stderr: '',
                code: 0,
                duration: 100,
            }),
        };

        // Mock ServiceLocator
        // CONVERTED 2026-08-28 (ADR-015): the executor is a constructor
        // dependency now — the same fake is handed straight in.

        // Mock security validation
        const securityValidation = require('@/core/validation');
        securityValidation.validateGitHubDownloadURL = jest.fn();

        // Mock fs operations using jest.spyOn
        jest.spyOn(fs, 'cp').mockResolvedValue(undefined);
        jest.spyOn(fs, 'rm').mockResolvedValue(undefined);
        jest.spyOn(fs, 'mkdir').mockResolvedValue(undefined);
        jest.spyOn(fs, 'readFile').mockResolvedValue('{"name": "test"}');
        jest.spyOn(fs, 'writeFile').mockResolvedValue(undefined);
        jest.spyOn(fs, 'access').mockResolvedValue(undefined);
        jest.spyOn(fs, 'unlink').mockResolvedValue(undefined);
        jest.spyOn(fs, 'rename').mockResolvedValue(undefined);

        // Mock vscode.commands
        (vscode.commands.executeCommand as jest.Mock).mockResolvedValue(undefined);

        // Mock global fetch
        global.fetch = jest.fn().mockResolvedValue({
            ok: true,
            arrayBuffer: jest.fn().mockResolvedValue(new ArrayBuffer(1024)),
        }) as unknown as typeof fetch;

        updater = new ComponentUpdater(
            mockLogger,
            '/mock/extension/path',
            mockExecutor as unknown as CommandExecutor
        );

        // Mock project
        mockProject = {
            path: '/path/to/project',
            name: 'test-project',
            componentInstances: {
                'test-component': {
                    id: 'test-component',
                    path: '/path/to/project/components/test-component',
                    port: 3000,
                },
            },
            componentVersions: {},
        } as unknown as Project;
    });

    describe('updateComponent() - Shell parameter for unzip (CRITICAL FIX)', () => {
        it('should use shell parameter for unzip command', async () => {
            const downloadUrl = 'https://github.com/test/repo/archive/v1.0.0.zip';
            const newVersion = '1.0.0';

            await updater.updateComponent(mockProject, 'test-component', downloadUrl, newVersion);

            // CRITICAL: Verify shell parameter is passed to unzip command
            expect(mockExecutor.execute).toHaveBeenCalledWith(
                expect.stringContaining('unzip'),
                expect.objectContaining({
                    shell: DEFAULT_SHELL,
                })
            );
        });

        it('should include timeout in shell command execution', async () => {
            const downloadUrl = 'https://github.com/test/repo/archive/v1.0.0.zip';
            const newVersion = '1.0.0';

            await updater.updateComponent(mockProject, 'test-component', downloadUrl, newVersion);

            // Verify timeout is included
            expect(mockExecutor.execute).toHaveBeenCalledWith(
                expect.any(String),
                expect.objectContaining({
                    timeout: expect.any(Number),
                })
            );
        });

        it('should include enhancePath in shell command execution', async () => {
            const downloadUrl = 'https://github.com/test/repo/archive/v1.0.0.zip';
            const newVersion = '1.0.0';

            await updater.updateComponent(mockProject, 'test-component', downloadUrl, newVersion);

            // Verify enhancePath is included
            expect(mockExecutor.execute).toHaveBeenCalledWith(
                expect.any(String),
                expect.objectContaining({
                    enhancePath: true,
                })
            );
        });
    });

    describe('updateComponent() - Full workflow', () => {
        it('should create snapshot before update', async () => {
            const downloadUrl = 'https://github.com/test/repo/archive/v1.0.0.zip';
            const newVersion = '1.0.0';

            await updater.updateComponent(mockProject, 'test-component', downloadUrl, newVersion);

            // Verify snapshot creation (with filter to exclude node_modules)
            expect(fs.cp).toHaveBeenCalledWith(
                '/path/to/project/components/test-component',
                expect.stringContaining('snapshot'),
                expect.objectContaining({
                    recursive: true,
                    filter: expect.any(Function),
                })
            );
        });

        it('should rollback on failure', async () => {
            const downloadUrl = 'https://github.com/test/repo/archive/v1.0.0.zip';
            const newVersion = '1.0.0';

            // Simulate failure during extraction
            mockExecutor.execute.mockRejectedValueOnce(new Error('Extraction failed'));

            await expect(
                updater.updateComponent(mockProject, 'test-component', downloadUrl, newVersion)
            ).rejects.toThrow();

            // Verify rollback happened
            expect(fs.rename).toHaveBeenCalled();
            expect(mockLogger.debug).toHaveBeenCalledWith(
                expect.stringContaining('Rollback successful')
            );
        });

        it('should prevent concurrent updates to same component', async () => {
            const downloadUrl = 'https://github.com/test/repo/archive/v1.0.0.zip';
            const newVersion = '1.0.0';

            // Start first update
            const update1 = updater.updateComponent(
                mockProject,
                'test-component',
                downloadUrl,
                newVersion
            );

            // Attempt concurrent update
            const update2 = updater.updateComponent(
                mockProject,
                'test-component',
                downloadUrl,
                newVersion
            );

            // Attach BOTH assertions before awaiting EITHER. update2 rejects on the next
            // tick, so awaiting update1 first leaves it momentarily unhandled — jest
            // tolerates that, but a bare node process exits 1 on an unhandled rejection,
            // which is how Stryker's child test runner died here on 2026-08-30.
            const firstSucceeds = await expect(update1).resolves.not.toThrow();
            const secondIsRefused = await expect(update2).rejects.toThrow('Update already in progress');

            // First should succeed, second should fail
            await Promise.all([firstSucceeds, secondIsRefused]);
        });
    });

    describe('runPostUpdateBuild() - Configuration-driven builds', () => {
        it('should run npm install after update even when no buildScript is configured', async () => {
            const downloadUrl = 'https://github.com/test/repo/archive/v1.0.0.zip';
            const newVersion = '1.0.0';

            // Default mock has no buildScript (like the headless frontend)
            await updater.updateComponent(mockProject, 'test-component', downloadUrl, newVersion);

            // npm install MUST run even without buildScript — the zipball has no node_modules
            const executeCalls = mockExecutor.execute.mock.calls;
            const installCalls = executeCalls.filter((call: unknown[]) =>
                (call[0] as string).includes('npm install')
            );
            expect(installCalls).toHaveLength(1);
        });

        it('should skip build step but still install deps when no buildScript configured', async () => {
            const downloadUrl = 'https://github.com/test/repo/archive/v1.0.0.zip';
            const newVersion = '1.0.0';

            // Default mock has no buildScript
            await updater.updateComponent(mockProject, 'test-component', downloadUrl, newVersion);

            // npm run build should NOT be called
            const executeCalls = mockExecutor.execute.mock.calls;
            const buildCalls = executeCalls.filter((call: unknown[]) =>
                (call[0] as string).includes('npm run')
            );
            expect(buildCalls).toHaveLength(0);
        });

        it('should skip npm install when skipNpmInstall is true', async () => {
            const downloadUrl = 'https://github.com/test/repo/archive/v1.0.0.zip';
            const newVersion = '1.0.0';

            // Override mock to return component with skipNpmInstall (like eds-storefront)
            const {
                ComponentRegistryManager,
            } = require('@/features/components/services/ComponentRegistryManager');
            ComponentRegistryManager.mockImplementation(() => ({
                getComponentById: jest.fn().mockResolvedValue({
                    id: 'eds-storefront',
                    name: 'EDS Storefront',
                    configuration: {
                        skipNpmInstall: true,
                    },
                }),
            }));

            const skipUpdater = new ComponentUpdater(
                mockLogger,
                '/mock/extension/path',
                mockExecutor as unknown as CommandExecutor
            );

            const edsProject = {
                ...mockProject,
                componentInstances: {
                    'eds-storefront': {
                        id: 'eds-storefront',
                        path: '/path/to/project/components/eds-storefront',
                        port: 3000,
                    },
                },
            } as unknown as Project;

            await skipUpdater.updateComponent(
                edsProject,
                'eds-storefront',
                downloadUrl,
                newVersion
            );

            // Neither npm install nor npm run should be called
            const executeCalls = mockExecutor.execute.mock.calls;
            const npmCalls = executeCalls.filter(
                (call: unknown[]) =>
                    (call[0] as string).includes('npm install') ||
                    (call[0] as string).includes('npm run')
            );
            expect(npmCalls).toHaveLength(0);
        });

        it('should run npm install and build script when buildScript is configured', async () => {
            const downloadUrl = 'https://github.com/test/repo/archive/v1.0.0.zip';
            const newVersion = '1.0.0';

            // Override mock to return component with buildScript
            const {
                ComponentRegistryManager,
            } = require('@/features/components/services/ComponentRegistryManager');
            ComponentRegistryManager.mockImplementation(() => ({
                getComponentById: jest.fn().mockResolvedValue({
                    id: 'eds-commerce-mesh',
                    name: 'Commerce Mesh',
                    configuration: {
                        buildScript: 'build',
                        nodeVersion: '20',
                    },
                }),
            }));

            // Create new updater with fresh mock
            const buildUpdater = new ComponentUpdater(
                mockLogger,
                '/mock/extension/path',
                mockExecutor as unknown as CommandExecutor
            );

            // Add commerce-mesh to project
            const meshProject = {
                ...mockProject,
                componentInstances: {
                    'eds-commerce-mesh': {
                        id: 'eds-commerce-mesh',
                        path: '/path/to/project/components/commerce-mesh',
                        port: 3000,
                    },
                },
            } as unknown as Project;

            await buildUpdater.updateComponent(
                meshProject,
                'eds-commerce-mesh',
                downloadUrl,
                newVersion
            );

            // Verify npm install was called
            expect(mockExecutor.execute).toHaveBeenCalledWith(
                'npm install --no-fund',
                expect.objectContaining({
                    cwd: '/path/to/project/components/commerce-mesh',
                    useNodeVersion: '20',
                })
            );

            // Verify build script was called
            expect(mockExecutor.execute).toHaveBeenCalledWith(
                'npm run build -- --force',
                expect.objectContaining({
                    cwd: '/path/to/project/components/commerce-mesh',
                    useNodeVersion: '20',
                })
            );
        });

        it('should clean up GitHub archive root folder after extraction', async () => {
            const downloadUrl = 'https://github.com/test/repo/archive/v1.0.0.zip';
            const newVersion = '1.0.0';

            await updater.updateComponent(mockProject, 'test-component', downloadUrl, newVersion);

            // Verify extraction command uses rm -rf for cleanup (handles hidden files)
            expect(mockExecutor.execute).toHaveBeenCalledWith(
                expect.stringMatching(/unzip.*&&.*mv.*&&.*rm -rf/),
                expect.any(Object)
            );
        });

        it('should throw on extraction failure (non-zero exit code)', async () => {
            const downloadUrl = 'https://github.com/test/repo/archive/v1.0.0.zip';
            const newVersion = '1.0.0';

            // Simulate extraction command failing with exit code 1
            mockExecutor.execute.mockResolvedValueOnce({
                stdout: '',
                stderr: 'unzip: cannot open file',
                code: 1,
                duration: 533,
            });

            await expect(
                updater.updateComponent(mockProject, 'test-component', downloadUrl, newVersion)
            ).rejects.toThrow();

            // Verify the extraction failure was logged before rollback
            expect(mockLogger.error).toHaveBeenCalledWith(
                '[Updates] Update failed, rolling back to snapshot',
                expect.objectContaining({
                    message: expect.stringContaining('Extraction failed'),
                })
            );
        });

        it('should throw error when npm install fails during post-update build', async () => {
            const downloadUrl = 'https://github.com/test/repo/archive/v1.0.0.zip';
            const newVersion = '1.0.0';

            // Override mock to return component with buildScript
            const {
                ComponentRegistryManager,
            } = require('@/features/components/services/ComponentRegistryManager');
            ComponentRegistryManager.mockImplementation(() => ({
                getComponentById: jest.fn().mockResolvedValue({
                    id: 'eds-commerce-mesh',
                    name: 'Commerce Mesh',
                    configuration: {
                        buildScript: 'build',
                        nodeVersion: '20',
                    },
                }),
            }));

            const buildUpdater = new ComponentUpdater(
                mockLogger,
                '/mock/extension/path',
                mockExecutor as unknown as CommandExecutor
            );

            const meshProject = {
                ...mockProject,
                componentInstances: {
                    'eds-commerce-mesh': {
                        id: 'eds-commerce-mesh',
                        path: '/path/to/project/components/commerce-mesh',
                        port: 3000,
                    },
                },
            } as unknown as Project;

            // Make npm install fail
            mockExecutor.execute
                .mockResolvedValueOnce({ stdout: '', stderr: '', code: 0, duration: 100 }) // unzip
                .mockResolvedValueOnce({
                    stdout: '',
                    stderr: 'npm ERR! install failed',
                    code: 1,
                    duration: 100,
                }); // npm install fails

            await expect(
                buildUpdater.updateComponent(
                    meshProject,
                    'eds-commerce-mesh',
                    downloadUrl,
                    newVersion
                )
            ).rejects.toThrow();

            expect(mockLogger.error).toHaveBeenCalledWith(
                '[Updates] Post-update setup failed',
                expect.any(Error)
            );
        });

        it('should throw error when build script fails', async () => {
            const downloadUrl = 'https://github.com/test/repo/archive/v1.0.0.zip';
            const newVersion = '1.0.0';

            // Override mock to return component with buildScript
            const {
                ComponentRegistryManager,
            } = require('@/features/components/services/ComponentRegistryManager');
            ComponentRegistryManager.mockImplementation(() => ({
                getComponentById: jest.fn().mockResolvedValue({
                    id: 'eds-commerce-mesh',
                    name: 'Commerce Mesh',
                    configuration: {
                        buildScript: 'build',
                        nodeVersion: '20',
                    },
                }),
            }));

            const buildUpdater = new ComponentUpdater(
                mockLogger,
                '/mock/extension/path',
                mockExecutor as unknown as CommandExecutor
            );

            const meshProject = {
                ...mockProject,
                componentInstances: {
                    'eds-commerce-mesh': {
                        id: 'eds-commerce-mesh',
                        path: '/path/to/project/components/commerce-mesh',
                        port: 3000,
                    },
                },
            } as unknown as Project;

            // npm install succeeds, build fails
            mockExecutor.execute
                .mockResolvedValueOnce({ stdout: '', stderr: '', code: 0, duration: 100 }) // unzip
                .mockResolvedValueOnce({ stdout: '', stderr: '', code: 0, duration: 100 }) // npm install
                .mockResolvedValueOnce({
                    stdout: '',
                    stderr: 'Build failed: esbuild error',
                    code: 1,
                    duration: 100,
                }); // npm run build fails

            await expect(
                buildUpdater.updateComponent(
                    meshProject,
                    'eds-commerce-mesh',
                    downloadUrl,
                    newVersion
                )
            ).rejects.toThrow();

            expect(mockLogger.error).toHaveBeenCalledWith(
                '[Updates] Post-update setup failed',
                expect.any(Error)
            );
        });

        /**
         * The same defect the mesh build had, in the update path: the failure
         * was thrown with the build output as its MESSAGE, and the logger keeps
         * only the first line of a message and then redacts a leading path away.
         * Node prints the offending file path as line 1 of any uncaught
         * exception, so the whole reason vanished. See
         * `core/shell/buildComponent.ts`, where this is fixed for the deploy path.
         */
        it('dumps the post-update build output so the cause survives the message pipeline', async () => {
            const downloadUrl = 'https://github.com/test/repo/archive/v1.0.0.zip';
            const newVersion = '1.0.0';
            const buildUpdater = new ComponentUpdater(
                mockLogger,
                '/mock/extension/path',
                mockExecutor as unknown as CommandExecutor
            );
            const meshProject = {
                ...mockProject,
                componentInstances: {
                    'eds-commerce-mesh': {
                        id: 'eds-commerce-mesh',
                        path: '/path/to/project/components/commerce-mesh',
                        port: 3000,
                    },
                },
            } as unknown as Project;

            const nodeCrash = [
                '/Users/leah/.demo-builder/projects/demo/components/commerce-mesh/mesh.config.js:1',
                "Error: Cannot find module 'dotenv'",
            ].join('\n');

            mockExecutor.execute
                .mockResolvedValueOnce({ stdout: '', stderr: '', code: 0, duration: 100 }) // unzip
                .mockResolvedValueOnce({ stdout: '', stderr: '', code: 0, duration: 100 }) // npm install
                .mockResolvedValueOnce({ stdout: '', stderr: nodeCrash, code: 1, duration: 100 }); // build

            await expect(
                buildUpdater.updateComponent(
                    meshProject,
                    'eds-commerce-mesh',
                    downloadUrl,
                    newVersion
                )
            ).rejects.toThrow();

            const dump = mockLogger.debug.mock.calls.find(
                (call: unknown[]) => typeof call[1] === 'object' && call[1] !== null
            );
            expect(dump).toBeDefined();
            expect(JSON.stringify(dump?.[1])).toContain("Cannot find module 'dotenv'");
        });
    });

    describe('Snapshot lifecycle', () => {
        it('should remove snapshot after successful update', async () => {
            const downloadUrl = 'https://github.com/test/repo/archive/v1.0.0.zip';
            const newVersion = '1.0.0';

            await updater.updateComponent(mockProject, 'test-component', downloadUrl, newVersion);

            // Verify snapshot cleanup - fs.rm called with snapshot path
            expect(fs.rm).toHaveBeenCalledWith(expect.stringContaining('.snapshot-'), {
                recursive: true,
                force: true,
            });
        });
    });
});
