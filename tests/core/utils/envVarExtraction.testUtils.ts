/**
 * Shared harness for the `envVarExtraction` suite family.
 *
 * Both suites mock the same two filesystem modules and then feed the subject a
 * string. The factories may live here because this file also owns the SUBJECT
 * import — `babel-plugin-jest-hoist` lifts `jest.mock` above the imports of the
 * module it appears in, so a spec importing `extractEnvVars` from here gets the
 * mocked readers and one importing it directly would not
 * (`.claude/skills/webview-test-authoring/` §3).
 */

import * as fsPromises from 'fs/promises';
import * as fs from 'fs';

jest.mock('fs/promises');
jest.mock('fs');

// Below the mocks on purpose. `import/first` is NOT a registered rule in
// eslint.config.mjs — do not add a disable comment for it, that itself errors.
import { extractEnvVars, extractEnvVarsSync } from '@/core/utils/envVarExtraction';

export { extractEnvVars, extractEnvVarsSync };

export const readFileMock = fsPromises.readFile as jest.Mock;
export const readFileSyncMock = fs.readFileSync as jest.Mock;

/** The path every spec pretends to read. */
export const ENV_PATH = '/path/to/.env';

/** Parse `content` as if it were the project's .env file. */
export function parseEnv(content: string): Promise<Record<string, string>> {
    readFileMock.mockResolvedValue(content);
    return extractEnvVars(ENV_PATH);
}

/** The same, through the synchronous reader. */
export function parseEnvSync(content: string): Record<string, string> {
    readFileSyncMock.mockReturnValue(content);
    return extractEnvVarsSync(ENV_PATH);
}
