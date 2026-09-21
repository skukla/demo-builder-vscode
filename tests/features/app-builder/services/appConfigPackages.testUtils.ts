/**
 * Shared setup for the appConfigPackages family: the file-system wall.
 *
 * appConfigPackages reads `app.config.yaml` and each extension's `$include`d
 * file, and writes the isolated config back. Both suites answer those reads
 * from queued fixtures, so both need `fs.promises` replaced the same way.
 *
 * IMPORT THIS BEFORE appConfigPackages: `jest.mock` hoists above the imports of
 * the module it appears in, not across modules. Pinned by
 * `tests/sop/mock-wall-import-order.test.ts`.
 */

import { promises as fsPromises } from 'fs';

jest.mock('fs', () => ({ promises: { readFile: jest.fn(), writeFile: jest.fn() } }));

/** The config reads, answered in order with `mockResolvedValueOnce`. */
export const mockRead = fsPromises.readFile as jest.Mock;
/** The isolated-config write. */
export const mockWrite = fsPromises.writeFile as jest.Mock;
