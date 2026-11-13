/**
 * The forget step after a datapack's removal (`forgetRemovedPack`, step-05 R1; step 06 C4 review):
 * the project stops naming its pack. The open project is saved from the object handed, which its
 * screens and a reset's `finally` hold. Any other is saved from its manifest as it is on disk NOW,
 * only the pack cleared, so a copy loaded earlier cannot write back what it held.
 */

import { forgetRemovedPack } from '@/features/eds/services/reset/edsResetSampleData';
import type { Project } from '@/types/base';
import type { HandlerContext } from '@/types/handlers';
import { createMockHandlerContext } from '../../../../helpers/handlerContextTestHelpers';
import { createMockProject } from '../../../../helpers/projectFake';
import { createMockStateManager } from '../../../../helpers/stateManagerFake';

const HANDED = createMockProject({ name: 'nb', title: 'Old Title', path: '/nonexistent/projects/nb', datapack: { name: 'nb-pack', version: '1' } });
/** The same project on disk, renamed by another screen since the handed copy was loaded. */
const ON_DISK: Project = { ...HANDED, title: 'New Title' };

function contextWith(current: Project | null) {
    const stateManager = createMockStateManager({
        getCurrentProject: jest.fn().mockResolvedValue(current),
        loadProjectFromPath: jest.fn(async (_path: string): Promise<Project | null> => structuredClone(ON_DISK)),
    });
    return { stateManager, context: createMockHandlerContext({ stateManager }) as HandlerContext };
}

it("saves another project from its manifest on disk, only its pack cleared, never the handed copy's other fields", async () => {
    const handed = structuredClone(HANDED);
    const { stateManager, context } = contextWith(createMockProject({ name: 'open', path: '/nonexistent/projects/open' }));

    expect(await forgetRemovedPack(handed, context)).toBe(true);

    const saved = stateManager.saveProjectConfigOnly.mock.calls.map(([p]) => [p.title, p.datapack]);
    expect(saved).toEqual([['New Title', undefined]]);
    expect(stateManager.saveProject).not.toHaveBeenCalled();
    expect(handed.datapack).toBeUndefined();
});

it('saves the open project from the object handed, which its screens hold', async () => {
    const handed = structuredClone(HANDED);
    const { stateManager, context } = contextWith(handed);

    await forgetRemovedPack(handed, context);

    expect(stateManager.loadProjectFromPath).not.toHaveBeenCalled();
    expect(stateManager.saveProject.mock.calls[0]?.[0]).toBe(handed);
    expect(handed.title).toBe('Old Title');
    expect(handed.datapack).toBeUndefined();
});
