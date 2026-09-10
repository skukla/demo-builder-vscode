/**
 * mcpConfigWriter — edit-preserving `.claude/settings.json` merge (on disk).
 *
 * Regenerating AI files must NOT wipe a user's own `.claude/settings.json`
 * (hooks / permissions / env). The writer reads the existing file and MERGES the
 * Demo-Builder git-sync PostToolUse hook in. The merge logic itself
 * (`mergeClaudeSettings` / `generateClaudeSettings`) is pinned in
 * `claudeSettingsWriter.test.ts`; this file pins that `writeMcpConfigs` applies
 * it to the file on disk.
 */

import {
    fsPromises,
    writeMcpConfigs,
} from './mcpConfigWriter.testUtils';
import { makeEdsProject } from './aiBundleFixtures';
import { makeTestWriter } from './generatedFileWriter.testUtils';

const EXTENSION_DIST = '/path/to/extension/dist';
// Pre-resolved Node binary — passed so the writer never shells out in tests.
const NODE_PATH = '/usr/local/bin/node';

describe('writeMcpConfigs settings.json merge', () => {
    it('preserves user settings on disk instead of overwriting', async () => {
        const existing = { permissions: { allow: ['Bash(ls)'] } };
        (fsPromises.readFile as jest.Mock).mockImplementation(async (p: string) => {
            if (String(p).endsWith('settings.json')) return JSON.stringify(existing);
            throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
        });
        (fsPromises.writeFile as jest.Mock).mockClear();

        await writeMcpConfigs('/projects/test', makeEdsProject(), EXTENSION_DIST, makeTestWriter('/projects/test'), NODE_PATH);

        const call = (fsPromises.writeFile as jest.Mock).mock.calls.find(([p]) =>
            String(p).endsWith('settings.json')
        );
        const written = JSON.parse(call![1] as string);
        expect(written.permissions).toEqual({ allow: ['Bash(ls)'] });
        expect(
            (written.hooks.PostToolUse as Array<{ hooks: Array<{ command: string }> }>).some((e) =>
                e.hooks.some((h) => h.command.includes('AI: sync files'))
            )
        ).toBe(true);
    });
});
