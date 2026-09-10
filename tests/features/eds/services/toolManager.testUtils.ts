/**
 * ToolManager — shared test fixtures.
 *
 * The two suites in this family (`toolManager.test.ts` for the happy paths,
 * `toolManager-decisions.test.ts` for the argument-level decisions) both need the
 * same three things: where the manager puts things on disk, a credential set that
 * passes validation, and a shell result typed to the real contract.
 *
 * The `jest.mock` preambles deliberately stay in each suite. A `jest.mock` hoists
 * only above the imports of the file it appears in, so a factory moved here would
 * register after the subject is loaded.
 *
 * NOTE: `*.testUtils.ts` (not `*.test.ts`) so Jest does not treat it as a suite.
 */

import type { CommandResult } from '@/core/shell/types';
import type { ACOConfig } from '@/features/eds/services/types';

/** The home directory both suites make `os.homedir()` answer with. */
export const MOCK_HOME = '/Users/testuser';

/** Where ToolManager's constructor lands, given that home. */
export const TOOLS_BASE_PATH = `${MOCK_HOME}/.demo-builder/tools`;
export const TOOL_PATH = `${TOOLS_BASE_PATH}/commerce-demo-ingestion`;
export const DATA_REPO_PATH = `${TOOLS_BASE_PATH}/vertical-data-citisignal`;

/** A credential set that passes every guard in `validateAcoConfig`. */
export function validAcoConfig(overrides: Partial<ACOConfig> = {}): ACOConfig {
    return {
        apiUrl: 'https://aco.example.com/api',
        apiKey: 'test-api-key-12345',
        tenantId: 'test-tenant-123',
        environmentId: 'test-env-456',
        ...overrides,
    };
}

/**
 * A shell result typed to the REAL `CommandResult`, so a suite cannot invent a
 * field the executor never returns (ADR-016 rule 3). Defaults to success.
 */
export function commandResult(overrides: Partial<CommandResult> = {}): CommandResult {
    return { code: 0, stdout: '', stderr: '', duration: 1000, ...overrides };
}
