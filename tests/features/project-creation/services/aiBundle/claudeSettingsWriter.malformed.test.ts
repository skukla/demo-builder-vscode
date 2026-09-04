/**
 * Claude Settings Writer — the inputs nobody wrote on purpose.
 *
 * `.claude/settings.json` is a USER-OWNED file. The extension reads it back on
 * every regenerate and merges into it, so every shape a person (or another tool)
 * can leave behind arrives here: a hooks list holding a null, an entry with no
 * `command`, a file that is not JSON at all, a file holding `null`. None of them
 * may throw — a throw here aborts the regenerate and the SC loses the whole
 * bundle refresh over one stray comma.
 *
 * Split from `claudeSettingsWriter.test.ts` (the happy paths) rather than
 * appended: that suite is 598 lines against this repo's 750-line ceiling.
 */

import {
    generateClaudeSettings,
    mergeClaudeSettings,
    parseExistingSettings,
} from '@/features/project-creation/services/aiBundle/claudeSettingsWriter';
import type { ClaudeSettings } from '@/features/project-creation/services/aiBundle/claudeSettingsWriter';
import { makeEdsProject, makeHeadlessProject } from './aiBundleFixtures';

const NODE_PATH = '/usr/local/bin/node';

const GUARD_SIGNATURE = 'Demo Builder targets Adobe orgs per-operation';
const GIT_SYNC_SIGNATURE = 'AI: sync files';

type Matcher = { matcher: string; hooks: Array<{ type?: string; command?: string }> };

const listOf = (settings: Record<string, unknown>, key: 'PreToolUse' | 'PostToolUse'): Matcher[] =>
    ((settings.hooks as Record<string, Matcher[]> | undefined)?.[key] ?? []) as Matcher[];

/** A settings object whose hook list is the malformed one under test. */
const existingWith = (key: 'PreToolUse' | 'PostToolUse', list: unknown[]) => ({
    hooks: { [key]: list },
});

// ─── parseExistingSettings ───────────────────────────────────────────────────

describe('parseExistingSettings', () => {
    it('returns an empty object when there is no file to read', () => {
        expect(parseExistingSettings(undefined)).toEqual({});
    });

    it('returns the parsed object when the file is valid JSON', () => {
        expect(parseExistingSettings('{"permissions":{"allow":["Bash(git*)"]}}')).toEqual({
            permissions: { allow: ['Bash(git*)'] },
        });
    });

    it('returns an empty object when the file is not JSON at all', () => {
        // A half-written settings.json. Claude Code could not read it either, so a
        // fresh write is the recovery — but it must not take the regenerate down.
        expect(parseExistingSettings('{ "hooks": ')).toEqual({});
    });

    it('returns an empty object when the file holds JSON null', () => {
        // `null` parses fine and is typeof 'object'. Merging into it would spread
        // nothing and then read `.hooks` off null.
        expect(parseExistingSettings('null')).toEqual({});
    });

    it('returns an empty object when the file holds a bare JSON scalar', () => {
        expect(parseExistingSettings('5')).toEqual({});
        expect(parseExistingSettings('"a string"')).toEqual({});
    });
});

// ─── Malformed hook entries in the user's file ───────────────────────────────

describe('mergeClaudeSettings — entries the user file can legally contain', () => {
    const desired = (): ClaudeSettings => generateClaudeSettings(makeEdsProject(), NODE_PATH);

    it('survives a PreToolUse list holding a null entry', () => {
        const merged = mergeClaudeSettings(existingWith('PreToolUse', [null]), desired());

        // The null is not ours, so it is a user entry and survives verbatim.
        expect(listOf(merged, 'PreToolUse')).toContainEqual(null);
    });

    it('survives a PostToolUse list holding a null entry', () => {
        const merged = mergeClaudeSettings(existingWith('PostToolUse', [null]), desired());

        expect(listOf(merged, 'PostToolUse')).toContainEqual(null);
    });

    it('survives a PreToolUse entry whose hooks array holds a null', () => {
        const entry = { matcher: 'Bash', hooks: [null] };
        const merged = mergeClaudeSettings(existingWith('PreToolUse', [entry]), desired());

        expect(listOf(merged, 'PreToolUse')).toContainEqual(entry);
    });

    it('survives a PostToolUse entry whose hooks array holds a null', () => {
        const entry = { matcher: 'Read', hooks: [null] };
        const merged = mergeClaudeSettings(existingWith('PostToolUse', [entry]), desired());

        expect(listOf(merged, 'PostToolUse')).toContainEqual(entry);
    });

    it('survives a PreToolUse hook with no command field', () => {
        const entry = { matcher: 'Bash', hooks: [{ type: 'command' }] };
        const merged = mergeClaudeSettings(existingWith('PreToolUse', [entry]), desired());

        expect(listOf(merged, 'PreToolUse')).toContainEqual(entry);
    });

    it('survives a PostToolUse hook with no command field', () => {
        const entry = { matcher: 'Read', hooks: [{ type: 'command' }] };
        const merged = mergeClaudeSettings(existingWith('PostToolUse', [entry]), desired());

        expect(listOf(merged, 'PostToolUse')).toContainEqual(entry);
    });

    it('survives an entry whose hooks field is not an array', () => {
        const entry = { matcher: 'Bash', hooks: 'echo hi' };
        const merged = mergeClaudeSettings(existingWith('PreToolUse', [entry]), desired());

        expect(listOf(merged, 'PreToolUse')).toContainEqual(entry);
    });

    /**
     * Our own entry is recognised by ONE of its hooks carrying the signature, not
     * by all of them. A user who appended a second command to our matcher would
     * otherwise leave an unrecognised copy behind, and the next regenerate would
     * append a second guard next to it.
     */
    it('recognises our guard when it sits beside a hook the user added', () => {
        const ourEntryPlusTheirs = {
            matcher: '^mcp__commerce-extensibility__(aio-configure-global)$',
            hooks: [
                { type: 'command', command: 'echo user addition' },
                { type: 'command', command: `echo "${GUARD_SIGNATURE} (stale copy)" >&2; exit 2` },
            ],
        };
        const merged = mergeClaudeSettings(
            existingWith('PreToolUse', [ourEntryPlusTheirs]),
            desired()
        );
        const list = listOf(merged, 'PreToolUse');

        // Dropped and replaced by the current guard — exactly one entry, and not
        // the stale one.
        expect(list).toHaveLength(1);
        expect(list).not.toContainEqual(ourEntryPlusTheirs);
        expect(list[0].hooks.some((h) => h.command?.includes(GUARD_SIGNATURE))).toBe(true);
    });

    /**
     * The merge appends only OUR entries out of `desired`. A caller handing over a
     * list that also carries something else must not have it silently installed
     * into the user's file under our name.
     */
    it('appends only our own entries from the desired list', () => {
        const foreign = { matcher: 'Bash', hooks: [{ type: 'command', command: 'echo foreign' }] };
        const ours = generateClaudeSettings(makeEdsProject(), NODE_PATH);
        const desiredWithForeign: ClaudeSettings = {
            hooks: {
                PostToolUse: [...(ours.hooks?.PostToolUse ?? []), foreign],
                PreToolUse: [...(ours.hooks?.PreToolUse ?? []), foreign],
            },
        };

        const merged = mergeClaudeSettings({}, desiredWithForeign);

        expect(listOf(merged, 'PostToolUse')).not.toContainEqual(foreign);
        expect(listOf(merged, 'PreToolUse')).not.toContainEqual(foreign);
        expect(
            listOf(merged, 'PostToolUse').some((e) =>
                e.hooks.some((h) => h.command?.includes(GIT_SYNC_SIGNATURE))
            )
        ).toBe(true);
    });
});

// ─── generateClaudeSettings on projects with nothing to hook ─────────────────

describe('generateClaudeSettings — projects that get no hooks at all', () => {
    it('returns a bare object, not an empty hooks container', () => {
        // `{ hooks: {} }` would be written to disk and read back as a settings file
        // that declares a hooks section with nothing in it.
        expect(generateClaudeSettings(makeHeadlessProject(), NODE_PATH)).toEqual({});
    });

    it('survives a project that has no componentInstances at all', () => {
        // Pre-keyed-instances projects on disk, and any project mid-creation.
        const project = makeHeadlessProject({ componentInstances: undefined });

        expect(generateClaudeSettings(project, NODE_PATH)).toEqual({});
    });
});
