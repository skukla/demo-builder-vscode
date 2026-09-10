/**
 * scopedStateManager — the connection-scoped facade's two load-bearing rules:
 * reads load the SCOPED project fresh from disk without moving the pointer,
 * and saves NEVER flip the pointer (they route to saveProjectConfigOnly).
 *
 * The mock asserts the ARGUMENTS the real manager receives — a facade whose
 * whole job is which-method-with-which-flags is exactly the case the
 * assert-the-argument rule exists for.
 */

import { createScopedStateManager } from '@/features/ai/server/scopedStateManager';
import { createMockProject } from '../../../helpers/projectFake';
import { createMockStateManager } from '../../../helpers/stateManagerFake';

const SCOPED_DIR = '/projects/battery-scratch';

function makeReal() {
    return createMockStateManager({
        loadProjectFromPath: jest.fn().mockResolvedValue(createMockProject({ name: 'scratch' })),
        getCurrentProject: jest
            .fn()
            .mockResolvedValue(createMockProject({ name: 'pointer-project' })),
        hasProject: jest.fn().mockReturnValue(true),
    });
}

describe('createScopedStateManager', () => {
    it('getCurrentProject loads the SCOPED path fresh, without persisting', async () => {
        const real = makeReal();
        const scoped = createScopedStateManager(real, SCOPED_DIR);

        const p = await scoped.getCurrentProject();

        expect(p).toEqual(createMockProject({ name: 'scratch' }));
        expect(real.loadProjectFromPath).toHaveBeenCalledWith(SCOPED_DIR, undefined, {
            persistAfterLoad: false,
        });
        // The real pointer read is never consulted on a scoped connection.
        expect(real.getCurrentProject).not.toHaveBeenCalled();
    });

    it('loads per call — a long session must see dashboard-made changes', async () => {
        const real = makeReal();
        const scoped = createScopedStateManager(real, SCOPED_DIR);

        await scoped.getCurrentProject();
        await scoped.getCurrentProject();

        expect(real.loadProjectFromPath).toHaveBeenCalledTimes(2);
    });

    it('saveProject routes to saveProjectConfigOnly — the pointer NEVER flips', async () => {
        const real = makeReal();
        const scoped = createScopedStateManager(real, SCOPED_DIR);
        const project = createMockProject({ name: 'scratch', path: SCOPED_DIR });

        await scoped.saveProject(project);

        expect(real.saveProjectConfigOnly).toHaveBeenCalledWith(project);
        // The pointer-flipping save must never run from a scoped connection.
        expect(real.saveProject).not.toHaveBeenCalled();
    });

    it('everything else delegates to the real manager (prototype chain)', () => {
        const real = makeReal();
        const scoped = createScopedStateManager(real, SCOPED_DIR);

        expect(
            (scoped as unknown as { hasProject: () => boolean }).hasProject(),
        ).toBe(true);
        expect((real as unknown as { hasProject: jest.Mock }).hasProject).toHaveBeenCalled();
    });
});
