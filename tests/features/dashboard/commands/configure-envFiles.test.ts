/**
 * ConfigureProjectWebviewCommand — the file side of Configure.
 *
 * Three jobs nothing reached: reading each component's existing .env so the form
 * opens with the values that are actually on disk, telling the file watcher which
 * paths the save is about to write (so it does not report the extension's own
 * writes as external edits), and regenerating those files afterwards.
 *
 * The decisions here are all about WHICH path — `.env.local` for Next.js, `.env`
 * for everything else, first-hit-wins between the two — so every assertion names
 * the paths a collaborator is handed.
 */

import { ConfigureProjectWebviewCommand } from './configure.testUtils';
import * as vscode from 'vscode';
import { ComponentRegistryManager } from '@/features/components/services/ComponentRegistryManager';
import type { Project } from '@/types/base';
import type { Logger } from '@/types/logger';
import { createMockExtensionContext } from '../../../helpers/extensionContextFake';
import { createMockLogger } from '../../../helpers/loggerFake';
import { createMockProject } from '../../../helpers/projectFake';
import { createMockStateManager } from '../../../helpers/stateManagerFake';

const mockReadFile = jest.fn();
jest.mock('fs/promises', () => ({
    readFile: (...args: unknown[]) => mockReadFile(...args),
}));

const mockRegenerateProjectEnvFiles = jest.fn().mockResolvedValue(undefined);
jest.mock('@/features/project-creation/helpers/envFileGenerator', () => ({
    regenerateProjectEnvFiles: (...args: unknown[]) => mockRegenerateProjectEnvFiles(...args),
}));

const mockRepublishStorefrontConfig = jest.fn();
jest.mock('@/features/eds/services/storefront/storefrontRepublishService', () => ({
    republishStorefrontConfig: (...args: unknown[]) => mockRepublishStorefrontConfig(...args),
}));

const mockRefreshStatus = jest.fn().mockResolvedValue(undefined);
jest.mock('@/features/dashboard/commands/showDashboard', () => ({
    ProjectDashboardWebviewCommand: {
        refreshStatus: (...args: unknown[]) => mockRefreshStatus(...args),
    },
}));

/** The private file-side surface this suite drives. */
interface FileInternals {
    loadExistingEnvValues(project: Project): Promise<Record<string, Record<string, string>>>;
    registerProgrammaticWrites(
        project: Project,
        componentConfigs: Record<string, Record<string, string>>
    ): Promise<void>;
    regenerateEnvFiles(project: Project): Promise<void>;
    republishStorefront(project: Project): Promise<void>;
}

function files(command: ConfigureProjectWebviewCommand): FileInternals {
    return command as unknown as FileInternals;
}

/** Answer readFile from a path→contents map; anything else is ENOENT. */
function onDisk(contents: Record<string, string>): void {
    mockReadFile.mockImplementation((p: string) =>
        p in contents ? Promise.resolve(contents[p]) : Promise.reject(new Error('ENOENT'))
    );
}

/** A project with one component instance at a given path. */
function projectWith(instances: Record<string, { path?: string }>): Project {
    const componentInstances = Object.fromEntries(
        Object.entries(instances).map(([id, { path }]) => [
            id,
            { id, name: id, status: 'ready', ...(path ? { path } : {}) },
        ])
    );
    return createMockProject({
        path: '/proj',
        componentInstances: componentInstances as Project['componentInstances'],
        componentConfigs: {},
    });
}

describe('ConfigureProjectWebviewCommand - env file reads and writes', () => {
    let command: ConfigureProjectWebviewCommand;
    let stateManager: ReturnType<typeof createMockStateManager>;
    let logger: Logger;

    beforeEach(() => {
        jest.clearAllMocks();
        onDisk({});
        stateManager = createMockStateManager();
        logger = createMockLogger() as unknown as Logger;
        command = new ConfigureProjectWebviewCommand(
            createMockExtensionContext(),
            stateManager,
            logger
        );
    });

    describe('loadExistingEnvValues', () => {
        it('prefers .env.local over .env for a component that has both', async () => {
            onDisk({
                '/c/next/.env.local': 'FROM=local',
                '/c/next/.env': 'FROM=plain',
            });

            const values = await files(command).loadExistingEnvValues(
                projectWith({ 'nextjs-store': { path: '/c/next' } })
            );

            expect(values['nextjs-store']).toEqual({ FROM: 'local' });
            // Having found .env.local it stops — the plain .env is never read.
            expect(mockReadFile).not.toHaveBeenCalledWith('/c/next/.env', 'utf-8');
        });

        it('falls back to .env when there is no .env.local', async () => {
            onDisk({ '/c/api/.env': 'API_KEY=abc' });

            const values = await files(command).loadExistingEnvValues(
                projectWith({ api: { path: '/c/api' } })
            );

            expect(values.api).toEqual({ API_KEY: 'abc' });
            expect(mockReadFile).toHaveBeenCalledWith('/c/api/.env.local', 'utf-8');
        });

        it('records an empty record for a component with neither file', async () => {
            const values = await files(command).loadExistingEnvValues(
                projectWith({ api: { path: '/c/api' } })
            );

            expect(values.api).toEqual({});
        });

        it('skips a component instance that has no path at all', async () => {
            const values = await files(command).loadExistingEnvValues(
                projectWith({ 'not-installed': {} })
            );

            expect(values['not-installed']).toBeUndefined();
            expect(mockReadFile).toHaveBeenCalledTimes(1); // the project root .env only
        });

        it('merges the project root .env in for components with no instance', async () => {
            onDisk({ '/proj/.env': 'ACCS_ENDPOINT=https://example.test/graphql' });
            const project = createMockProject({
                path: '/proj',
                componentInstances: {},
                componentConfigs: {
                    'adobe-commerce-accs': { ACCS_ENDPOINT: '' },
                },
            });

            const values = await files(command).loadExistingEnvValues(project);

            expect(values['adobe-commerce-accs']).toEqual({
                ACCS_ENDPOINT: 'https://example.test/graphql',
            });
        });

        it('survives an unreadable project root .env', async () => {
            const project = createMockProject({
                path: '/proj',
                componentInstances: {},
                componentConfigs: { backend: { A: 'stored' } },
            });

            const values = await files(command).loadExistingEnvValues(project);

            expect(values.backend).toEqual({ A: 'stored' });
        });

        it('treats a project with no componentConfigs as an empty manifest', async () => {
            const project = createMockProject({
                path: '/proj',
                componentInstances: {},
                componentConfigs: undefined,
            });

            await expect(files(command).loadExistingEnvValues(project)).resolves.toEqual({});
        });
    });

    describe('registerProgrammaticWrites', () => {
        it('always registers the project root .env', async () => {
            await files(command).registerProgrammaticWrites(projectWith({}), {});

            expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
                'demoBuilder._internal.registerProgrammaticWrites',
                ['/proj/.env']
            );
        });

        it('registers .env.local for a Next.js component and .env for the rest', async () => {
            await files(command).registerProgrammaticWrites(
                projectWith({
                    'nextjs-store': { path: '/c/next' },
                    'commerce-api': { path: '/c/api' },
                }),
                { 'nextjs-store': { A: '1' }, 'commerce-api': { B: '2' } }
            );

            const [, paths] = (vscode.commands.executeCommand as jest.Mock).mock.calls[0];
            expect(paths).toEqual(['/proj/.env', '/c/next/.env.local', '/c/api/.env']);
        });

        it('skips a component with a path but no saved config', async () => {
            await files(command).registerProgrammaticWrites(
                projectWith({ 'commerce-api': { path: '/c/api' } }),
                {}
            );

            const [, paths] = (vscode.commands.executeCommand as jest.Mock).mock.calls[0];
            expect(paths).toEqual(['/proj/.env']);
        });

        it('skips a component with a config but no path', async () => {
            await files(command).registerProgrammaticWrites(projectWith({ 'commerce-api': {} }), {
                'commerce-api': { B: '2' },
            });

            const [, paths] = (vscode.commands.executeCommand as jest.Mock).mock.calls[0];
            expect(paths).toEqual(['/proj/.env']);
        });
    });

    describe('regenerateEnvFiles', () => {
        it('hands the loaded registry, logger and secret store to the shared generator', async () => {
            const registry = { version: '1.0.0', components: {}, envVars: {} };
            (
                ComponentRegistryManager as jest.MockedClass<typeof ComponentRegistryManager>
            ).mockImplementation(
                () =>
                    ({
                        loadRegistry: jest.fn().mockResolvedValue(registry),
                    }) as unknown as ComponentRegistryManager
            );
            const project = projectWith({});

            await files(command).regenerateEnvFiles(project);

            expect(mockRegenerateProjectEnvFiles).toHaveBeenCalledWith(
                project,
                registry,
                logger,
                expect.anything()
            );
        });
    });

    describe('republishStorefront', () => {
        it('persists, refreshes and re-arms the prompt on success', async () => {
            mockRepublishStorefrontConfig.mockResolvedValue({ success: true });
            const successSpy = jest
                .spyOn(
                    command as unknown as { showSuccessMessage: (m: string) => Promise<void> },
                    'showSuccessMessage'
                )
                .mockResolvedValue(undefined);
            const project = projectWith({});

            await files(command).republishStorefront(project);

            expect(mockRepublishStorefrontConfig).toHaveBeenCalledWith(
                expect.objectContaining({ project })
            );
            expect(stateManager.saveProject).toHaveBeenCalledWith(project);
            expect(mockRefreshStatus).toHaveBeenCalledTimes(1);
            expect(successSpy).toHaveBeenCalledWith(
                'Storefront configuration republished successfully'
            );
        });

        it('runs behind a non-cancellable "Republishing storefront" toast', async () => {
            mockRepublishStorefrontConfig.mockResolvedValue({ success: true });

            await files(command).republishStorefront(projectWith({}));

            expect(vscode.window.withProgress).toHaveBeenCalledWith(
                {
                    location: vscode.ProgressLocation.Notification,
                    title: 'Republishing storefront',
                    // A half-published config.json serves a storefront that points
                    // at neither the old nor the new configuration.
                    cancellable: false,
                },
                expect.any(Function)
            );
        });

        it('reports the service error and saves nothing when the republish fails', async () => {
            mockRepublishStorefrontConfig.mockResolvedValue({ success: false, error: 'no token' });

            await files(command).republishStorefront(projectWith({}));

            expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
                'Failed to republish storefront: no token'
            );
            expect(stateManager.saveProject).not.toHaveBeenCalled();
            expect(mockRefreshStatus).not.toHaveBeenCalled();
        });

        it('reports a thrown error instead of propagating it', async () => {
            mockRepublishStorefrontConfig.mockRejectedValue(new Error('network down'));

            await expect(
                files(command).republishStorefront(projectWith({}))
            ).resolves.toBeUndefined();

            expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
                'Failed to republish storefront: network down'
            );
        });

        it('forwards the service progress messages to the toast', async () => {
            mockRepublishStorefrontConfig.mockImplementation(
                async (opts: { onProgress: (m: string) => void }) => {
                    opts.onProgress('Publishing config.json…');
                    return { success: true };
                }
            );
            const report = jest.fn();
            (vscode.window.withProgress as jest.Mock).mockImplementationOnce(
                async (_o: unknown, task: (p: { report: jest.Mock }) => Promise<unknown>) =>
                    task({ report })
            );

            await files(command).republishStorefront(projectWith({}));

            expect(report).toHaveBeenCalledWith({ message: 'Publishing config.json…' });
        });

        it('persists through the `persist` seam the service is handed', async () => {
            const project = projectWith({});
            mockRepublishStorefrontConfig.mockImplementation(
                async (opts: { persist: (p: Project) => Promise<void> }) => {
                    await opts.persist(project);
                    return { success: false, error: 'stopped after persist' };
                }
            );

            await files(command).republishStorefront(project);

            expect(stateManager.saveProject).toHaveBeenCalledWith(project);
        });
    });
});
