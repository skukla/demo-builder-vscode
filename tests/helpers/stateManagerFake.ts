/**
 * A state-manager fake that answers `getCurrentProject` (ADR-016 § Fixtures).
 *
 * Two suites defined this identically, differing only in how loosely they typed
 * the project argument (`Partial<Project> | null` vs
 * `Record<string, unknown> | null`). The narrower type is canonical — a fixture
 * that accepts any object is a fixture that cannot tell you when you passed the
 * wrong shape.
 */

import type { Project } from '@/types';

/** The one method these fakes stand in for. */
export interface MockStateManager {
    getCurrentProject: jest.Mock;
}

/** @param project - what `getCurrentProject` resolves to; `null` for "no project". */
export function makeStateManager(project: Partial<Project> | null): MockStateManager {
    return { getCurrentProject: jest.fn().mockResolvedValue(project) };
}
