/**
 * The check that every owned repository still carries the release process keeps its own tests in a
 * plain Node file, because this repo's jest transform does not parse `.mjs` (the precedent is
 * `focusModule.test.ts`). This makes sure they run with the suite.
 */

import { execFileSync } from 'child_process';
import * as path from 'path';

const TESTS = path.resolve(__dirname, '../../scripts/componentCiChecks.test.mjs');

it('every way a repository can fall short is still caught', () => {
    const output = execFileSync(process.execPath, ['--test', TESTS], { encoding: 'utf8', stdio: 'pipe' });

    expect(output).toMatch(/pass \d+/);
    expect(output).toMatch(/fail 0/);
});
