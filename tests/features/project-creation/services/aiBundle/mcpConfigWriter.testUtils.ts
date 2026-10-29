/**
 * Shared setup for the mcpConfigWriter suites — THE AGREED PART ONLY.
 *
 * This family does NOT agree about how to fake all of its dependencies, and
 * picking a winner would change what some suites exercise while every one of
 * them stayed green. So only the mocks that EVERY spec already declared
 * IDENTICALLY were moved here. Each spec keeps its own disputed mocks inline,
 * and therefore ends up with exactly the set it started with.
 *
 * Moved here (all specs agreed): fs/promises
 * Left inline (specs disagree):  @/core/logging
 *
 * Extracted 2026-08-30 (lane C2). Resolving the disputed ones is a separate
 * decision, deliberately not taken here.
 */

import { fsPromises } from './aiBundleFsMock';

/**
 * Where fnm is, for the ai-defaults launch line (AI-13). Faked for every spec so
 * no suite reads the test machine's own fnm: a found fnm turns `node` into
 * `fnm exec --using=24 node`, and a missing one leaves it alone. Defaults to a
 * found fnm; a spec sets `mockFindFnmPath.mockReturnValue(null)` for the other.
 */
export const FAKE_FNM = '/fake/bin/fnm';
export const mockFindFnmPath = jest.fn((): string | null => FAKE_FNM);
jest.mock('@/core/shell/environmentSetup', () => ({
    EnvironmentSetup: jest.fn().mockImplementation(() => ({ findFnmPath: () => mockFindFnmPath() })),
}));

// Below the mocks on purpose: the SUT must bind to them (webview-test-authoring §3).
import { writeMcpConfigs } from '@/features/project-creation/services/aiBundle/mcpConfigWriter';

export { writeMcpConfigs };

/**
 * THE ONE THING THIS FAMILY DOES NOT SHARE with the directory's `fs/promises`
 * wall: a `readFile` that REJECTS with ENOENT rather than resolving undefined.
 *
 * `writeMcpConfigs` appends to `.gitignore`, and it reads the existing file
 * first. Resolving undefined makes it call `.split` on undefined and throw;
 * rejecting ENOENT is how it learns there is no `.gitignore` yet. That is
 * behaviour, not a key set, and it is why this one line stays here instead of
 * moving into the shared wall where five other suites would inherit a rejecting
 * read they never asked for. Set once at module load: no suite in this family
 * calls `jest.resetAllMocks`, and `clearAllMocks` clears calls rather than
 * implementations.
 */
(fsPromises.readFile as jest.Mock).mockRejectedValue(
    Object.assign(new Error('ENOENT'), { code: 'ENOENT' })
);

export { fsPromises };
