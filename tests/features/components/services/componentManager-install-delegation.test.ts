/**
 * ComponentManager — what the MANAGER decides, with both collaborators handed in.
 *
 * The other six suites in this family drive the real `ComponentInstallation` and
 * `ComponentDependencies` through a fake executor, which is the right shape for
 * "does a git clone come out correct". It cannot reach two decisions that belong
 * to the manager alone:
 *
 *   - a clone result that FAILED rather than threw (`installGitComponent` throws on
 *     a bad clone, so the guard never fires through the real collaborator), and
 *   - a dependency install that failed FATALLY, which must abort the install with
 *     npm's own error instead of marking the component ready.
 *
 * Both are contract decisions — `ComponentInstallResult.success` is part of what
 * the collaborator may return — so they are pinned here against stubs, and the
 * ARGUMENTS the manager forwards are asserted alongside them.
 */

import { ComponentManager } from '@/features/components/services/componentManager';
import type { ComponentInstallResult } from '@/features/components/services/types';
import type { ComponentInstance, Project } from '@/types/base';
import type { TransformedComponentDefinition } from '@/types/components';
import type { Logger } from '@/types/logger';
import {
    createComponentServiceProject,
    createMockCommandExecutor,
    createMockLogger,
} from './testHelpers';

const mockInstallation = {
    installGitComponent: jest.fn<Promise<ComponentInstallResult>, unknown[]>(),
};
const mockDependencies = {
    installDependenciesForComponent: jest.fn<
        Promise<{ success: boolean; error?: string }>,
        unknown[]
    >(),
    installNpmDependencies: jest.fn(),
};

jest.mock('@/features/components/services/componentInstallation', () => ({
    ComponentInstallation: jest.fn().mockImplementation(() => mockInstallation),
}));
jest.mock('@/features/components/services/componentDependencies', () => ({
    ComponentDependencies: jest.fn().mockImplementation(() => mockDependencies),
}));

const GIT_COMPONENT: TransformedComponentDefinition = {
    id: 'test-component',
    name: 'Test Component',
    type: 'frontend',
    source: { type: 'git', url: 'https://github.com/test/repo.git' },
};

/** The instance the real installation would have filled in before returning. */
const clonedInstance = (): ComponentInstance => ({
    id: 'test-component',
    name: 'Test Component',
    type: 'frontend',
    status: 'cloning',
    path: '/test/project/components/test-component',
});

describe('ComponentManager - install delegation', () => {
    let componentManager: ComponentManager;
    let mockLogger: Logger;
    let mockProject: Project;

    beforeEach(() => {
        jest.clearAllMocks();
        mockLogger = createMockLogger();
        mockProject = createComponentServiceProject();
        componentManager = new ComponentManager(mockLogger, createMockCommandExecutor());

        // The collaborator fills in `path` on the instance it was handed; the
        // manager reads that same object back to decide whether to install deps.
        mockInstallation.installGitComponent.mockImplementation(
            async (_projectPath, _def, instance) => {
                Object.assign(instance as ComponentInstance, { path: clonedInstance().path });
                return { success: true, component: instance as ComponentInstance };
            }
        );
        mockDependencies.installDependenciesForComponent.mockResolvedValue({ success: true });
    });

    it('hands the clone the project path, the definition and the install options', async () => {
        await componentManager.installComponent(mockProject, GIT_COMPONENT, { branch: 'develop' });

        expect(mockInstallation.installGitComponent).toHaveBeenCalledWith(
            mockProject.path,
            GIT_COMPONENT,
            expect.objectContaining({ id: 'test-component' }),
            { branch: 'develop' }
        );
    });

    it('installs dependencies at the cloned path, never as a fresh install', async () => {
        await componentManager.installComponent(mockProject, GIT_COMPONENT);

        expect(mockDependencies.installDependenciesForComponent).toHaveBeenCalledWith(
            clonedInstance().path,
            GIT_COMPONENT,
            false
        );
    });

    it('returns a FAILED clone untouched and never reaches dependencies', async () => {
        mockInstallation.installGitComponent.mockResolvedValue({
            success: false,
            error: 'Git clone failed: Repository not found',
        });

        const result = await componentManager.installComponent(mockProject, GIT_COMPONENT);

        expect(result).toEqual({
            success: false,
            error: 'Git clone failed: Repository not found',
        });
        expect(mockDependencies.installDependenciesForComponent).not.toHaveBeenCalled();
    });

    // strictInstall components (App Builder integrations) abort here with npm's own
    // error, instead of letting a deploy fail later on a missing node_modules.
    it('aborts with npm own error when dependencies fail fatally', async () => {
        mockDependencies.installDependenciesForComponent.mockResolvedValue({
            success: false,
            error: 'npm install failed for Test Component: ENOENT',
        });

        const result = await componentManager.installComponent(mockProject, GIT_COMPONENT);

        expect(result.success).toBe(false);
        expect(result.error).toBe('npm install failed for Test Component: ENOENT');
        expect(result.component).toBeUndefined();
    });

    it('marks the component errored — not ready — when dependencies fail fatally', async () => {
        let handed: ComponentInstance | undefined;
        mockInstallation.installGitComponent.mockImplementation(
            async (_projectPath, _def, instance) => {
                handed = instance as ComponentInstance;
                Object.assign(handed, { path: clonedInstance().path });
                return { success: true, component: handed };
            }
        );
        mockDependencies.installDependenciesForComponent.mockResolvedValue({
            success: false,
            error: 'npm install failed',
        });

        await componentManager.installComponent(mockProject, GIT_COMPONENT);

        expect(handed?.status).toBe('error');
    });

    it('marks the component ready when both steps succeed', async () => {
        const result = await componentManager.installComponent(mockProject, GIT_COMPONENT);

        expect(result.success).toBe(true);
        expect(result.component?.status).toBe('ready');
    });

    it('skips dependencies entirely when asked to', async () => {
        const result = await componentManager.installComponent(mockProject, GIT_COMPONENT, {
            skipDependencies: true,
        });

        expect(mockDependencies.installDependenciesForComponent).not.toHaveBeenCalled();
        expect(result.component?.status).toBe('ready');
    });
});
