import { promises as fsPromises } from 'fs';

/**
 * Shared test utilities for appDeployment tests
 */

export const mockFs = fsPromises as jest.Mocked<typeof fsPromises>;

/** Canonical command-executor fake (ADR-016). */
export { createMockCommandExecutor as createMockCommandManager } from '../../../helpers/commandExecutorFake';

/** Canonical logger fake (ADR-016). Re-exported so existing imports keep working. */
export { createMockLogger } from '../../../helpers/loggerFake';
