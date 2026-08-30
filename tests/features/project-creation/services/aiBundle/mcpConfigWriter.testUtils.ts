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

import { writeMcpConfigs } from '@/features/project-creation/services/aiBundle/mcpConfigWriter';

jest.mock('fs/promises', () => {
    const writeFile = jest.fn().mockResolvedValue(undefined);
    return {
        lstat: jest.fn().mockRejectedValue(Object.assign(new Error('ENOENT'), { code: 'ENOENT' })),
        realpath: jest.fn(async (p: string) => p),
        mkdir: jest.fn().mockResolvedValue(undefined),
        writeFile,
        readFile: jest.fn().mockRejectedValue(Object.assign(new Error('ENOENT'), { code: 'ENOENT' })),
        appendFile: jest.fn().mockResolvedValue(undefined),
        // O_NOFOLLOW writes go through open(); the returned handle delegates to
        // the writeFile mock WITH the path, so path-based assertions keep working.
        open: jest.fn(async (p: unknown) => ({
            writeFile: jest.fn(async (d: unknown, e: unknown) => writeFile(p as string, d, e)),
            close: jest.fn(async () => undefined),
        })),
    };
});

export * as fsPromises from 'fs/promises';
export { writeMcpConfigs };
