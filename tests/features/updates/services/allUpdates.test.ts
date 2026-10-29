/**
 * allUpdates.findAllUpdates — the extension and every project, checked once (PL-80).
 *
 * A check must never write a project file, so every project is read with
 * `persistAfterLoad: false`; the count includes the extension's own update.
 */

import { findAllUpdates } from '@/features/updates/services/allUpdates';
import type { IntegrationUpdateProbe } from '@/features/updates/services/integrationUpdates';
import type { UpdateSelections } from '@/features/updates/services/updateSelections';
import { createMockHandlerContext } from '../../../helpers/handlerContextTestHelpers';
import { createMockProject } from '../../../helpers/projectFake';

const mockCheckExtensionUpdate = jest.fn();
const mockComputeUpdateSelections = jest.fn();
jest.mock('@/features/updates/services/updateManager', () => ({
    UpdateManager: jest.fn().mockImplementation(() => ({ checkExtensionUpdate: mockCheckExtensionUpdate })),
}));
jest.mock('@/features/updates/services/updateSelections', () => ({
    ...jest.requireActual('@/features/updates/services/updateSelections'),
    computeUpdateSelections: (...args: unknown[]) => mockComputeUpdateSelections(...args),
}));

const probe: IntegrationUpdateProbe = { check: jest.fn(), inOtherOrg: jest.fn(), catalog: [] };
const alpha = createMockProject({ name: 'alpha', path: '/p/alpha' });
const beta = createMockProject({ name: 'beta', path: '/p/beta' });

function contextWith(projects: Array<ReturnType<typeof createMockProject>>) {
    const ctx = createMockHandlerContext();
    ctx.stateManager.getAllProjects = jest.fn().mockResolvedValue(projects.map((p) => ({ path: p.path, name: p.name })));
    ctx.stateManager.loadProjectFromPath = jest.fn(async (path: string) => projects.find((p) => p.path === path) ?? null);
    ctx.stateManager.getCurrentProject = jest.fn().mockResolvedValue(beta);
    return ctx;
}

const oneTemplate = (project: ReturnType<typeof createMockProject>): UpdateSelections => ({
    forkSync: [],
    template: [{ project }],
    boilerplate: [],
    finish: [],
    component: [],
    adobeMcp: [],
    blockLibrary: [],
    blockLibraryInstall: [],
    inspector: [],
    integration: [],
});

beforeEach(() => jest.clearAllMocks());

describe('findAllUpdates', () => {
    it('reads every project without saving it, and checks them together', async () => {
        const ctx = contextWith([alpha, beta]);
        mockCheckExtensionUpdate.mockResolvedValue({ hasUpdate: false, current: '1', latest: '1' });
        mockComputeUpdateSelections.mockResolvedValue(oneTemplate(alpha));

        const found = await findAllUpdates(ctx, probe);

        expect(ctx.stateManager.loadProjectFromPath).toHaveBeenCalledWith('/p/alpha', undefined, { persistAfterLoad: false });
        expect(ctx.stateManager.loadProjectFromPath).toHaveBeenCalledWith('/p/beta', undefined, { persistAfterLoad: false });
        expect(mockComputeUpdateSelections).toHaveBeenCalledWith([alpha, beta], ctx, probe);
        expect(found).toMatchObject({ currentProjectPath: '/p/beta', count: 1 });
        expect(found.extension).toBeUndefined();
    });

    it("counts the extension's own update and keeps it", async () => {
        const update = { hasUpdate: true, current: '1.0.0', latest: '1.1.0' };
        mockCheckExtensionUpdate.mockResolvedValue(update);
        mockComputeUpdateSelections.mockResolvedValue(oneTemplate(alpha));

        const found = await findAllUpdates(contextWith([alpha]), probe);

        expect(found.extension).toEqual(update);
        expect(found.count).toBe(2);
    });

    it('skips a project whose file cannot be read', async () => {
        const ctx = contextWith([alpha]);
        ctx.stateManager.getAllProjects = jest.fn().mockResolvedValue([{ path: '/p/gone', name: 'gone' }, { path: '/p/alpha', name: 'alpha' }]);
        mockCheckExtensionUpdate.mockResolvedValue({ hasUpdate: false, current: '1', latest: '1' });
        mockComputeUpdateSelections.mockResolvedValue(oneTemplate(alpha));

        await findAllUpdates(ctx, probe);

        expect(mockComputeUpdateSelections).toHaveBeenCalledWith([alpha], ctx, probe);
    });
});
