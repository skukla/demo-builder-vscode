/**
 * mcpConfigWriter — edit-preserving `.claude/settings.json` merge.
 *
 * Regenerating AI files must NOT wipe a user's own `.claude/settings.json`
 * (hooks / permissions / env). The writer reads the existing file and MERGES the
 * Demo-Builder git-sync PostToolUse hook in, identified by its stable
 * "AI: sync files" signature so a path change refreshes it (no duplicate) and a
 * non-EDS regen drops only our entry. Split from `mcpConfigWriter.test.ts` to
 * keep both files under the line budget.
 */

import * as fsPromises from 'fs/promises';
import {
    generateClaudeSettings,
    mergeClaudeSettings,
    writeMcpConfigs,
} from '@/features/project-creation/services/mcpConfigWriter';
import type { Project } from '@/types/base';

jest.mock('fs/promises', () => ({
    mkdir: jest.fn().mockResolvedValue(undefined),
    writeFile: jest.fn().mockResolvedValue(undefined),
    readFile: jest.fn().mockRejectedValue(Object.assign(new Error('ENOENT'), { code: 'ENOENT' })),
    appendFile: jest.fn().mockResolvedValue(undefined),
}));

const NODE_PATH = '/usr/local/bin/node';
const EXTENSION_DIST = '/path/to/extension/dist';

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

const hasGitSync = (settings: Record<string, unknown>): boolean =>
    (
        (settings.hooks as { PostToolUse?: Array<{ hooks: Array<{ command: string }> }> })
            ?.PostToolUse ?? []
    ).some((e) => e.hooks.some((h) => h.command.includes('AI: sync files')));

describe('mergeClaudeSettings (edit-preserving)', () => {
    const gitSyncDesired = () => generateClaudeSettings(makeEdsProject(), NODE_PATH);

    it('adds the git-sync hook when no settings exist yet', () => {
        expect(hasGitSync(mergeClaudeSettings({}, gitSyncDesired()))).toBe(true);
    });

    it('preserves user permissions and env when merging', () => {
        const existing = { permissions: { allow: ['Bash(git*)'] }, env: { FOO: 'bar' } };
        const merged = mergeClaudeSettings(existing, gitSyncDesired());
        expect(merged.permissions).toEqual({ allow: ['Bash(git*)'] });
        expect(merged.env).toEqual({ FOO: 'bar' });
        expect(hasGitSync(merged)).toBe(true);
    });

    it("preserves the user's own PostToolUse hooks", () => {
        const userHook = { matcher: 'Read', hooks: [{ type: 'command', command: 'echo hi' }] };
        const merged = mergeClaudeSettings(
            { hooks: { PostToolUse: [userHook] } },
            gitSyncDesired()
        );
        expect((merged.hooks as { PostToolUse: unknown[] }).PostToolUse).toContainEqual(userHook);
        expect(hasGitSync(merged)).toBe(true);
    });

    it('preserves other hook types (e.g. PreToolUse)', () => {
        const pre = [{ matcher: 'Bash', hooks: [{ type: 'command', command: 'echo pre' }] }];
        const merged = mergeClaudeSettings({ hooks: { PreToolUse: pre } }, gitSyncDesired());
        expect((merged.hooks as { PreToolUse: unknown }).PreToolUse).toEqual(pre);
    });

    it('refreshes (does not duplicate) a prior git-sync hook on regen', () => {
        const stale = {
            matcher: 'Write|Edit',
            hooks: [{ type: 'command', command: 'OLD git ... AI: sync files' }],
        };
        const merged = mergeClaudeSettings({ hooks: { PostToolUse: [stale] } }, gitSyncDesired());
        const sync = (
            merged.hooks as { PostToolUse: Array<{ hooks: Array<{ command: string }> }> }
        ).PostToolUse.filter((e) => e.hooks.some((h) => h.command.includes('AI: sync files')));
        expect(sync).toHaveLength(1);
        expect(sync[0].hooks[0].command).not.toContain('OLD git');
    });

    it('non-EDS regen (desired empty) drops our hook but keeps user content', () => {
        const stale = {
            matcher: 'Write|Edit',
            hooks: [{ type: 'command', command: '... AI: sync files' }],
        };
        const userHook = { matcher: 'Read', hooks: [{ type: 'command', command: 'echo hi' }] };
        const existing = {
            permissions: { allow: ['X'] },
            hooks: { PostToolUse: [stale, userHook] },
        };
        const merged = mergeClaudeSettings(existing, {});
        expect(merged.permissions).toEqual({ allow: ['X'] });
        expect((merged.hooks as { PostToolUse: unknown[] }).PostToolUse).toEqual([userHook]);
    });

    it('drops the hooks key entirely when nothing remains', () => {
        const stale = {
            matcher: 'Write|Edit',
            hooks: [{ type: 'command', command: '... AI: sync files' }],
        };
        const merged = mergeClaudeSettings({ hooks: { PostToolUse: [stale] } }, {});
        expect(merged.hooks).toBeUndefined();
    });

    it('does not throw on a malformed user hook entry (keeps it as user content)', () => {
        // A user's settings.json with a non-array `hooks` on an entry must not abort
        // the whole regenerate; it is simply treated as a non-git-sync (user) hook.
        const malformed = { matcher: 'Read', hooks: 'oops' } as unknown;
        const existing = { hooks: { PostToolUse: [malformed] } };
        const merged = mergeClaudeSettings(existing, {});
        expect((merged.hooks as { PostToolUse: unknown[] }).PostToolUse).toEqual([malformed]);
    });
});

describe('writeMcpConfigs settings.json merge', () => {
    it('preserves user settings on disk instead of overwriting', async () => {
        const existing = { permissions: { allow: ['Bash(ls)'] } };
        (fsPromises.readFile as jest.Mock).mockImplementation(async (p: string) => {
            if (String(p).endsWith('settings.json')) return JSON.stringify(existing);
            throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
        });
        (fsPromises.writeFile as jest.Mock).mockClear();

        await writeMcpConfigs('/projects/test', makeEdsProject(), EXTENSION_DIST);

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
