/**
 * AdobeConsoleProjectOps.createWorkspace — the name Console shows on the box.
 *
 * Console's workspace boxes show the machine NAME, not the title, so a random
 * ending on every name put "ProductionKnDo" and "erpintegrationlHJE" in front of
 * the SC (owner, 2026-09-21). A name is now the title unless the project already
 * has it, with everything but letters and digits dropped. Adobe refuses a space
 * (`400 "Workspace name allows only alpha numeric values"`) and accepts a dash, but a
 * dashed name's Runtime namespace refuses every deploy ("Non-standard namespace
 * formats are not supported after aio-cli v10"; measured 2026-09-22).
 */

import { DeletedWorkspaceNames, NAME_REST_MS } from '@/features/authentication/services/deletedWorkspaceNames';
import { TARGET, opsWith as buildOps, workspace } from './adobeConsoleProjectOps.testUtils';

const CONFLICT = new Error('[CoreConsoleAPISDK:ERROR_CREATE_WORKSPACE] 409 - Conflict');

const opsWith = (createWorkspace: jest.Mock, listWorkspaces: jest.Mock) =>
    buildOps(
        { createWorkspace, createRuntimeNamespace: jest.fn().mockResolvedValue({ body: {} }) },
        listWorkspaces,
    );

/** The machine name of the Nth create call. */
const sentName = (create: jest.Mock, call = 0) => (create.mock.calls[call][2] as { name: string }).name;

describe('the name a new workspace is given', () => {
    it('is the letters and digits of the title, when the project has no workspace by that name', async () => {
        const create = jest.fn().mockResolvedValue({ body: { workspaceId: 'ws-new' } });
        const ops = opsWith(create, jest.fn().mockResolvedValue([workspace('Production')]));

        const result = await ops.createWorkspace('Northwind ERP', 'd', TARGET);

        expect(sentName(create)).toBe('NorthwindERP');
        expect(result).toEqual({ id: 'ws-new', name: 'NorthwindERP', title: 'Northwind ERP' });
    });

    it('is numbered when the project already has that name', async () => {
        const create = jest.fn().mockResolvedValue({ body: { workspaceId: 'ws-new' } });
        const ops = opsWith(create, jest.fn().mockResolvedValue([workspace('NorthwindERP')]));

        await ops.createWorkspace('Northwind ERP', 'd', TARGET);

        expect(sentName(create)).toBe('NorthwindERP1');
    });

    it('carries a random ending when the names in use cannot be read', async () => {
        const create = jest.fn().mockResolvedValue({ body: { workspaceId: 'ws-new' } });
        const ops = opsWith(create, jest.fn().mockRejectedValue(new Error('503')));

        await ops.createWorkspace('Northwind ERP', 'd', TARGET);

        expect(sentName(create)).toMatch(/^NorthwindERP[A-Za-z0-9]{4}$/);
    });

    // The list cannot show a name Adobe still holds for some other reason, so a
    // clash on the bare name gets one more try with the ending.
    it('tries once more with a random ending when Adobe says the name clashes', async () => {
        const create = jest
            .fn()
            .mockRejectedValueOnce(CONFLICT)
            .mockResolvedValue({ body: { workspaceId: 'ws-new' } });
        const ops = opsWith(create, jest.fn().mockResolvedValue([]));

        const result = await ops.createWorkspace('Northwind ERP', 'd', TARGET);

        expect(create).toHaveBeenCalledTimes(2);
        expect(sentName(create, 1)).toMatch(/^NorthwindERP[A-Za-z0-9]{4}$/);
        expect(result).toMatchObject({ id: 'ws-new', title: 'Northwind ERP' });
    });

    it('does not retry any other refusal', async () => {
        const create = jest.fn().mockRejectedValue(new Error('403 - Forbidden'));
        const ops = opsWith(create, jest.fn().mockResolvedValue([]));

        await expect(ops.createWorkspace('Northwind ERP', 'd', TARGET)).resolves.toEqual({
            error: '403 - Forbidden',
        });
        expect(create).toHaveBeenCalledTimes(1);
    });

    // 2026-10-05: Console took "Multi-ERP Integration", then `aio app use` refused the
    // workspace's config because its title had a dash.
    it('is sent with a title aio will accept back', async () => {
        const create = jest.fn().mockResolvedValue({ body: { workspaceId: 'ws-new' } });
        const ops = opsWith(create, jest.fn().mockResolvedValue([]));

        const result = await ops.createWorkspace('Multi-ERP Integration', 'd', TARGET);

        expect((create.mock.calls[0][2] as { title: string }).title).toBe('Multi ERP Integration');
        expect(result).toMatchObject({ name: 'MultiERPIntegration', title: 'Multi ERP Integration' });
    });
});

// 2026-10-05: an ERP removed and added again three minutes later got the same
// workspace name, so the same Runtime namespace, and its deploy failed on the timer
// with a 401 while Adobe was still tearing the old namespace down.
describe('a name deleted moments ago', () => {
    const DELETED_AT = 1_000_000;

    function opsAfterDeleting(name: string, now: () => number) {
        const deletedNames = new DeletedWorkspaceNames(undefined, now);
        const create = jest.fn().mockResolvedValue({ body: { workspaceId: 'ws-new' } });
        const ops = buildOps(
            {
                deleteWorkspace: jest.fn().mockResolvedValue({}),
                createWorkspace: create,
                createRuntimeNamespace: jest.fn().mockResolvedValue({ body: {} }),
            },
            jest.fn().mockResolvedValue([workspace('Production')]),
            deletedNames,
        );
        return { ops, create, remove: () => ops.deleteWorkspace('ws-old', { ...TARGET, workspaceName: name }) };
    }

    it('is numbered, though the project no longer lists it', async () => {
        let now = DELETED_AT;
        const { ops, create, remove } = opsAfterDeleting('JustriteERP', () => now);
        await remove();
        now += 3 * 60_000;

        await ops.createWorkspace('Justrite ERP', 'd', TARGET);

        expect(sentName(create)).toBe('JustriteERP1');
    });

    it('is given out again once it has rested', async () => {
        let now = DELETED_AT;
        const { ops, create, remove } = opsAfterDeleting('JustriteERP', () => now);
        await remove();
        now += NAME_REST_MS + 1;

        await ops.createWorkspace('Justrite ERP', 'd', TARGET);

        expect(sentName(create)).toBe('JustriteERP');
    });

    it('holds only in the project it was deleted from', async () => {
        const { ops, create, remove } = opsAfterDeleting('JustriteERP', () => DELETED_AT);
        await remove();

        await ops.createWorkspace('Justrite ERP', 'd', { ...TARGET, projectId: 'proj-2' });

        expect(sentName(create)).toBe('JustriteERP');
    });
});
