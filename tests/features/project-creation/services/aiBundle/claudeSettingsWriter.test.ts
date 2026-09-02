/**
 * Claude Settings Writer Tests
 *
 * Moved unchanged from `mcpConfigWriter.test.ts` / `mcpConfigWriter.settingsMerge.test.ts`
 * when the settings/hook builders were extracted to `claudeSettingsWriter.ts`
 * (mechanical, behavior-preserving — a refactor proves itself by not moving
 * its tests). Covers:
 * - `generateClaudeSettings` — per-project PostToolUse git-sync hook
 * - `mergeClaudeSettings` — edit-preserving merge into a user's settings.json
 * - `buildHomeGitSyncCommand` / `generateHomeClaudeSettings` — home-Chat hook
 */

import {
    buildHomeGitSyncCommand,
    generateClaudeSettings,
    generateHomeClaudeSettings,
    mergeClaudeSettings,
} from '@/features/project-creation/services/aiBundle/claudeSettingsWriter';
import { makeEdsProject, makeEdsStorefrontInstance, EDS_STOREFRONT_PATH } from './aiBundleFixtures';
import type { Project, ComponentInstance } from '@/types/base';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeHeadlessProject(overrides: Partial<Project> = {}): Project {
    return {
        name: 'headless-project',
        created: new Date('2026-01-01'),
        lastModified: new Date('2026-01-01'),
        path: '/projects/headless-project',
        status: 'ready',
        selectedStack: 'headless-paas',
        componentInstances: {},
        ...overrides,
    };
}

// Already-resolved Node binary threaded into the git-sync hook's `node -e`
// tool-input extractor (see resolveNodePath / buildToolFileExtraction).
const NODE_PATH = '/usr/local/bin/node';

const hasGitSync = (settings: Record<string, unknown>): boolean =>
    (
        (settings.hooks as { PostToolUse?: Array<{ hooks: Array<{ command: string }> }> })
            ?.PostToolUse ?? []
    ).some((e) => e.hooks.some((h) => h.command.includes('AI: sync files')));

// ─── mergeClaudeSettings ──────────────────────────────────────────────────────

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

    it('preserves the user\'s own PreToolUse hooks (ours now rides in that list too)', () => {
        // Was `toEqual(pre)` when PreToolUse was purely user territory. Since the
        // aio-global guard (phase 6) the list is co-managed, so the assertion is
        // the one that always mattered: the user's entry survives verbatim.
        const pre = [{ matcher: 'Bash', hooks: [{ type: 'command', command: 'echo pre' }] }];
        const merged = mergeClaudeSettings({ hooks: { PreToolUse: pre } }, gitSyncDesired());
        expect((merged.hooks as { PreToolUse: unknown[] }).PreToolUse).toContainEqual(pre[0]);
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

// ─── generateClaudeSettings ───────────────────────────────────────────────────

describe('generateClaudeSettings', () => {
    it('returns a hooks structure with PostToolUse for EDS projects', () => {
        const project = makeEdsProject();
        const settings = generateClaudeSettings(project, NODE_PATH);

        expect(settings.hooks).toBeDefined();
        expect(settings.hooks?.['PostToolUse']).toBeDefined();
        expect(Array.isArray(settings.hooks?.['PostToolUse'])).toBe(true);
    });

    it('PostToolUse hook matches Write and Edit tools', () => {
        const project = makeEdsProject();
        const settings = generateClaudeSettings(project, NODE_PATH);
        const hook = settings.hooks?.['PostToolUse']?.[0];

        expect(hook?.matcher).toMatch(/Write|Edit/);
    });

    it('PostToolUse hook command references the storefront local path', () => {
        const project = makeEdsProject();
        const settings = generateClaudeSettings(project, NODE_PATH);
        const hook = settings.hooks?.['PostToolUse']?.[0];
        const command = hook?.hooks?.[0]?.command ?? '';

        expect(command).toContain(EDS_STOREFRONT_PATH);
    });

    it('PostToolUse hook command includes git commit and push', () => {
        const project = makeEdsProject();
        const settings = generateClaudeSettings(project, NODE_PATH);
        const hook = settings.hooks?.['PostToolUse']?.[0];
        const command = hook?.hooks?.[0]?.command ?? '';

        expect(command).toContain('git');
        expect(command).toContain('commit');
        expect(command).toContain('push');
    });

    it('returns no PostToolUse hook for headless projects (no storefront path)', () => {
        const project = makeHeadlessProject();
        const settings = generateClaudeSettings(project, NODE_PATH);

        expect(settings.hooks?.['PostToolUse']).toBeUndefined();
    });

    it('returns no PostToolUse hook when storefront path contains shell metacharacters', () => {
        const dangerousPath = '/projects/test;rm -rf /';
        const project = makeEdsProject({
            componentInstances: {
                'eds-storefront': { ...makeEdsStorefrontInstance(), path: dangerousPath },
            },
        });
        const settings = generateClaudeSettings(project, NODE_PATH);

        expect(settings.hooks?.['PostToolUse']).toBeUndefined();
    });

    it('returns no PostToolUse hook when storefront path contains a backslash', () => {
        const dangerousPath = '/projects/test\\injected';
        const project = makeEdsProject({
            componentInstances: {
                'eds-storefront': { ...makeEdsStorefrontInstance(), path: dangerousPath },
            },
        });
        const settings = generateClaudeSettings(project, NODE_PATH);

        expect(settings.hooks?.['PostToolUse']).toBeUndefined();
    });

    it('PostToolUse hook uses a static commit message (no dynamic filename expansion)', () => {
        const project = makeEdsProject();
        const settings = generateClaudeSettings(project, NODE_PATH);
        const command = settings.hooks?.['PostToolUse']?.[0]?.hooks?.[0]?.command ?? '';

        // The commit -m value must be a static string — no $() in the -m argument
        expect(command).not.toContain('-m "AI: update $(');
        expect(command).toContain('"AI: sync files"');
    });

    describe('PostToolUse hook hardening', () => {
        /**
         * RUN the extractor, do not just grep it.
         *
         * This hook shipped reading `process.env.CLAUDE_TOOL_INPUT`, which Claude
         * Code never sets — it delivers the tool-call JSON on stdin, as every hook
         * in this repo's own `.claude/hooks/` does (`format-on-edit.sh` is the
         * same PostToolUse/Edit|Write pair). So `TOOL_FILE` was always empty, the
         * path guard never matched, and the hook silently did nothing.
         *
         * It survived because the tests asserted the command STRING contained the
         * env var — pinning the bug rather than the behaviour. A containment
         * assertion cannot tell a working extractor from a broken one; only
         * executing it can.
         */
        it('EXECUTES: pulls the edited path off stdin, the way Claude Code sends it', () => {
            const project = makeEdsProject();
            const command =
                generateClaudeSettings(project, NODE_PATH).hooks?.['PostToolUse']?.[0]?.hooks?.[0]
                    ?.command ?? '';
            const script = command.slice(
                command.indexOf("-e '") + 4,
                command.indexOf("'); ")
            );
            const payload = JSON.stringify({
                tool_name: 'Edit',
                tool_input: { file_path: '/demo/storefront/blocks/hero/hero.js' },
            });

            const out = require('child_process').execFileSync(
                process.execPath,
                ['-e', script],
                { input: payload, encoding: 'utf8' }
            );

            expect(out).toBe('/demo/storefront/blocks/hero/hero.js');
        });

        it('EXECUTES: yields empty (and the guard skips) when there is no file_path', () => {
            const project = makeEdsProject();
            const command =
                generateClaudeSettings(project, NODE_PATH).hooks?.['PostToolUse']?.[0]?.hooks?.[0]
                    ?.command ?? '';
            const script = command.slice(
                command.indexOf("-e '") + 4,
                command.indexOf("'); ")
            );

            const out = require('child_process').execFileSync(
                process.execPath,
                ['-e', script],
                { input: JSON.stringify({ tool_name: 'Bash' }), encoding: 'utf8' }
            );

            expect(out).toBe('');
        });

        it('extracts the tool input with a single node -e invocation (no jq/python3/grep cascade)', () => {
            const project = makeEdsProject();
            const command =
                generateClaudeSettings(project, NODE_PATH).hooks?.['PostToolUse']?.[0]?.hooks?.[0]
                    ?.command ?? '';

            // Parses via the resolved node binary, reading the payload on STDIN.
            expect(command).toContain(`TOOL_FILE=$("${NODE_PATH}" -e '`);
            expect(command).toContain('readFileSync(0');
            // The env var this used to read is never set by Claude Code — see the
            // executable test below, which is what should have caught it.
            expect(command).not.toContain('CLAUDE_TOOL_INPUT');
            expect(command).toContain('JSON.parse');
            // Recursive first-string file_path finder (parity with old `.. | .file_path`).
            expect(command).toContain('file_path');
            // The old 3-tier shell cascade is gone.
            expect(command).not.toContain('jq');
            expect(command).not.toContain('python3');
            expect(command).not.toContain('grep');
            expect(command).not.toContain('sed');
        });

        it('returns no PostToolUse hook when nodePath contains shell metacharacters', () => {
            const project = makeEdsProject();
            const settings = generateClaudeSettings(project, '/usr/local/bin/node;rm -rf /');
            expect(settings.hooks?.['PostToolUse']).toBeUndefined();
        });

        it('produces a hook for storefront paths containing spaces', () => {
            const pathWithSpaces = '/Users/Some User/projects/test/components/eds-storefront';
            const project = makeEdsProject({
                componentInstances: {
                    'eds-storefront': { ...makeEdsStorefrontInstance(), path: pathWithSpaces },
                },
            });

            const settings = generateClaudeSettings(project, NODE_PATH);
            expect(settings.hooks?.['PostToolUse']).toBeDefined();
            const command = settings.hooks?.['PostToolUse']?.[0]?.hooks?.[0]?.command ?? '';
            expect(command).toContain(pathWithSpaces);
        });

        it('quotes the storefront path so spaces do not break the shell command', () => {
            const pathWithSpaces = '/Users/Some User/projects/test/components/eds-storefront';
            const project = makeEdsProject({
                componentInstances: {
                    'eds-storefront': { ...makeEdsStorefrontInstance(), path: pathWithSpaces },
                },
            });

            const command =
                generateClaudeSettings(project, NODE_PATH).hooks?.['PostToolUse']?.[0]?.hooks?.[0]
                    ?.command ?? '';
            expect(command).toContain(`"${pathWithSpaces}"`);
        });

        it('still rejects paths with shell metacharacters other than whitespace', () => {
            const project = makeEdsProject({
                componentInstances: {
                    'eds-storefront': { ...makeEdsStorefrontInstance(), path: '/projects/test;rm -rf /' },
                },
            });
            const settings = generateClaudeSettings(project, NODE_PATH);
            expect(settings.hooks?.['PostToolUse']).toBeUndefined();
        });
    });
});

// ─── buildHomeGitSyncCommand / generateHomeClaudeSettings ────────────────────

describe('buildHomeGitSyncCommand', () => {
    const HOME_ROOT = '/Users/demo/.demo-builder/projects';

    it('extracts the edited file with a single node -e invocation (no jq/python3/grep cascade)', () => {
        const command = buildHomeGitSyncCommand(HOME_ROOT, NODE_PATH);
        expect(command).toContain(`TOOL_FILE=$("${NODE_PATH}" -e '`);
        expect(command).toContain('readFileSync(0');
        expect(command).not.toContain('CLAUDE_TOOL_INPUT');
        expect(command).toContain('JSON.parse');
        expect(command).toContain('file_path');
        expect(command).toContain('TOOL_FILE=');
        expect(command).not.toContain('jq');
        expect(command).not.toContain('python3');
        expect(command).not.toContain('grep');
        expect(command).not.toContain('sed');
    });

    it('bails when no file was edited / payload could not be parsed', () => {
        const command = buildHomeGitSyncCommand(HOME_ROOT, NODE_PATH);
        expect(command).toContain('[ -z "$TOOL_FILE" ] && exit 0');
    });

    it('resolves the enclosing git repo via rev-parse --show-toplevel', () => {
        const command = buildHomeGitSyncCommand(HOME_ROOT, NODE_PATH);
        expect(command).toContain('rev-parse --show-toplevel');
        expect(command).toContain(
            'TOP=$(git -C "$(dirname "$TOOL_FILE")" rev-parse --show-toplevel 2>/dev/null) || exit 0'
        );
    });

    it('applies the root-scope case guard with the quoted projects root (subpath only)', () => {
        const command = buildHomeGitSyncCommand(HOME_ROOT, NODE_PATH);
        expect(command).toContain(`case "$TOP" in "${HOME_ROOT}"/*) ;; *) exit 0 ;; esac`);
    });

    it('applies the origin-remote guard so only storefront repos are committed', () => {
        const command = buildHomeGitSyncCommand(HOME_ROOT, NODE_PATH);
        expect(command).toContain('git -C "$TOP" remote get-url origin >/dev/null 2>&1 || exit 0');
    });

    it('commits and pushes the resolved repo top with a static message', () => {
        const command = buildHomeGitSyncCommand(HOME_ROOT, NODE_PATH);
        expect(command).toContain('git -C "$TOP" add -A');
        expect(command).toContain('git -C "$TOP" commit -m "AI: sync files"');
        expect(command).toContain('git -C "$TOP" push');
    });

    it('returns an empty string when the projects root contains shell metacharacters', () => {
        expect(buildHomeGitSyncCommand('/tmp/a;b', NODE_PATH)).toBe('');
    });

    it('returns an empty string when nodePath contains shell metacharacters', () => {
        expect(buildHomeGitSyncCommand(HOME_ROOT, '/usr/local/bin/node;rm -rf /')).toBe('');
    });
});

describe('generateHomeClaudeSettings', () => {
    const HOME_ROOT = '/Users/demo/.demo-builder/projects';

    it('wraps the home git-sync command as a Write|Edit PostToolUse hook', () => {
        const settings = generateHomeClaudeSettings(HOME_ROOT, NODE_PATH);
        const hook = settings.hooks?.['PostToolUse']?.[0];

        expect(hook?.matcher).toBe('Write|Edit');
        const command = hook?.hooks?.[0]?.command ?? '';
        expect(command).toBe(buildHomeGitSyncCommand(HOME_ROOT, NODE_PATH));
        expect(command).toContain(`case "$TOP" in "${HOME_ROOT}"/*)`);
        expect(command).toContain('remote get-url origin');
    });

    /**
     * These asserted `toEqual({})` while git-sync was the only hook here. Since
     * the phase-6 aio guard — a STATIC command interpolating nothing — the empty
     * object is no longer the right proxy. Assert the intent directly instead:
     * the unsafe value must never reach an executed command, and the hook that
     * would have carried it is skipped. That is a stricter check than `{}` was.
     */
    it('never emits the unsafe projects root, and skips git-sync', () => {
        const settings = generateHomeClaudeSettings('/tmp/a;b', NODE_PATH);
        expect(JSON.stringify(settings)).not.toContain('/tmp/a;b');
        expect(hasGitSync(settings as Record<string, unknown>)).toBe(false);
        expect(settings.hooks?.PostToolUse).toBeUndefined();
    });

    it('never emits the unsafe nodePath, and skips git-sync', () => {
        const settings = generateHomeClaudeSettings(HOME_ROOT, '/usr/local/bin/node;rm -rf /');
        expect(JSON.stringify(settings)).not.toContain('rm -rf');
        expect(hasGitSync(settings as Record<string, unknown>)).toBe(false);
        expect(settings.hooks?.PostToolUse).toBeUndefined();
    });
});

// ─── PreToolUse aio-global guard (ai-surface phase 6) ─────────────────────────

/**
 * The guard blocks the three commerce-extensibility MCP tools that read/write
 * the `aio` CLI's process-global org selection — state Demo Builder
 * deliberately stopped using (per-operation `withOrgContext`). A single
 * unwrapped write once deployed a mesh into a DELETED project for two days.
 *
 * Every assertion here EXECUTES something (the command, or the matcher regex
 * against real tool names). The git-sync hook shipped broken for months
 * because its tests asserted the command STRING; a containment assertion
 * cannot tell a working guard from a dead one.
 */
describe('PreToolUse aio-global guard', () => {
    const GUARD_SIGNATURE = 'Demo Builder targets Adobe orgs per-operation';

    type Matcher = { matcher: string; hooks: Array<{ type: string; command: string }> };

    const preToolUse = (settings: { hooks?: { PreToolUse?: Matcher[] } }): Matcher[] =>
        settings.hooks?.PreToolUse ?? [];

    const guardEntry = (settings: { hooks?: { PreToolUse?: Matcher[] } }): Matcher | undefined =>
        preToolUse(settings).find((e) => e.hooks.some((h) => h.command.includes(GUARD_SIGNATURE)));

    function makeMeshOnlyProject(): Project {
        return makeHeadlessProject({
            componentInstances: {
                'eds-accs-mesh': {
                    id: 'eds-accs-mesh',
                    name: 'API Mesh',
                    type: 'dependency',
                    subType: 'mesh',
                    status: 'ready',
                } as ComponentInstance,
            },
        });
    }

    describe('the command, executed', () => {
        it('EXECUTES: exits 2 (block) and names the alternative on stderr', () => {
            const command = guardEntry(generateClaudeSettings(makeEdsProject(), NODE_PATH))
                ?.hooks[0]?.command as string;
            expect(command).toBeDefined();

            const { execFileSync } = require('child_process');
            let status: number | undefined;
            let stderr = '';
            try {
                execFileSync('/bin/sh', ['-c', command], { encoding: 'utf8' });
                status = 0;
            } catch (err) {
                const e = err as { status?: number; stderr?: string };
                status = e.status;
                stderr = e.stderr ?? '';
            }

            // Exit 2 is Claude Code's "block the call" contract.
            expect(status).toBe(2);
            expect(stderr).toContain(GUARD_SIGNATURE);
            // The refusal must route the agent somewhere, not just say no.
            expect(stderr).toContain('deploy_mesh');
            expect(stderr).toContain('get_project_status');
        });

        it('is static — no interpolated path and nothing that can silently no-op', () => {
            // The git-sync hook's failure mode was a conditional whose input was
            // always empty. This command has no input and no conditional.
            const command = guardEntry(generateClaudeSettings(makeEdsProject(), NODE_PATH))
                ?.hooks[0]?.command as string;
            expect(command).not.toContain(EDS_STOREFRONT_PATH);
            expect(command).not.toContain('TOOL_FILE');
            expect(command).not.toContain('if ');
        });
    });

    describe('the matcher, executed against real tool names', () => {
        const matcherOf = (): RegExp =>
            new RegExp(
                guardEntry(generateClaudeSettings(makeEdsProject(), NODE_PATH))?.matcher as string
            );

        it.each([
            'mcp__commerce-extensibility__aio-configure-global',
            'mcp__commerce-extensibility__aio-app-use',
            'mcp__commerce-extensibility__aio-where',
        ])('blocks %s', (toolName) => {
            expect(matcherOf().test(toolName)).toBe(true);
        });

        it.each([
            // Same MCP, unrelated tools — these must keep working.
            'mcp__commerce-extensibility__aio-app-deploy',
            'mcp__commerce-extensibility__aio-login',
            'mcp__commerce-extensibility__search-commerce-docs',
            // Our own tools, and a prefix-collision probe.
            'mcp__demo-builder__deploy_mesh',
            'mcp__other__aio-where',
            'Bash',
        ])('does not block %s', (toolName) => {
            expect(matcherOf().test(toolName)).toBe(false);
        });
    });

    describe('who gets it (the App Builder tooling predicate)', () => {
        it('ships for an EDS storefront project', () => {
            expect(guardEntry(generateClaudeSettings(makeEdsProject(), NODE_PATH))).toBeDefined();
        });

        it('ships for a mesh-only project — no storefront, but the tools are there', () => {
            const settings = generateClaudeSettings(makeMeshOnlyProject(), NODE_PATH);
            // The exact case the storefront-path early return used to swallow.
            expect(guardEntry(settings)).toBeDefined();
            expect(hasGitSync(settings as Record<string, unknown>)).toBe(false);
        });

        it('does NOT ship for a bare project that gets no App Builder tooling', () => {
            expect(
                guardEntry(generateClaudeSettings(makeHeadlessProject(), NODE_PATH))
            ).toBeUndefined();
        });

        it('ships for the home Chat, which can address any project by name', () => {
            expect(guardEntry(generateHomeClaudeSettings('/projects', NODE_PATH))).toBeDefined();
        });

        it('still ships for the home Chat when the root is unsafe and git-sync is skipped', () => {
            const settings = generateHomeClaudeSettings('/pro$jects', NODE_PATH);
            expect(guardEntry(settings)).toBeDefined();
            expect(hasGitSync(settings as Record<string, unknown>)).toBe(false);
        });
    });

    describe('merge — two managed lists, user content untouched', () => {
        const desired = () => generateClaudeSettings(makeEdsProject(), NODE_PATH);

        it("preserves the user's own PreToolUse hooks alongside ours", () => {
            const userHook = {
                matcher: 'Bash',
                hooks: [{ type: 'command', command: 'echo mine' }],
            };
            const merged = mergeClaudeSettings({ hooks: { PreToolUse: [userHook] } }, desired());
            const list = (merged.hooks as { PreToolUse: Matcher[] }).PreToolUse;
            expect(list).toContainEqual(userHook);
            expect(list.some((e) => e.hooks.some((h) => h.command.includes(GUARD_SIGNATURE)))).toBe(
                true
            );
        });

        it('refreshes (does not duplicate) our guard across regenerates', () => {
            const once = mergeClaudeSettings({}, desired());
            const twice = mergeClaudeSettings(once, desired());
            const list = (twice.hooks as { PreToolUse: Matcher[] }).PreToolUse;
            expect(
                list.filter((e) => e.hooks.some((h) => h.command.includes(GUARD_SIGNATURE)))
            ).toHaveLength(1);
        });

        it('drops our guard when the project stops qualifying, keeping user hooks', () => {
            const userHook = {
                matcher: 'Bash',
                hooks: [{ type: 'command', command: 'echo mine' }],
            };
            const withGuard = mergeClaudeSettings({ hooks: { PreToolUse: [userHook] } }, desired());
            const after = mergeClaudeSettings(
                withGuard,
                generateClaudeSettings(makeHeadlessProject(), NODE_PATH)
            );
            const list = (after.hooks as { PreToolUse: Matcher[] }).PreToolUse;
            expect(list).toEqual([userHook]);
        });

        it('both lists merge independently — git-sync and guard coexist', () => {
            const merged = mergeClaudeSettings({}, desired());
            expect(hasGitSync(merged)).toBe(true);
            expect(
                (merged.hooks as { PreToolUse: Matcher[] }).PreToolUse.some((e) =>
                    e.hooks.some((h) => h.command.includes(GUARD_SIGNATURE))
                )
            ).toBe(true);
        });
    });
});
