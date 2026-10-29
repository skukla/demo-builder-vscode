/**
 * A project rename follows into the demo's own pack (datapack-engine step 07): the pack's
 * display name is the project's until the SC renames the pack themselves. The project
 * records the new name, and every version the library lists as the SC's is renamed there,
 * best effort: the project rename has already succeeded and nothing here undoes it.
 */

import { followRenameIntoPack, type PackRenameStore } from '@/features/projects-dashboard/services/demoPackRename';
import type { Project } from '@/types/base';
import type { HandlerContext } from '@/types/handlers';
import { createMockHandlerContext } from '../../../helpers/handlerContextTestHelpers';
import { createMockLogger } from '../../../helpers/loggerFake';
import { createMockProject } from '../../../helpers/projectFake';
import { createMockStateManager } from '../../../helpers/stateManagerFake';

const VERSIONS = [
    { name: 'acme-demo-1a2b3c', version: '20261028-090000' },
    { name: 'acme-demo-1a2b3c', version: '20261029-183005' },
];

function store(over: Partial<PackRenameStore> = {}): jest.Mocked<PackRenameStore> {
    return {
        list: jest.fn().mockResolvedValue(VERSIONS),
        rename: jest.fn().mockResolvedValue('updated'),
        ...over,
    } as jest.Mocked<PackRenameStore>;
}

function renamed(over: Partial<Project> = {}): Project {
    return createMockProject({
        name: 'acme-q4',
        title: 'Acme Q4',
        path: '/p/acme-q4',
        ownDatapack: { name: 'acme-demo-1a2b3c', displayName: 'Acme Demo' },
        ...over,
    });
}

function harness(): HandlerContext {
    return createMockHandlerContext({
        stateManager: createMockStateManager({ saveProjectConfigOnly: jest.fn().mockResolvedValue(undefined) }),
        logger: createMockLogger() as unknown as HandlerContext['logger'],
    });
}

describe('followRenameIntoPack', () => {
    it('records the new name on the project and renames every version in the library', async () => {
        const ctx = harness();
        const library = store();
        const project = renamed();

        await followRenameIntoPack(ctx, project, async () => library);

        expect(project.ownDatapack).toEqual({ name: 'acme-demo-1a2b3c', displayName: 'Acme Q4' });
        expect(ctx.stateManager.saveProjectConfigOnly).toHaveBeenCalledWith(project);
        expect(library.list).toHaveBeenCalledWith('acme-demo-1a2b3c');
        expect(library.rename.mock.calls).toEqual([
            [VERSIONS[0], 'Acme Q4'],
            [VERSIONS[1], 'Acme Q4'],
        ]);
    });

    it('leaves a pack the SC renamed themselves', async () => {
        const ctx = harness();
        const open = jest.fn();
        const project = renamed({ ownDatapack: { name: 'acme-demo-1a2b3c', displayName: 'My pack', renamed: true } });

        await followRenameIntoPack(ctx, project, open);

        expect(project.ownDatapack?.displayName).toBe('My pack');
        expect(open).not.toHaveBeenCalled();
        expect(ctx.stateManager.saveProjectConfigOnly).not.toHaveBeenCalled();
    });

    it('does nothing for a project with no pack of its own', async () => {
        const ctx = harness();
        const open = jest.fn();

        await followRenameIntoPack(ctx, renamed({ ownDatapack: undefined }), open);

        expect(open).not.toHaveBeenCalled();
    });

    it('does nothing when the name has not changed', async () => {
        const open = jest.fn();

        await followRenameIntoPack(harness(), renamed({ ownDatapack: { name: 'acme-demo-1a2b3c', displayName: 'Acme Q4' } }), open);

        expect(open).not.toHaveBeenCalled();
    });

    it('never throws, and logs one line, when the library cannot be reached or refuses', async () => {
        const ctx = harness();
        const project = renamed();

        await expect(followRenameIntoPack(ctx, project, async () => ({ refusal: 'library off' }))).resolves.toBeUndefined();
        await expect(
            followRenameIntoPack(ctx, renamed(), async () => store({ rename: jest.fn().mockRejectedValue(new Error('no')) })),
        ).resolves.toBeUndefined();

        expect(project.ownDatapack?.displayName).toBe('Acme Q4');
        // One line each, never a throw; the wording is the log's own business.
        expect(ctx.logger.warn).toHaveBeenCalledTimes(2);
    });
});
