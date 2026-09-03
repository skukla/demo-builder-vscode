/**
 * CheckUpdatesCommand — dispatching a picker selection to the executors.
 *
 * Each executor is called only when it has something to do, with exactly its
 * own items, in the fixed order, and with one shared UpdateContext. The
 * template step's result — the set of project paths that synced — is what the
 * add-on step is handed for its dedup, so it is asserted as the same object.
 */

import {
    AddonUpdateChecker,
    CheckUpdatesCommand,
    loadProjects,
    projectWithAddons,
    setupDefaultMocks,
} from './checkUpdates.testUtils';
import * as vscode from 'vscode';
import { ServiceLocator } from '@/core/di/serviceLocator';
import {
    performAddonUpdates,
    performAdobeMcpUpdates,
    performComponentUpdates,
    performForkSyncUpdates,
    performTemplateUpdates,
} from '@/features/updates/commands/updateExecutor';
import type {
    AdobeMcpUpdateItem,
    BlockLibraryUpdateItem,
    ForkSyncItem,
    InspectorUpdateItem,
    ProjectUpdateItem,
    TemplateUpdateItem,
} from '@/features/updates/commands/updateTypes';
import { AdobeMcpUpdateChecker } from '@/features/updates/services/adobeMcpUpdateChecker';
import type { Project } from '@/types/base';
import { createMockCommandExecutor } from '../../../helpers/commandExecutorFake';

jest.mock('@/features/updates/commands/updateExecutor');
jest.mock('@/features/updates/services/adobeMcpUpdateChecker');
jest.mock('@/core/utils/sleep');

const showQuickPickMock = vscode.window.showQuickPick as jest.Mock;
const forkMock = performForkSyncUpdates as jest.Mock;
const templateMock = performTemplateUpdates as jest.Mock;
const componentMock = performComponentUpdates as jest.Mock;
const mcpMock = performAdobeMcpUpdates as jest.Mock;
const addonMock = performAddonUpdates as jest.Mock;

const fork = (): ForkSyncItem => ({
    label: 'fork', owner: 'adobe', repo: 'r', branch: 'main', behindBy: 1, parentFullName: 'a/r', isForkSync: true,
});
const template = (project: Project): TemplateUpdateItem => ({
    label: 'template',
    project,
    templateUpdate: {
        hasUpdates: true, currentCommit: 'a', latestCommit: 'b', commitsBehind: 1, templateOwner: 'adobe', templateRepo: 'r',
    },
    isTemplateUpdate: true,
});
const component = (project: Project): ProjectUpdateItem => ({
    label: 'component',
    project,
    componentId: 'api-mesh',
    currentVersion: '1.0.0',
    latestVersion: '2.0.0',
    releaseInfo: { version: '2.0.0', downloadUrl: 'https://example.com/x.zip', releaseNotes: '', publishedAt: '', isPrerelease: false },
    isProjectUpdate: true,
});
const blockLibrary = (project: Project): BlockLibraryUpdateItem => ({
    label: 'lib', project, library: project.installedBlockLibraries![0], latestCommit: 'x', commitsBehind: 1, isBlockLibraryUpdate: true,
});
const inspector = (project: Project): InspectorUpdateItem => ({
    label: 'inspector', project, latestCommit: 'x', commitsBehind: 1, isInspectorUpdate: true,
});
const adobeMcp = (project: Project): AdobeMcpUpdateItem => ({
    label: 'mcp', project, currentVersion: '1.0.0', latestVersion: '1.1.0', packageName: 'pkg', isAdobeMcpUpdate: true,
});

describe('CheckUpdatesCommand — dispatch', () => {
    let harness: ReturnType<typeof setupDefaultMocks>;
    let commandExecutor: ReturnType<typeof createMockCommandExecutor>;
    let project: Project;
    const synced = new Set(['/projects/test-project']);

    async function runWithSelection(selection: unknown[]): Promise<void> {
        showQuickPickMock.mockResolvedValue(selection);
        const command = new CheckUpdatesCommand(harness.mockContext, harness.mockStateManager, harness.mockLogger);
        await command.execute();
    }

    beforeEach(() => {
        jest.clearAllMocks();
        commandExecutor = createMockCommandExecutor();
        ServiceLocator.setCommandExecutor(commandExecutor);
        harness = setupDefaultMocks();
        (AdobeMcpUpdateChecker as jest.MockedClass<typeof AdobeMcpUpdateChecker>).prototype.checkForUpdates =
            jest.fn().mockResolvedValue(null);
        project = projectWithAddons();
        loadProjects(harness.mockStateManager, project);
        // One real update so the picker opens; what it returns is the test's choice.
        (AddonUpdateChecker as jest.MockedClass<typeof AddonUpdateChecker>).prototype.checkBlockLibraries
            .mockResolvedValue([{ library: project.installedBlockLibraries![0], latestCommit: 'x', commitsBehind: 1 }]);
        templateMock.mockResolvedValue(synced);
    });

    it('hands every executor its own items, in order, with one shared context', async () => {
        const items = [fork(), template(project), component(project), blockLibrary(project), inspector(project), adobeMcp(project)];
        const order: string[] = [];
        forkMock.mockImplementation(async () => { order.push('fork'); });
        templateMock.mockImplementation(async () => { order.push('template'); return synced; });
        componentMock.mockImplementation(async () => { order.push('component'); });
        mcpMock.mockImplementation(async () => { order.push('mcp'); });
        addonMock.mockImplementation(async () => { order.push('addon'); });

        await runWithSelection(items);

        const ctx = {
            secrets: harness.mockContext.secrets,
            extensionPath: '/ext',
            stateManager: harness.mockStateManager,
            logger: harness.mockLogger,
            commandManager: commandExecutor,
        };
        expect(forkMock).toHaveBeenCalledWith([items[0]], ctx);
        expect(templateMock).toHaveBeenCalledWith([items[1]], ctx);
        expect(componentMock).toHaveBeenCalledWith([items[2]], ctx);
        expect(mcpMock).toHaveBeenCalledWith([items[5]], ctx);
        expect(addonMock).toHaveBeenCalledWith([items[3]], [items[4]], synced, ctx);
        expect(order).toEqual(['fork', 'template', 'component', 'mcp', 'addon']);
    });

    it('forks only: nothing else is called, not even with an empty list', async () => {
        await runWithSelection([fork()]);

        expect(forkMock).toHaveBeenCalledTimes(1);
        expect(templateMock).not.toHaveBeenCalled();
        expect(componentMock).not.toHaveBeenCalled();
        expect(mcpMock).not.toHaveBeenCalled();
        expect(addonMock).not.toHaveBeenCalled();
    });

    it('components only', async () => {
        await runWithSelection([component(project)]);

        expect(componentMock).toHaveBeenCalledTimes(1);
        expect(forkMock).not.toHaveBeenCalled();
        expect(addonMock).not.toHaveBeenCalled();
    });

    it('Adobe MCP only', async () => {
        await runWithSelection([adobeMcp(project)]);

        expect(mcpMock).toHaveBeenCalledTimes(1);
        expect(componentMock).not.toHaveBeenCalled();
        expect(addonMock).not.toHaveBeenCalled();
    });

    it('block libraries only: add-ons run with no inspectors and an EMPTY synced set', async () => {
        const lib = blockLibrary(project);

        await runWithSelection([lib]);

        expect(templateMock).not.toHaveBeenCalled();
        expect(addonMock).toHaveBeenCalledWith([lib], [], new Set(), expect.anything());
    });

    it('inspectors only: add-ons run with no block libraries', async () => {
        const insp = inspector(project);

        await runWithSelection([insp]);

        expect(addonMock).toHaveBeenCalledWith([], [insp], new Set(), expect.anything());
        expect(mcpMock).not.toHaveBeenCalled();
    });
});
