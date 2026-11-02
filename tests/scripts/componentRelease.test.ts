/**
 * The `component-release` skill's checks keep their own tests in a plain Node file, because this
 * repo's jest transform does not parse `.mjs` (the precedent is `focusModule.test.ts`). This makes
 * sure they run with the suite.
 */

import { execFileSync } from 'child_process';
import * as path from 'path';

const TESTS = path.resolve(__dirname, '../../.claude/skills/component-release/releaseChecks.test.mjs');

it('every refusal in the release checks still refuses', () => {
    const output = execFileSync(process.execPath, ['--test', TESTS], { encoding: 'utf8', stdio: 'pipe' });

    expect(output).toMatch(/pass \d+/);
    expect(output).toMatch(/fail 0/);
});
