/**
 * App Component Manager — additive add/remove on a LIVE project
 *
 * Step 5 (Batch 4): add ONE app to an already-created project without re-cloning
 * everything, and remove it cleanly (remote undeploy + local cleanup).
 *
 * Strict TDD: these tests are written BEFORE the implementation.
 *
 * Org-context discipline mirrors the mesh reset/deploy callers: the undeploy is
 * wrapped in `withOrgContext(buildOrgTargetFromProjectAdobe(project.adobe, cachedOrg), …)`.
 * We mock the org-context boundary exactly like projectResetService-meshContext.test.ts.
 */

import type { Project } from '@/types/base';

jest.setTimeout(5000);

// =============================================================================
// Mocks — defined before imports
// =============================================================================

// withOrgContext records the target then runs the callback (no global mutation),
// exactly like projectResetService-meshContext.test.ts.
const mockWithOrgContext = jest.fn(
    (_target: unknown, fn: () => Promise<unknown>) => fn(),
);
jest.mock('@/core/shell', () => ({
    ...jest.requireActual('@/core/shell'),
    withOrgContext: (target: unknown, fn: () => Promise<unknown>) =>
        mockWithOrgContext(target, fn),
}));

// =============================================================================
// Imports (after mocks)
// =============================================================================

import {
    addAppComponent,
    removeAppComponent,
} from '@/features/app-builder/services/appComponentManager';

// =============================================================================
// Helpers
// =============================================================================

const VALID_URL = 'https://github.com/acme/my-app';

interface ComponentManagerLike {
    installComponent: jest.Mock;
    removeComponent: jest.Mock;
}

interface CommandManagerLike {
    execute: jest.Mock;
}

function createComponentManager(): ComponentManagerLike {
    return {
        // installComponent ADDS exactly one instance to project.componentInstances,
        // mirroring the real ComponentManager git path. It must NOT wipe siblings.
        installComponent: jest.fn(async (project: Project, def: { id: string; name?: string }) => {
            const instance = {
                id: def.id,
                name: def.name ?? def.id,
                type: 'app-builder',
                subType: 'app',
                status: 'ready',
                path: `/proj/components/${def.id}`,
                lastUpdated: new Date(),
            };
            project.componentInstances = project.componentInstances ?? {};
            project.componentInstances[def.id] = instance as never;
            return { success: true, component: instance };
        }),
        removeComponent: jest.fn(async (project: Project, id: string) => {
            if (project.componentInstances) {
                delete project.componentInstances[id];
            }
        }),
    };
}

function createCommandManager(): CommandManagerLike {
    return {
        execute: jest.fn().mockResolvedValue({ code: 0, stdout: '', stderr: '' }),
    };
}

function createLogger() {
    return { info: jest.fn(), debug: jest.fn(), error: jest.fn(), warn: jest.fn() };
}

function createDeps(overrides: Partial<{
    componentManager: ComponentManagerLike;
    commandManager: CommandManagerLike;
    saveProject: jest.Mock;
    getCachedOrganization: jest.Mock;
}> = {}) {
    return {
        componentManager: overrides.componentManager ?? createComponentManager(),
        commandManager: overrides.commandManager ?? createCommandManager(),
        logger: createLogger(),
        saveProject: overrides.saveProject ?? jest.fn().mockResolvedValue(undefined),
        getCachedOrganization: overrides.getCachedOrganization ?? jest.fn().mockReturnValue(undefined),
    };
}

function createProject(overrides: Partial<Project> = {}): Project {
    return {
        name: 'test-project',
        path: '/proj',
        adobe: {
            organization: 'org-123',
            projectId: 'proj-456',
            workspace: 'ws-789',
        },
        // Pre-seed a sibling mesh + frontend instance: add/remove MUST leave these alone.
        componentInstances: {
            'commerce-mesh': {
                id: 'commerce-mesh', name: 'Mesh', type: 'dependency',
                subType: 'mesh', status: 'ready', path: '/proj/components/commerce-mesh',
            } as never,
            'citisignal': {
                id: 'citisignal', name: 'Frontend', type: 'frontend',
                status: 'ready', path: '/proj/components/citisignal',
            } as never,
        },
        ...overrides,
    } as unknown as Project;
}

beforeEach(() => {
    jest.clearAllMocks();
    mockWithOrgContext.mockImplementation(
        (_target: unknown, fn: () => Promise<unknown>) => fn(),
    );
});

// =============================================================================
// addAppComponent
// =============================================================================

describe('addAppComponent', () => {
    it('rejects an SSH/git@ URL', async () => {
        const project = createProject();
        const deps = createDeps();

        const result = await addAppComponent(project, 'git@github.com:acme/my-app.git', deps);

        expect(result.success).toBe(false);
        expect(result.error).toBeTruthy();
        expect(deps.componentManager.installComponent).not.toHaveBeenCalled();
    });

    it('rejects a non-https (http) URL', async () => {
        const project = createProject();
        const deps = createDeps();

        const result = await addAppComponent(project, 'http://github.com/acme/my-app', deps);

        expect(result.success).toBe(false);
        expect(deps.componentManager.installComponent).not.toHaveBeenCalled();
    });

    it('rejects a private/localhost URL (SSRF)', async () => {
        const project = createProject();
        const deps = createDeps();

        const result = await addAppComponent(project, 'https://localhost/acme/my-app', deps);

        expect(result.success).toBe(false);
        expect(deps.componentManager.installComponent).not.toHaveBeenCalled();
    });

    it('rejects an obviously garbage URL', async () => {
        const project = createProject();
        const deps = createDeps();

        const result = await addAppComponent(project, 'not-a-url', deps);

        expect(result.success).toBe(false);
        expect(deps.componentManager.installComponent).not.toHaveBeenCalled();
    });

    it('rejects a non-github https URL (not a recognized public repo host)', async () => {
        const project = createProject();
        const deps = createDeps();

        const result = await addAppComponent(project, 'https://example.com/acme/my-app', deps);

        expect(result.success).toBe(false);
        expect(deps.componentManager.installComponent).not.toHaveBeenCalled();
    });

    it('rejects when an app already exists (singular guard)', async () => {
        const project = createProject({
            componentInstances: {
                'existing-app': {
                    id: 'existing-app', name: 'Existing', type: 'app-builder',
                    subType: 'app', status: 'ready', path: '/proj/components/existing-app',
                } as never,
            },
        });
        const deps = createDeps();

        const result = await addAppComponent(project, VALID_URL, deps);

        expect(result.success).toBe(false);
        expect(result.error).toMatch(/remove the existing app/i);
        expect(deps.componentManager.installComponent).not.toHaveBeenCalled();
    });

    it('calls installComponent exactly once on success', async () => {
        const project = createProject();
        const deps = createDeps();

        const result = await addAppComponent(project, VALID_URL, deps);

        expect(result.success).toBe(true);
        expect(deps.componentManager.installComponent).toHaveBeenCalledTimes(1);
    });

    it('builds a git component definition (subType app, requiresDeployment, adobe-io)', async () => {
        const project = createProject();
        const deps = createDeps();

        await addAppComponent(project, VALID_URL, deps);

        const def = deps.componentManager.installComponent.mock.calls[0][1];
        expect(def.subType).toBe('app');
        // Stored URL is the CANONICAL form (never the raw input) — see injection hardening below.
        expect(def.source).toEqual(expect.objectContaining({ type: 'git', url: 'https://github.com/acme/my-app.git' }));
        expect(def.configuration).toEqual(
            expect.objectContaining({ requiresDeployment: true, deploymentTarget: 'adobe-io' }),
        );
    });

    it('does NOT hardcode a node version in the definition', async () => {
        const project = createProject();
        const deps = createDeps();

        await addAppComponent(project, VALID_URL, deps);

        const def = deps.componentManager.installComponent.mock.calls[0][1];
        expect(def.configuration?.nodeVersion).toBeUndefined();
    });

    it('derives a sanitized app id from the repo name', async () => {
        const project = createProject();
        const deps = createDeps();

        const result = await addAppComponent(project, 'https://github.com/Acme/My_App.git', deps);

        expect(result.success).toBe(true);
        expect(result.appId).toBe('my-app');
        const def = deps.componentManager.installComponent.mock.calls[0][1];
        expect(def.id).toBe('my-app');
    });

    it('writes exactly one new instance and sets componentSelections.appBuilder', async () => {
        const project = createProject();
        const deps = createDeps();

        const result = await addAppComponent(project, VALID_URL, deps);

        expect(result.success).toBe(true);
        expect(project.componentSelections?.appBuilder).toEqual([result.appId]);
        // Exactly one app-subType instance present.
        const apps = Object.values(project.componentInstances ?? {}).filter(
            (c) => (c as { subType?: string }).subType === 'app',
        );
        expect(apps).toHaveLength(1);
    });

    it('leaves pre-existing sibling instances untouched (no wipe)', async () => {
        const project = createProject();
        const deps = createDeps();

        await addAppComponent(project, VALID_URL, deps);

        expect(project.componentInstances?.['commerce-mesh']).toBeDefined();
        expect(project.componentInstances?.['citisignal']).toBeDefined();
    });

    it('persists the project after a successful add', async () => {
        const project = createProject();
        const deps = createDeps();

        await addAppComponent(project, VALID_URL, deps);

        expect(deps.saveProject).toHaveBeenCalledTimes(1);
        expect(deps.saveProject).toHaveBeenCalledWith(project);
    });

    it('returns failure (and does not persist) when installComponent fails', async () => {
        const componentManager = createComponentManager();
        componentManager.installComponent.mockResolvedValue({ success: false, error: 'clone failed' });
        const deps = createDeps({ componentManager });
        const project = createProject();

        const result = await addAppComponent(project, VALID_URL, deps);

        expect(result.success).toBe(false);
        expect(result.error).toBeTruthy();
        expect(deps.saveProject).not.toHaveBeenCalled();
    });

    // --- Injection hardening: the URL reaches a shell-interpolated `git clone`,
    // so a WHATWG-valid URL whose path carries shell metacharacters must be
    // rejected, and the STORED url must be a canonical, metacharacter-free string.
    it('rejects a github URL whose repo carries shell metacharacters (command injection)', async () => {
        const project = createProject();
        const deps = createDeps();

        const result = await addAppComponent(project, 'https://github.com/acme/my-app$(id)', deps);

        expect(result.success).toBe(false);
        expect(deps.componentManager.installComponent).not.toHaveBeenCalled();
    });

    it('rejects a github URL whose owner carries a backtick/semicolon', async () => {
        const project = createProject();
        const deps = createDeps();

        const result = await addAppComponent(project, 'https://github.com/ac`me/repo;evil', deps);

        expect(result.success).toBe(false);
        expect(deps.componentManager.installComponent).not.toHaveBeenCalled();
    });

    it('stores a canonical https://github.com/owner/repo.git url (not the raw input)', async () => {
        const project = createProject();
        const deps = createDeps();

        await addAppComponent(project, 'https://github.com/acme/my-app/', deps);

        const def = deps.componentManager.installComponent.mock.calls[0][1];
        expect(def.source.url).toBe('https://github.com/acme/my-app.git');
    });

    it('does not carry embedded credentials into the stored url', async () => {
        const project = createProject();
        const deps = createDeps();

        const result = await addAppComponent(project, 'https://user:pass@github.com/acme/my-app', deps);

        // Either rejected outright, or canonicalized without the userinfo — never stored with creds.
        if (result.success) {
            const def = deps.componentManager.installComponent.mock.calls[0][1];
            expect(def.source.url).toBe('https://github.com/acme/my-app.git');
            expect(def.source.url).not.toContain('pass');
        } else {
            expect(deps.componentManager.installComponent).not.toHaveBeenCalled();
        }
    });
});

// =============================================================================
// removeAppComponent
// =============================================================================

describe('removeAppComponent', () => {
    function projectWithApp(): Project {
        return createProject({
            componentInstances: {
                'commerce-mesh': {
                    id: 'commerce-mesh', name: 'Mesh', type: 'dependency',
                    subType: 'mesh', status: 'ready', path: '/proj/components/commerce-mesh',
                } as never,
                'my-app': {
                    id: 'my-app', name: 'My App', type: 'app-builder',
                    subType: 'app', status: 'ready', path: '/proj/components/my-app',
                } as never,
            },
            componentSelections: { appBuilder: ['my-app'] },
            appState: { status: 'deployed', url: 'https://app.example.com' },
            appStatusSummary: 'deployed',
        });
    }

    it('is a no-op success when there is no app', async () => {
        const project = createProject(); // no app-subType instance
        const deps = createDeps();

        const result = await removeAppComponent(project, deps);

        expect(result.success).toBe(true);
        expect(deps.commandManager.execute).not.toHaveBeenCalled();
        expect(deps.componentManager.removeComponent).not.toHaveBeenCalled();
    });

    it('runs `aio app undeploy` wrapped in withOrgContext', async () => {
        const project = projectWithApp();
        const deps = createDeps();

        await removeAppComponent(project, deps);

        expect(mockWithOrgContext).toHaveBeenCalledTimes(1);
        const undeployCall = deps.commandManager.execute.mock.calls.find(
            (c) => String(c[0]).includes('app undeploy'),
        );
        expect(undeployCall).toBeDefined();
    });

    it('targets the project org/project/workspace via the org-context wrapper', async () => {
        const project = projectWithApp();
        const deps = createDeps();

        await removeAppComponent(project, deps);

        expect(mockWithOrgContext).toHaveBeenCalledWith(
            expect.objectContaining({
                orgId: 'org-123',
                projectId: 'proj-456',
                workspaceId: 'ws-789',
            }),
            expect.any(Function),
        );
    });

    it('resolves org code/name from the cached org when its id matches', async () => {
        const project = projectWithApp();
        const deps = createDeps({
            getCachedOrganization: jest.fn().mockReturnValue({
                id: 'org-123', code: 'CODE@AdobeOrg', name: 'Acme Inc',
            }),
        });

        await removeAppComponent(project, deps);

        expect(mockWithOrgContext).toHaveBeenCalledWith(
            expect.objectContaining({
                orgId: 'org-123',
                orgCode: 'CODE@AdobeOrg',
                orgName: 'Acme Inc',
            }),
            expect.any(Function),
        );
    });

    it('runs undeploy from the app path with auto node + enhancePath', async () => {
        const project = projectWithApp();
        const deps = createDeps();

        await removeAppComponent(project, deps);

        const undeployCall = deps.commandManager.execute.mock.calls.find(
            (c) => String(c[0]).includes('app undeploy'),
        );
        expect(undeployCall?.[1]).toEqual(
            expect.objectContaining({
                cwd: '/proj/components/my-app',
                useNodeVersion: 'auto',
                enhancePath: true,
            }),
        );
    });

    it('calls removeComponent with deleteFiles=true', async () => {
        const project = projectWithApp();
        const deps = createDeps();

        await removeAppComponent(project, deps);

        expect(deps.componentManager.removeComponent).toHaveBeenCalledWith(project, 'my-app', true);
    });

    it('clears appState, appStatusSummary and drops the app from the selection', async () => {
        const project = projectWithApp();
        const deps = createDeps();

        const result = await removeAppComponent(project, deps);

        expect(result.success).toBe(true);
        expect(project.appState).toBeUndefined();
        expect(project.appStatusSummary).toBeUndefined();
        expect(project.componentSelections?.appBuilder).toEqual([]);
    });

    it('persists the project after removal', async () => {
        const project = projectWithApp();
        const deps = createDeps();

        await removeAppComponent(project, deps);

        expect(deps.saveProject).toHaveBeenCalledWith(project);
    });

    it('leaves sibling instances untouched on removal', async () => {
        const project = projectWithApp();
        const deps = createDeps();

        await removeAppComponent(project, deps);

        expect(project.componentInstances?.['commerce-mesh']).toBeDefined();
    });

    it('surfaces a warning but still clears local state when undeploy exits non-zero', async () => {
        const commandManager = createCommandManager();
        commandManager.execute.mockResolvedValue({ code: 1, stdout: '', stderr: 'undeploy boom' });
        const deps = createDeps({ commandManager });
        const project = projectWithApp();

        const result = await removeAppComponent(project, deps);

        expect(result.success).toBe(true);
        expect(result.undeployWarning).toBeTruthy();
        // Local cleanup still happened.
        expect(deps.componentManager.removeComponent).toHaveBeenCalledWith(project, 'my-app', true);
        expect(project.appState).toBeUndefined();
        expect(project.componentSelections?.appBuilder).toEqual([]);
    });

    it('surfaces a warning but still clears local state when undeploy throws', async () => {
        const commandManager = createCommandManager();
        commandManager.execute.mockRejectedValue(new Error('network down'));
        const deps = createDeps({ commandManager });
        const project = projectWithApp();

        const result = await removeAppComponent(project, deps);

        expect(result.success).toBe(true);
        expect(result.undeployWarning).toMatch(/network down/);
        expect(deps.componentManager.removeComponent).toHaveBeenCalledWith(project, 'my-app', true);
        expect(project.appState).toBeUndefined();
    });
});
