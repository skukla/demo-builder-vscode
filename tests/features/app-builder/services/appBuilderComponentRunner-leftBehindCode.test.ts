/**
 * An app deploy deletes the code it left behind.
 *
 * `aio app deploy` never deletes an action the app stopped declaring: on 2026-09-27 the
 * ERP integration's order column moved from `erp/order-grid` to `admin-ui/order-grid` and
 * the old action stayed deployed. So every app deploy — add and redeploy — ends by asking
 * `deleteUndeclaredActions` (its own suite pins what it deletes). These pin that the runner
 * asks, with which folders, and that what could not be deleted reaches the SC as a warning.
 */

import { mockWithOrgContext } from './appBuilderComponentRunner.orgContextMock';

jest.setTimeout(5000);

const mockDetectAppLayout = jest.fn().mockResolvedValue('standalone');
jest.mock('@/features/app-builder/services/appConfigPackages', () => ({
    listDeclaredPackageNames: jest.fn().mockResolvedValue([]),
    listDeclaredExtensionPoints: jest.fn().mockResolvedValue([]),
    listDeclaredTriggersAndRules: jest.fn().mockResolvedValue({ triggers: [], rules: [] }),
    detectAppLayout: (...args: unknown[]) => mockDetectAppLayout(...args),
}));

import { addAppBuilderComponent } from '@/features/app-builder/services/appBuilderAddRun';
import { deployAppBuilderComponent } from '@/features/app-builder/services/appBuilderRedeployRun';
import {
    INTEGRATION_ENTRY,
    MESH_ENTRY,
    createDeps,
    createProject,
} from './appBuilderComponentRunner.testUtils';

const NOTHING_LEFT = { namespace: 'ns', deleted: [], failed: [] };

beforeEach(() => {
    jest.clearAllMocks();
    mockDetectAppLayout.mockResolvedValue('standalone');
    mockWithOrgContext.mockImplementation((_target: unknown, fn: () => Promise<unknown>) => fn());
});

describe('an app deploy', () => {
    it("asks for the left-behind code to be deleted, in the app's own folder", async () => {
        const deleteUndeclaredActions = jest.fn(async () => NOTHING_LEFT);
        const project = createProject();
        await addAppBuilderComponent(project, INTEGRATION_ENTRY, createDeps());
        const folder = project.componentInstances?.[INTEGRATION_ENTRY.id]?.path;

        const result = await deployAppBuilderComponent(
            project,
            INTEGRATION_ENTRY.id,
            createDeps({ deleteUndeclaredActions }),
        );

        expect(result).toEqual({ success: true });
        expect(deleteUndeclaredActions).toHaveBeenCalledWith([folder]);
    });

    it('an add into a workspace it joined asks too', async () => {
        const deleteUndeclaredActions = jest.fn(async () => NOTHING_LEFT);

        await addAppBuilderComponent(createProject(), INTEGRATION_ENTRY, createDeps({ deleteUndeclaredActions }));

        expect(deleteUndeclaredActions).toHaveBeenCalledTimes(1);
    });

    // AB-80. A workspace this add made moments earlier holds nothing to leave behind,
    // and the check cost a new app about 16 seconds of waiting for nothing (owner,
    // 2026-10-17). It still runs when the add joins a workspace that already exists.
    it('an add into a workspace it just made does not look for left-behind code', async () => {
        const deleteUndeclaredActions = jest.fn(async () => NOTHING_LEFT);
        const deps = createDeps({ deleteUndeclaredActions });
        deps.createComponentWorkspace = jest.fn(async (_project, _entry, onMaking) => {
            onMaking?.();
            return undefined;
        });

        const result = await addAppBuilderComponent(createProject(), INTEGRATION_ENTRY, deps);

        expect(result).toMatchObject({ success: true });
        expect(deleteUndeclaredActions).not.toHaveBeenCalled();
    });

    // A new app has nothing left behind, and the line said "Deleting" on its first
    // deploy (owner, 2026-10-17). It says what the step does: it looks first.
    it('says it is checking for left-behind code, not that it is deleting it', async () => {
        const lines: Array<string | undefined> = [];
        const deps = createDeps({ deleteUndeclaredActions: jest.fn(async () => NOTHING_LEFT) });
        deps.onProgress = (_stage: string, line?: string) => lines.push(line);

        await addAppBuilderComponent(createProject(), INTEGRATION_ENTRY, deps);

        expect(lines).toContain('Looking for old code to remove');
        expect(lines).not.toContain('Deleting code the app no longer declares');
    });

    it('stands, and warns by name, when some of it could not be deleted', async () => {
        const deleteUndeclaredActions = jest.fn(async () => ({
            namespace: 'ns',
            deleted: [],
            failed: ['erp/order-grid'],
        }));

        const result = await addAppBuilderComponent(
            createProject(),
            INTEGRATION_ENTRY,
            createDeps({ deleteUndeclaredActions }),
        );

        expect(result.success).toBe(true);
        expect(result.warnings).toEqual(['Code the app no longer uses is still deployed: erp/order-grid.']);
    });

    it('warns when the namespace could not be checked, rather than saying nothing', async () => {
        const deleteUndeclaredActions = jest.fn(async () => ({
            deleted: [],
            failed: [],
            note: 'Could not check the namespace for code left behind.',
        }));

        const result = await addAppBuilderComponent(
            createProject(),
            INTEGRATION_ENTRY,
            createDeps({ deleteUndeclaredActions }),
        );

        expect(result.warnings).toEqual(['Could not check the namespace for code left behind.']);
    });
});

describe('a mesh deploy', () => {
    it('has no Runtime actions of its own and asks nothing', async () => {
        const deleteUndeclaredActions = jest.fn(async () => NOTHING_LEFT);

        await addAppBuilderComponent(createProject(), MESH_ENTRY, createDeps({ deleteUndeclaredActions }));

        expect(deleteUndeclaredActions).not.toHaveBeenCalled();
    });
});
