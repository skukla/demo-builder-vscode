/**
 * Configure persists the store hierarchy it just fetched.
 *
 * The structure is the ONLY place a store code can be turned back into the name
 * the user picked it by. Discovery fetched it and threw it away on every run, so
 * the Integrations flyout — a different webview that never makes this call —
 * could show nothing but codes. Persisting it once makes naming an offline
 * lookup on every surface.
 *
 * The wrapper exists because the underlying handler is ALSO registered by the
 * wizard, where there is no project yet and `getCurrentProject()` would return
 * whatever was last open. These assertions are about the Configure wrapper only.
 */

const mockDiscover = jest.fn();
jest.mock('@/features/eds/handlers/edsHandlers', () => ({
    handleDiscoverStoreStructure: (...args: unknown[]) => mockDiscover(...args),
}));

import { handleDiscoverStoreStructureAndPersist } from '@/features/dashboard/handlers/configureHandlers';
import type { HandlerContext } from '@/types/handlers';
import type { Project } from '@/types/base';
import { createMockStateManager } from '../../../helpers/stateManagerFake';
import { createMockLogger } from '../../../helpers/loggerFake';
import { createMockProject } from '../../../helpers/projectFake';
import { createMockHandlerContext } from '../../../helpers/handlerContextTestHelpers';

const STRUCTURE = {
    websites: [{ id: 2, code: 'citisignal', name: 'CitiSignal' }],
    storeGroups: [],
    storeViews: [],
};

/** Make the mocked handler emit `result` the way the real one does — by SENDING it. */
function discoveryEmits(result: unknown): void {
    mockDiscover.mockImplementation(async (ctx: HandlerContext) => {
        await ctx.sendMessage('store-discovery-result', result);
        return { success: true };
    });
}

function makeContext(project: Project | null) {
    const saveProject = jest.fn().mockResolvedValue(undefined);
    const sendMessage = jest.fn().mockResolvedValue(undefined);
    const context = createMockHandlerContext({
        sendMessage,
        logger: createMockLogger(),
        stateManager: createMockStateManager({
            getCurrentProject: jest.fn().mockResolvedValue(project),
            saveProject,
        }),
    });
    return { context, saveProject, sendMessage };
}

function projectFixture(): Project {
    return createMockProject({ name: 'p', path: '/p' });
}

beforeEach(() => {
    jest.clearAllMocks();
    mockDiscover.mockReset();
});

describe('handleDiscoverStoreStructureAndPersist', () => {
    it('saves the discovered structure onto the current project', async () => {
        const project = projectFixture();
        const { context, saveProject } = makeContext(project);
        discoveryEmits({ success: true, data: STRUCTURE });

        await handleDiscoverStoreStructureAndPersist(context, undefined);

        expect(project.commerceStoreStructure).toEqual(STRUCTURE);
        expect(saveProject).toHaveBeenCalledWith(project);
    });

    it('still forwards the result to the webview', async () => {
        // The picker is the point; persistence is a side benefit and must not
        // swallow the payload the dropdowns are waiting on.
        const { context, sendMessage } = makeContext(projectFixture());
        discoveryEmits({ success: true, data: STRUCTURE });

        await handleDiscoverStoreStructureAndPersist(context, undefined);

        expect(sendMessage).toHaveBeenCalledWith('store-discovery-result', {
            success: true,
            data: STRUCTURE,
        });
    });

    it('persists nothing when discovery failed', async () => {
        const project = projectFixture();
        const { context, saveProject } = makeContext(project);
        discoveryEmits({ success: false, error: 'Commerce unreachable' });

        await handleDiscoverStoreStructureAndPersist(context, undefined);

        expect(project.commerceStoreStructure).toBeUndefined();
        expect(saveProject).not.toHaveBeenCalled();
    });

    it('does not throw when there is no current project', async () => {
        const { context, saveProject } = makeContext(null);
        discoveryEmits({ success: true, data: STRUCTURE });

        await expect(handleDiscoverStoreStructureAndPersist(context, undefined)).resolves.toEqual({
            success: true,
        });
        expect(saveProject).not.toHaveBeenCalled();
    });

    it('survives a save failure — the picker already has its data', async () => {
        // Discovery has succeeded and been sent by this point. Turning a working
        // picker into an error because a write failed would be a bad trade.
        const { context } = makeContext(projectFixture());
        (context.stateManager.saveProject as jest.Mock).mockRejectedValue(new Error('disk full'));
        discoveryEmits({ success: true, data: STRUCTURE });

        await expect(handleDiscoverStoreStructureAndPersist(context, undefined)).resolves.toEqual({
            success: true,
        });
        expect(context.logger.warn).toHaveBeenCalled();
    });
});
