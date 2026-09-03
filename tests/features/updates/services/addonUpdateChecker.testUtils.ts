/**
 * Shared setup for the addonUpdateChecker family (ADR-016 / PL-14).
 *
 * No mock wall here on purpose: the two suites fake the GitHub client at DIFFERENT
 * seams (one drives the real client through fetch, one mocks the client), and a
 * shared wall would silently switch one of them. What they DO share is the fixtures —
 * an installed library, a project, and the keyed secret store production reads.
 */

import type { Project } from '@/types/base';
import type { InstalledBlockLibrary } from '@/types/blockLibraries';
import { createMockProject } from '../../../helpers/projectFake';
import { createMockSecretStorage } from '../../../helpers/secretStorageFake';

export function makeLibrary(overrides: Partial<InstalledBlockLibrary> = {}): InstalledBlockLibrary {
    return {
        name: 'Test Library',
        source: { owner: 'acme', repo: 'blocks', branch: 'main' },
        commitSha: 'aaa111',
        blockIds: ['hero', 'footer'],
        installedAt: '2025-01-01T00:00:00Z',
        ...overrides,
    };
}

export function makeProject(overrides: Partial<Project> = {}): Project {
    return createMockProject({ name: 'test-project', ...overrides });
}

/**
 * Keyed store rather than a blanket `get`: production reads `githubToken`, and a
 * fake that answers to every key cannot notice if that name changes.
 */
export function makeCheckerSecrets(): ReturnType<typeof createMockSecretStorage>['secrets'] {
    return createMockSecretStorage({ githubToken: 'fake-github-token' }).secrets;
}
