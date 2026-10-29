/**
 * A removal reads the registry for the component's Commerce Admin registration, and
 * believes only a re-read (owner, 2026-10-08: "absolutely clean", each step confirmed).
 *
 * `aio app deploy` publishes an app's extension points on its workspace in Adobe's
 * registry — the Admin UI SDK registration behind a Commerce grid column — and `aio app
 * undeploy` is what unpublishes them, exit 0 either way. Two deployments of the ERP
 * integration in one Adobe project showed its columns twice on the Justrite sandbox. So
 * after the undeploy the removal lists what the workspace still publishes, unpublishes
 * what the app declared, and reads again; a point still there stops the removal with
 * the card, folder and workspace kept, and the workspace must not take it.
 *
 * Sibling of appBuilderComponentRunner-workspaceTakesLeftovers.test.ts; same preamble.
 */

import { mockWithOrgContext } from './appBuilderComponentRunner.orgContextMock';
import './appBuilderComponentRunner.runtimeMock';
import type { Project } from '@/types/base';
import { ErrorCode } from '@/types/errorCodes';

jest.setTimeout(5000);

const mockListDeclaredExtensionPoints = jest.fn();
jest.mock('@/features/app-builder/services/appConfigPackages', () => ({
    detectAppLayout: jest.fn().mockResolvedValue('extension'),
    listDeclaredPackageNames: jest.fn().mockResolvedValue([]),
    listDeclaredTriggersAndRules: jest.fn().mockResolvedValue({ triggers: [], rules: [] }),
    listDeclaredExtensionPoints: (...a: unknown[]) => mockListDeclaredExtensionPoints(...a),
}));

import { removeAppBuilderComponent } from '@/features/app-builder/services/appBuilderRemoveRun';
import { createDeps, createProject } from './appBuilderComponentRunner.testUtils';
import { ADMIN_UI_POINT, OTHER_POINT } from '../../../helpers/workspaceEndpointsFixtures';

const ID = 'erp-integration';
const OWN = { id: 'ws-own', name: 'ERPIntegration', title: 'ERP Integration' };
const PATH = `/proj/components/${ID}`;

/** The integration, in a workspace of its own unless `workspace` is null. */
function project(workspace: typeof OWN | null = OWN): Project {
    const source = { owner: 'skukla', repo: 'commerce-erp-integration' };
    return createProject({
        componentInstances: {
            [ID]: { id: ID, name: 'ERP Integration', type: 'app-builder', subType: 'app', status: 'deployed', path: PATH },
        },
        appBuilderComponents: {
            [ID]: { kind: 'integration', status: 'deployed', source, ...(workspace ? { workspace } : {}) },
        },
    });
}

/** The registry deps: what the workspace publishes, and what a re-read after the unpublish holds. */
function registry(published: string[], afterRemoval: string[] = []) {
    return {
        workspaceExtensionPointsOf: jest.fn(async () => published),
        removeWorkspaceExtensionPoints: jest.fn(async () => afterRemoval),
    };
}

beforeEach(() => {
    jest.clearAllMocks();
    mockWithOrgContext.mockImplementation((_target: unknown, fn: () => Promise<unknown>) => fn());
    mockListDeclaredExtensionPoints.mockResolvedValue([ADMIN_UI_POINT]);
});

describe('the registration is still published after the undeploy', () => {
    it('unpublishes the declared point, re-reads it gone, and finishes — saying so', async () => {
        const reg = registry([ADMIN_UI_POINT, OTHER_POINT], [OTHER_POINT]);
        const deps = createDeps(reg);
        const p = project();

        const result = await removeAppBuilderComponent(p, ID, deps);

        expect(mockListDeclaredExtensionPoints).toHaveBeenCalledWith(PATH);
        expect(reg.workspaceExtensionPointsOf).toHaveBeenCalledWith(p, OWN);
        // Only the app's own point goes; the other point in the workspace stays.
        expect(reg.removeWorkspaceExtensionPoints).toHaveBeenCalledWith(p, OWN, [ADMIN_UI_POINT]);
        expect(result.success).toBe(true);
        expect(result.runtimeCleanup?.note).toBe(
            'Its Commerce Admin registration was still published and was removed.',
        );
        expect(deps.deleteComponentWorkspace).toHaveBeenCalledWith(expect.anything(), OWN);
    });

    it('stops when the re-read still holds it: nothing cleared, the workspace kept', async () => {
        const reg = registry([ADMIN_UI_POINT], [ADMIN_UI_POINT]);
        const deps = createDeps(reg);

        const result = await removeAppBuilderComponent(project(), ID, deps);

        expect(result).toMatchObject({ success: false, code: ErrorCode.COMPONENT_REMOVAL_STOPPED });
        expect(result.error).toContain('Commerce Admin registration (commerce/backend-ui/1)');
        expect(result.error).toContain('is still published');
        expect(result.runtimeCleanup?.note).toBe('Its Commerce Admin registration is still published.');
        expect(result.runtimeCleanup?.goneWithWorkspace).toBeUndefined();
        expect(deps.componentManager.removeComponent).not.toHaveBeenCalled();
        expect(deps.deleteComponentWorkspace).not.toHaveBeenCalled();
        const saved = deps.saveProject.mock.calls.at(-1)?.[0] as Project;
        expect(saved.appBuilderComponents?.[ID]).toBeDefined();
        expect(saved.appBuilderComponents?.[ID]?.removalStopped).toBe(result.error);
    });

    it('Remove anyway goes on past a registration Adobe kept', async () => {
        const reg = registry([ADMIN_UI_POINT], [ADMIN_UI_POINT]);
        const deps = createDeps(reg);

        const result = await removeAppBuilderComponent(project(), ID, deps, { force: true });

        expect(result.success).toBe(true);
        expect(deps.componentManager.removeComponent).toHaveBeenCalled();
        expect(deps.deleteComponentWorkspace).toHaveBeenCalledWith(expect.anything(), OWN);
    });

    it("stops, with Adobe's reason, when the unpublish itself is refused", async () => {
        const deps = createDeps({
            workspaceExtensionPointsOf: jest.fn(async () => [ADMIN_UI_POINT]),
            removeWorkspaceExtensionPoints: jest.fn(async () => ({ error: '403 - Forbidden' })),
        });

        const result = await removeAppBuilderComponent(project(), ID, deps);

        expect(result).toMatchObject({ success: false, code: ErrorCode.COMPONENT_REMOVAL_STOPPED });
        expect(result.error).toContain('is still published (403 - Forbidden)');
        expect(deps.componentManager.removeComponent).not.toHaveBeenCalled();
    });
});

describe('the registration cannot be read', () => {
    it('stops rather than assume it is gone', async () => {
        const deps = createDeps({
            workspaceExtensionPointsOf: jest.fn(async () => ({ error: '503 - Service Unavailable' })),
            removeWorkspaceExtensionPoints: jest.fn(),
        });

        const result = await removeAppBuilderComponent(project(), ID, deps);

        expect(result).toMatchObject({ success: false, code: ErrorCode.COMPONENT_REMOVAL_STOPPED });
        expect(result.error).toContain('could not be checked (503 - Service Unavailable)');
        expect(deps.removeWorkspaceExtensionPoints).not.toHaveBeenCalled();
        expect(deps.deleteComponentWorkspace).not.toHaveBeenCalled();
    });
});

describe('nothing to look for', () => {
    it('reads the registry and finishes without an unpublish when the point is already gone', async () => {
        const reg = registry([OTHER_POINT]);
        const deps = createDeps(reg);

        const result = await removeAppBuilderComponent(project(), ID, deps);

        expect(result.success).toBe(true);
        expect(reg.removeWorkspaceExtensionPoints).not.toHaveBeenCalled();
        expect(result.runtimeCleanup?.note).toBeUndefined();
    });

    it('never reaches the registry for a component with no workspace of its own', async () => {
        const reg = registry([ADMIN_UI_POINT]);
        const deps = createDeps(reg);

        const result = await removeAppBuilderComponent(project(null), ID, deps);

        expect(result.success).toBe(true);
        expect(reg.workspaceExtensionPointsOf).not.toHaveBeenCalled();
        expect(reg.removeWorkspaceExtensionPoints).not.toHaveBeenCalled();
    });

    it('never reaches the registry for an app that declares no extension point', async () => {
        mockListDeclaredExtensionPoints.mockResolvedValue([]);
        const reg = registry([ADMIN_UI_POINT]);
        const deps = createDeps(reg);

        const result = await removeAppBuilderComponent(project(), ID, deps);

        expect(result.success).toBe(true);
        expect(reg.workspaceExtensionPointsOf).not.toHaveBeenCalled();
    });

    it('skips the check when the deps do not reach the registry (bare callers)', async () => {
        const deps = createDeps();

        const result = await removeAppBuilderComponent(project(), ID, deps);

        expect(result.success).toBe(true);
        expect(result.runtimeCleanup?.note).toBeUndefined();
    });
});
