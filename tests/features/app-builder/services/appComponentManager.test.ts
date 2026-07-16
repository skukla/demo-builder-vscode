/**
 * addAppComponent — additive add of a custom integration on a LIVE project
 * (URL validation + clone/install + keyed entry + selection append). The
 * per-id removeAppComponent suite lives in appComponentManager-remove.test.ts;
 * shared factories in appComponentManager.testUtils.ts.
 *
 * N integrations coexist (ADR-011 D3 Step 05 dropped the one-app guard).
 */

import type { Project } from '@/types/base';
import { addAppComponent } from '@/features/app-builder/services/appComponentManager';
import {
    createComponentManager,
    createDeps,
    createProject,
} from './appComponentManager.testUtils';

jest.setTimeout(5000);

const VALID_URL = 'https://github.com/acme/my-app';

beforeEach(() => {
    jest.clearAllMocks();
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

    // ADR-011 D3 Step 05: the one-app guard is GONE — the keyed model supports N
    // custom integrations side by side.
    describe('N integrations (ADR-011 D3 Step 05 — one add system, keyed)', () => {
        function projectWithExistingIntegration(): Project {
            return createProject({
                componentInstances: {
                    'existing-app': {
                        id: 'existing-app',
                        name: 'Existing',
                        type: 'app-builder',
                        subType: 'app',
                        status: 'ready',
                        path: '/proj/components/existing-app',
                    } as never,
                },
                componentSelections: { appBuilder: ['existing-app'] },
                appBuilderComponents: {
                    'existing-app': {
                        kind: 'integration',
                        status: 'deployed',
                        source: { owner: 'acme', repo: 'existing-app' },
                        url: 'https://existing.example',
                    },
                },
            } as Partial<Project>);
        }

        it('adds a SECOND custom integration beside an existing one (no singular guard)', async () => {
            const project = projectWithExistingIntegration();
            const deps = createDeps();

            const result = await addAppComponent(project, VALID_URL, deps);

            expect(result.success).toBe(true);
            expect(project.componentInstances?.['existing-app']).toBeDefined();
            expect(project.componentInstances?.['my-app']).toBeDefined();
        });

        it('APPENDS to componentSelections.appBuilder (never overwrites to one element)', async () => {
            const project = projectWithExistingIntegration();
            const deps = createDeps();

            await addAppComponent(project, VALID_URL, deps);

            expect(project.componentSelections?.appBuilder).toEqual(['existing-app', 'my-app']);
        });

        it('writes the keyed appBuilderComponents entry with its source on add', async () => {
            const project = projectWithExistingIntegration();
            const deps = createDeps();

            await addAppComponent(project, VALID_URL, deps);

            expect(project.appBuilderComponents?.['my-app']).toEqual(
                expect.objectContaining({
                    kind: 'integration',
                    status: 'not-deployed',
                    source: { owner: 'acme', repo: 'my-app' },
                })
            );
        });

        it('leaves the existing keyed sibling entry untouched on add', async () => {
            const project = projectWithExistingIntegration();
            const deps = createDeps();

            await addAppComponent(project, VALID_URL, deps);

            expect(project.appBuilderComponents?.['existing-app']).toEqual(
                expect.objectContaining({ status: 'deployed', url: 'https://existing.example' })
            );
        });

        it('rejects adding the SAME integration twice (duplicate id, fail-fast)', async () => {
            const project = createProject({
                componentInstances: {
                    'my-app': {
                        id: 'my-app',
                        name: 'My App',
                        type: 'app-builder',
                        subType: 'app',
                        status: 'ready',
                        path: '/proj/components/my-app',
                    } as never,
                },
            });
            const deps = createDeps();

            const result = await addAppComponent(project, VALID_URL, deps);

            expect(result.success).toBe(false);
            expect(result.error).toMatch(/already/i);
            expect(deps.componentManager.installComponent).not.toHaveBeenCalled();
        });

        it('does not duplicate an id already present in the selection', async () => {
            const project = createProject({
                componentSelections: { appBuilder: ['my-app'] },
            } as Partial<Project>);
            const deps = createDeps();

            await addAppComponent(project, VALID_URL, deps);

            expect(
                project.componentSelections?.appBuilder?.filter((id) => id === 'my-app')
            ).toHaveLength(1);
        });
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
        expect(def.source).toEqual(
            expect.objectContaining({ type: 'git', url: 'https://github.com/acme/my-app.git' })
        );
        expect(def.configuration).toEqual(
            expect.objectContaining({ requiresDeployment: true, deploymentTarget: 'adobe-io' })
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
            (c) => (c as { subType?: string }).subType === 'app'
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
        componentManager.installComponent.mockResolvedValue({
            success: false,
            error: 'clone failed',
        });
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

        const result = await addAppComponent(
            project,
            'https://user:pass@github.com/acme/my-app',
            deps
        );

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

