/**
 * AdobeConsoleProjectOps.createWorkspace — the name Console shows on the box.
 *
 * Console's workspace boxes show the machine NAME, not the title, so a random
 * ending on every name put "ProductionKnDo" and "erpintegrationlHJE" in front of
 * the SC (owner, 2026-09-21). A name is now the title unless the project already
 * has it. A space becomes a dash: Adobe answered `400 "Workspace name allows only
 * alpha numeric values"` to "Space Test" yet accepted "Space-Test", whose Runtime
 * namespace answered normally (both measured 2026-09-21).
 */

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
    it('is the title, spaces as dashes, when the project has no workspace by that name', async () => {
        const create = jest.fn().mockResolvedValue({ body: { workspaceId: 'ws-new' } });
        const ops = opsWith(create, jest.fn().mockResolvedValue([workspace('Production')]));

        const result = await ops.createWorkspace('Northwind ERP', 'd', TARGET);

        expect(sentName(create)).toBe('Northwind-ERP');
        expect(result).toEqual({ id: 'ws-new', name: 'Northwind-ERP', title: 'Northwind ERP' });
    });

    it('is numbered when the project already has that name', async () => {
        const create = jest.fn().mockResolvedValue({ body: { workspaceId: 'ws-new' } });
        const ops = opsWith(create, jest.fn().mockResolvedValue([workspace('Northwind-ERP')]));

        await ops.createWorkspace('Northwind ERP', 'd', TARGET);

        expect(sentName(create)).toBe('Northwind-ERP-1');
    });

    it('carries a random ending when the names in use cannot be read', async () => {
        const create = jest.fn().mockResolvedValue({ body: { workspaceId: 'ws-new' } });
        const ops = opsWith(create, jest.fn().mockRejectedValue(new Error('503')));

        await ops.createWorkspace('Northwind ERP', 'd', TARGET);

        expect(sentName(create)).toMatch(/^Northwind-ERP-[A-Za-z0-9]{4}$/);
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
        expect(sentName(create, 1)).toMatch(/^Northwind-ERP-[A-Za-z0-9]{4}$/);
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
});
