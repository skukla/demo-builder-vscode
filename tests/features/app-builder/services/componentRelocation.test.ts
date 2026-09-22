/**
 * Moving an integration that has a workspace of its own into a DIFFERENT Adobe
 * project (AB-23 slice 7).
 *
 * Owner decision, 2026-09-21: remove it from the old Adobe project, then add it in
 * the new one — every step is one removal and add already run live. One change from
 * a plain removal: its folder on disk stays, because an integration built with AI
 * exists only there.
 */

const mockDeploy = jest.fn();
jest.mock('@/features/app-builder/services/appBuilderComponentRunner', () => ({
    ...jest.requireActual('@/features/app-builder/services/appBuilderComponentRunner'),
    deployAppBuilderComponent: (...a: unknown[]) => mockDeploy(...a),
}));

import { ownWorkspaceGroups, relocateGroup } from '@/features/app-builder/services/componentRelocation';
import type { AppBuilderComponentCatalogEntry } from '@/types/appBuilderComponents';
import type { Project } from '@/types/base';
import { createDeps } from './appBuilderComponentRunner.testUtils';
import { createMockProject } from '../../../helpers/projectFake';

const PREVIOUS = { organization: '285361', projectId: 'old-proj', workspace: 'old-production' };
const OLD_WS = { id: 'ws-old-erp', name: 'Northwind-ERP', title: 'Northwind ERP' };

const INTEGRATION = {
    id: 'erp-integration',
    name: 'ERP Integration',
    kind: 'integration',
    lifecycle: 'app-management',
    source: { owner: 'o', repo: 'commerce-erp-integration' },
} as AppBuilderComponentCatalogEntry;
const SYSTEM = {
    id: 'demo-erp',
    name: 'ERP',
    kind: 'system',
    boundTo: 'erp-integration',
    source: { owner: 'o', repo: 'demo-erp' },
} as AppBuilderComponentCatalogEntry;

function bodea(): Project {
    const record = (kind: 'integration' | 'system') => ({
        kind,
        status: 'deployed' as const,
        source: { owner: 'o', repo: 'r' },
        workspace: OLD_WS,
    });
    return createMockProject({
        adobe: { organization: '285361', projectId: 'new-proj', workspace: 'new-production' },
        appBuilderComponents: {
            'eds-accs-mesh': { kind: 'mesh', status: 'deployed', source: { owner: '', repo: '' } },
            'erp-integration': record('integration'),
            'demo-erp': { ...record('system'), usedBy: 'erp-integration' },
        },
    });
}

function depsFor(overrides: Record<string, unknown> = {}) {
    return createDeps({
        catalog: [INTEGRATION, SYSTEM],
        uninstallAppManagement: jest.fn().mockResolvedValue({ status: 'uninstalled' }),
        ...overrides,
    });
}

const group = (project: Project) => ownWorkspaceGroups(project)[0];

beforeEach(() => {
    jest.clearAllMocks();
    mockDeploy.mockResolvedValue({ success: true });
});

describe('ownWorkspaceGroups', () => {
    it('groups a pair once, ERP first, and leaves out what lives in the project workspace', () => {
        expect(ownWorkspaceGroups(bodea())).toEqual([
            { workspace: OLD_WS, members: ['demo-erp', 'erp-integration'] },
        ]);
    });
});

describe('relocateGroup', () => {
    it("cleans up in the OLD Adobe project, then deletes the old workspace there", async () => {
        const project = bodea();
        const deps = depsFor({
            createComponentWorkspace: jest.fn(async (p: Project, entry: AppBuilderComponentCatalogEntry) => {
                const state = p.appBuilderComponents?.[entry.id];
                if (state) state.workspace = { id: 'ws-new', name: 'Northwind-ERP' };
            }),
        });

        await relocateGroup(project, group(project), PREVIOUS, deps);

        const [uninstalledFrom] = (deps.uninstallAppManagement as jest.Mock).mock.calls[0];
        expect(uninstalledFrom.adobe).toEqual(PREVIOUS);
        // ...and the OLD workspace: the records are pointed at the new one first.
        expect(uninstalledFrom.appBuilderComponents['erp-integration'].workspace).toEqual(OLD_WS);
        const [deletedFrom, workspace] = (deps.deleteComponentWorkspace as jest.Mock).mock.calls[0];
        expect(deletedFrom.adobe).toEqual(PREVIOUS);
        expect(workspace).toEqual(OLD_WS);
        // The project itself still names the NEW destination.
        expect(project.adobe?.projectId).toBe('new-proj');
    });

    it('makes a new workspace, subscribes it once, and deploys the ERP before its integration', async () => {
        const project = bodea();
        const calls: string[] = [];
        const deps = depsFor({
            createComponentWorkspace: jest.fn(async (p: Project, entry: AppBuilderComponentCatalogEntry) => {
                calls.push(`workspace:${entry.id}`);
                const state = p.appBuilderComponents?.[entry.id];
                if (state) state.workspace = { id: 'ws-new', name: 'Northwind-ERP' };
            }),
            subscribeRequiredApis: jest.fn(async () => calls.push('subscribe')),
        });
        mockDeploy.mockImplementation(async (_p: Project, id: string) => {
            calls.push(`deploy:${id}`);
            return { success: true };
        });

        const result = await relocateGroup(project, group(project), PREVIOUS, deps);

        expect(result).toEqual({ moved: ['demo-erp', 'erp-integration'], released: true });
        expect(calls).toEqual([
            'workspace:demo-erp',
            'workspace:erp-integration',
            'subscribe',
            'deploy:demo-erp',
            'deploy:erp-integration',
        ]);
        const [, , , scope] = (deps.subscribeRequiredApis as jest.Mock).mock.calls[0];
        expect(scope).toEqual({ forComponent: 'erp-integration' });
    });

    it("keeps the integration's folder on disk — an AI-built one exists only there", async () => {
        const project = bodea();
        const deps = depsFor();

        await relocateGroup(project, group(project), PREVIOUS, deps);

        expect(deps.componentManager.removeComponent).not.toHaveBeenCalled();
    });

    it('undoes the new workspace, and keeps the old, when the Commerce clean-up does not finish', async () => {
        const project = bodea();
        const NEW_WS = { id: 'ws-new', name: 'Northwind-ERP' };
        const deps = depsFor({
            uninstallAppManagement: jest.fn().mockResolvedValue({ status: 'failed', detail: '503' }),
            createComponentWorkspace: jest.fn(async (p: Project, entry: AppBuilderComponentCatalogEntry) => {
                const state = p.appBuilderComponents?.[entry.id];
                if (state) state.workspace = NEW_WS;
            }),
        });

        const result = await relocateGroup(project, group(project), PREVIOUS, deps);

        expect(result.released).toBe(false);
        expect(result.failed?.error).toContain('503');
        const deleted = (deps.deleteComponentWorkspace as jest.Mock).mock.calls;
        expect(deleted).toHaveLength(1);
        expect(deleted[0][0].adobe.projectId).toBe('new-proj');
        expect(deleted[0][1]).toEqual(NEW_WS);
        expect(project.appBuilderComponents?.['erp-integration']?.workspace).toEqual(OLD_WS);
        expect(project.appBuilderComponents?.['demo-erp']?.workspace).toEqual(OLD_WS);
        expect(mockDeploy).not.toHaveBeenCalled();
    });

    // Made after the old side was gone, a failure would leave the pair recording no
    // workspace — and its next Redeploy would land in the project's own.
    it('makes the new workspace BEFORE anything is cleaned up in the old project', async () => {
        const project = bodea();
        const calls: string[] = [];
        const deps = depsFor({
            createComponentWorkspace: jest.fn(async () => {
                calls.push('create');
            }),
            uninstallAppManagement: jest.fn(async () => {
                calls.push('uninstall');
                return { status: 'uninstalled' };
            }),
        });

        await relocateGroup(project, group(project), PREVIOUS, deps);

        expect(calls.indexOf('create')).toBeLessThan(calls.indexOf('uninstall'));
    });

    it('cleans up nothing when the new workspace cannot be made', async () => {
        const project = bodea();
        const deps = depsFor({
            createComponentWorkspace: jest.fn().mockResolvedValue({ error: 'Quota exceeded (403).' }),
        });

        const result = await relocateGroup(project, group(project), PREVIOUS, deps);

        expect(result).toMatchObject({ released: false, failed: { id: 'erp-integration' } });
        expect(result.failed?.error).toContain('Quota exceeded');
        expect(deps.uninstallAppManagement).not.toHaveBeenCalled();
        expect(project.appBuilderComponents?.['erp-integration']?.workspace).toEqual(OLD_WS);
    });

    it('reports a deploy that fails after the old side is gone, naming the component', async () => {
        const project = bodea();
        mockDeploy.mockImplementation(async (_p: Project, id: string) =>
            id === 'erp-integration' ? { success: false, error: 'boom' } : { success: true },
        );

        const result = await relocateGroup(project, group(project), PREVIOUS, depsFor());

        expect(result).toEqual({
            moved: ['demo-erp'],
            released: true,
            failed: { id: 'erp-integration', error: 'boom' },
        });
    });
});
