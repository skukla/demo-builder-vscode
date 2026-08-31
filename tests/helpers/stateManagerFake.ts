/**
 * The canonical StateManager fake, covering the whole interface.
 *
 * WHY IT COVERS ALL 21 MEMBERS, AND WHY THAT IS THE POINT.
 *
 * This helper used to answer exactly one method, `getCurrentProject`. That is why
 * almost nobody used it: measured 2026-08-31, TWO files imported it while FIFTY
 * hand-rolled their own — 102 fakes across 77 files in **22 distinct shapes** for a
 * single collaborator. A builder narrower than the need is not a builder anyone can
 * adopt, and the divergence it was meant to stop grew around it instead.
 *
 * The shapes were not arbitrary. They were the union of whatever each suite
 * happened to call: 102 wanted `getCurrentProject`, 33 also `saveProject`, 16
 * `saveProjectConfigOnly`, then a long tail. Covering the interface makes every one
 * of those a single call with an override.
 *
 * IT IS TYPED TO THE INTERFACE, WHICH CAUGHT A REAL DEFECT. Five members appeared
 * in the hand-rolled fakes that do not exist on StateManager at all — `setState`
 * (9 uses), `getState` (7), `clearState` (6), `addRecentProject` (2) and
 * `getOrganizations` (2). Three are called NOWHERE in `src/`; `getOrganizations`
 * is called ten times but on the authentication service, not this one. They are
 * fakes of methods that were removed, or that never belonged here — 26 members
 * standing in for nothing, invisible because every one sat behind a cast.
 * `jest.Mocked<StateManager>` makes them a compile error.
 *
 * Note there are TWO StateManager types and they are not interchangeable: the
 * interface in `@/types/state` and the class in `@/core/state`. This pins the
 * INTERFACE, which is what consumers declare.
 *
 * @see tests/sop/canonical-fakes.test.ts — the ratchet that stops new hand-rolls
 */

import type { Project } from '@/types';
import type { StateManager } from '@/types/state';

/**
 * A StateManager whose every method is a jest mock.
 *
 * @param overrides - methods to replace. Typed, so a member that is not on
 *   StateManager fails `typecheck:tests` instead of silently faking a method the
 *   real object does not have.
 * @returns the full interface, mocked.
 */
export function createMockStateManager(
    overrides: Partial<jest.Mocked<StateManager>> = {}
): jest.Mocked<StateManager> {
    return {
        initialize: jest.fn().mockResolvedValue(undefined),
        hasProject: jest.fn().mockReturnValue(false),
        getCurrentProject: jest.fn().mockResolvedValue(null),
        saveProject: jest.fn().mockResolvedValue(undefined),
        saveProjectConfigOnly: jest.fn().mockResolvedValue(undefined),
        clearProject: jest.fn().mockResolvedValue(undefined),
        clearAll: jest.fn().mockResolvedValue(undefined),
        addProcess: jest.fn(),
        removeProcess: jest.fn(),
        getProcess: jest.fn().mockReturnValue(undefined),
        getRecentProjects: jest.fn().mockReturnValue([]),
        addToRecentProjects: jest.fn().mockResolvedValue(undefined),
        removeFromRecentProjects: jest.fn().mockResolvedValue(undefined),
        loadProjectFromPath: jest.fn().mockResolvedValue(null),
        getAllProjects: jest.fn().mockResolvedValue([]),
        onProjectChanged: jest.fn(),
        markDirty: jest.fn(),
        isDirty: jest.fn().mockReturnValue(false),
        getDirtyFields: jest.fn().mockReturnValue([]),
        clearDirty: jest.fn(),
        dispose: jest.fn(),
        ...overrides,
    } as unknown as jest.Mocked<StateManager>;
}

/**
 * The previous one-method helper, kept because two suites use it and its shape —
 * "a state manager that resolves THIS project" — is the single most common need.
 *
 * @param project - what `getCurrentProject` resolves to; `null` for "no project".
 */
export function makeStateManager(project: Partial<Project> | null): jest.Mocked<StateManager> {
    return createMockStateManager({
        getCurrentProject: jest.fn().mockResolvedValue(project),
    } as Partial<jest.Mocked<StateManager>>);
}
