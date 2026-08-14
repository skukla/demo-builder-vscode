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

import * as fsPromises from 'fs/promises';
import { makeTestWriter } from './generatedFileWriter.testUtils';
import { writeMcpConfigs } from '@/features/project-creation/services/mcpConfigWriter';
import type { Project } from '@/types/base';

jest.mock('fs/promises', () => ({
    lstat: jest.fn().mockRejectedValue(Object.assign(new Error('ENOENT'), { code: 'ENOENT' })),
    realpath: jest.fn(async (p: string) => p),
    mkdir: jest.fn().mockResolvedValue(undefined),
    writeFile: jest.fn().mockResolvedValue(undefined),
    readFile: jest.fn().mockRejectedValue(Object.assign(new Error('ENOENT'), { code: 'ENOENT' })),
    appendFile: jest.fn().mockResolvedValue(undefined),
}));

const EXTENSION_DIST = '/path/to/extension/dist';
// Pre-resolved Node binary — passed so the writer never shells out in tests.
const NODE_PATH = '/usr/local/bin/node';

function makeEdsProject(): Project {
    return {
        name: 'test-project',
        created: new Date('2026-01-01'),
        lastModified: new Date('2026-01-01'),
        path: '/projects/test-project',
        status: 'ready',
        selectedStack: 'eds-paas',
        componentInstances: {
            'eds-storefront': {
                id: 'eds-storefront',
                name: 'EDS Storefront',
                status: 'ready',
                path: '/projects/test/components/eds-storefront',
                metadata: { githubRepo: 'owner/my-repo' },
            },
        },
    };
}

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
