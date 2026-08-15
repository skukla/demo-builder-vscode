/**
 * PreToolUse hook router.
 *
 * Five hooks had grown with the same twelve lines of scaffolding copied between
 * them — payload parse, session marker, message on stderr, exit 2. Two of them
 * (`reuse-first-router` and `webview-test-skill-router`) were character-identical
 * apart from a `case` pattern, a marker name and a message. Bash carried two
 * separate entries, so every Bash call spawned two processes.
 *
 * They are now one dispatcher plus five rule files. These are the first tests any
 * of the hooks have had, and they exist because consolidating means a bug reaches
 * ALL guards at once rather than one.
 *
 * The contract under test:
 *   exit 0 → the tool call proceeds
 *   exit 2 → blocked, and stderr is shown to Claude
 * Anything unexpected must FAIL OPEN. A guard that breaks the session it guards
 * is worse than no guard.
 */

import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const ROUTER = path.join(__dirname, '../../.claude/hooks/router.sh');

interface Result {
    code: number;
    stderr: string;
}

/**
 * An empty process snapshot, used as the DEFAULT for every test.
 *
 * Without it the jest-concurrent rule reads real `ps`, and any test asserting
 * that a jest command is ALLOWED starts depending on whether another jest run
 * happens to be on the machine. That is not hypothetical: it failed 6/6 while
 * two suites ran concurrently, taking the pre-existing jest-pipe test with it.
 * A suite that guards against contention must not itself be contention-sensitive.
 */
const EMPTY_PS = path.join(os.tmpdir(), `dbv-ps-empty-${process.pid}.txt`);
fs.writeFileSync(EMPTY_PS, '    1 /sbin/launchd\n');

/** Run the router with a payload, capturing exit code and stderr. */
function run(payload: unknown, session = 'test-session', env: NodeJS.ProcessEnv = {}): Result {
    const body =
        typeof payload === 'string'
            ? payload
            : JSON.stringify({ ...(payload as object), session_id: session });
    try {
        execFileSync('bash', [ROUTER], {
            input: body,
            encoding: 'utf-8',
            stdio: 'pipe',
            env: { ...process.env, DBV_JEST_PS: EMPTY_PS, ...env },
        });
        return { code: 0, stderr: '' };
    } catch (e) {
        const err = e as { status: number; stderr: string };
        return { code: err.status, stderr: err.stderr ?? '' };
    }
}

/**
 * Write a synthetic `ps -Ao pid=,command=` snapshot for the jest-concurrent rule.
 * PID 1 is used for the fake run so it can never collide with a real ancestor of
 * the hook (the rule skips any jest parent it is nested inside).
 */
function psSnapshot(lines: string[]): string {
    const file = path.join(os.tmpdir(), `dbv-ps-${process.pid}-${n}.txt`);
    fs.writeFileSync(file, lines.join('\n') + '\n');
    return file;
}

const bash = (command: string) => ({ tool_name: 'Bash', tool_input: { command } });
const write = (file_path: string) => ({ tool_name: 'Write', tool_input: { file_path } });
const edit = (file_path: string) => ({ tool_name: 'Edit', tool_input: { file_path } });
const mcp = (tool_name: string) => ({ tool_name, tool_input: {} });

/** Unique session per test so markers never leak between them. */
let n = 0;
const fresh = () => `router-test-${process.pid}-${n++}`;

describe('fails open — the property that matters most', () => {
    it('passes a malformed payload rather than blocking the session', () => {
        expect(run('this is not json').code).toBe(0);
    });

    it('passes an empty payload', () => {
        expect(run('').code).toBe(0);
    });

    it('passes a payload with no recognised fields', () => {
        expect(run({ tool_name: 'Bash', tool_input: {} }).code).toBe(0);
    });

    it('passes ordinary commands untouched', () => {
        for (const c of ['git status', 'ls -la', 'npm run compile', 'echo hi']) {
            expect(run(bash(c)).code).toBe(0);
        }
    });
});

describe('jest-pipe rule — blocks EVERY time, no session marker', () => {
    it('blocks jest piped to tail', () => {
        const r = run(bash('npx jest --no-coverage | tail -20'), fresh());
        expect(r.code).toBe(2);
        expect(r.stderr).toMatch(/never pipe jest/i);
    });

    it('blocks jest piped to head and to grep', () => {
        expect(run(bash('npx jest | head -5'), fresh()).code).toBe(2);
        expect(run(bash('npx jest foo | grep FAIL'), fresh()).code).toBe(2);
    });

    it('blocks AGAIN in the same session — this one is not once-per-session', () => {
        // Deliberate difference from the routing nudges: a hard stop on a
        // mechanical mistake must not be spendable by making it twice.
        const s = fresh();
        expect(run(bash('npx jest | tail -5'), s).code).toBe(2);
        expect(run(bash('npx jest | tail -5'), s).code).toBe(2);
    });

    it('allows the redirect form it recommends', () => {
        expect(run(bash('npx jest --no-coverage > /tmp/out.txt 2>&1'), fresh()).code).toBe(0);
    });
});

describe('jest-concurrent rule — blocks a run while another is in flight', () => {
    // Measured 2026-08-13: two overlapping full suites failed 4-6 suites on every
    // one of 6 trials; a solo run failed none in 10. The rule exists so a gate
    // result is never quietly collected from a contended box.
    const OTHER_RUN = '    1 node /repo/node_modules/.bin/jest --no-coverage';

    it('blocks npx jest when another run is live', () => {
        const r = run(bash('npx jest --no-coverage > /tmp/out.txt 2>&1'), fresh(), {
            DBV_JEST_PS: psSnapshot([OTHER_RUN]),
        });
        expect(r.code).toBe(2);
        expect(r.stderr).toMatch(/already in flight/i);
    });

    it('blocks the npm wrappers too — they start jest without naming it', () => {
        const ps = psSnapshot([OTHER_RUN]);
        expect(run(bash('npm test'), fresh(), { DBV_JEST_PS: ps }).code).toBe(2);
        expect(run(bash('npm run test:fast'), fresh(), { DBV_JEST_PS: ps }).code).toBe(2);
    });

    it('blocks AGAIN in the same session — a second run is wrong, not merely noisy', () => {
        const s = fresh();
        const ps = psSnapshot([OTHER_RUN]);
        expect(run(bash('npx jest'), s, { DBV_JEST_PS: ps }).code).toBe(2);
        expect(run(bash('npx jest'), s, { DBV_JEST_PS: ps }).code).toBe(2);
    });

    it('allows a run when nothing else is going', () => {
        const ps = psSnapshot(['    1 /sbin/launchd', '  222 node esbuild.config.js --watch']);
        expect(
            run(bash('npx jest --no-coverage > /tmp/out.txt 2>&1'), fresh(), {
                DBV_JEST_PS: ps,
            }).code
        ).toBe(0);
    });

    it('ignores a watch-mode parent — it is idle almost always', () => {
        const ps = psSnapshot(['    1 node /repo/node_modules/.bin/jest --watch']);
        expect(run(bash('npx jest'), fresh(), { DBV_JEST_PS: ps }).code).toBe(0);
    });

    it('does not count a jest run that is its own ancestor', () => {
        // process.ppid is a real ancestor of the bash the router spawns, so a
        // snapshot naming it as a jest parent must NOT count. Without this the
        // rule blocks every guarded command for the lifetime of any jest run,
        // including the one running these tests.
        const ps = psSnapshot([`${process.ppid} node /repo/node_modules/.bin/jest --no-coverage`]);
        expect(run(bash('npx jest'), fresh(), { DBV_JEST_PS: ps }).code).toBe(0);
    });

    it('still blocks when an ancestor run AND a foreign run are both live', () => {
        const ps = psSnapshot([
            `${process.ppid} node /repo/node_modules/.bin/jest --no-coverage`,
            OTHER_RUN,
        ]);
        expect(run(bash('npx jest'), fresh(), { DBV_JEST_PS: ps }).code).toBe(2);
    });

    it('ignores commands that merely mention jest without running it', () => {
        const ps = psSnapshot([OTHER_RUN]);
        const inspections = [
            'cat /tmp/jest-output.txt',
            'ls node_modules/.bin/jest',
            // The regression that sent a peer session into a false block: an
            // inspection pipeline naming jest as a grep argument, which is close
            // to what this rule's own message tells you to run.
            'ps -Ao pid=,lstart=,command= | grep jest',
            'grep -rn jest jest.config.js',
        ];
        for (const c of inspections) {
            expect(run(bash(c), fresh(), { DBV_JEST_PS: ps }).code).toBe(0);
        }
    });

    it('still fires on invocation forms that are easy to miss', () => {
        const ps = psSnapshot([OTHER_RUN]);
        const invocations = [
            'TMPDIR=/tmp/x npx jest --no-coverage',
            'node --max-old-space-size=4096 node_modules/.bin/jest',
            'cd /repo && npx jest tests/foo',
        ];
        for (const c of invocations) {
            expect(run(bash(c), fresh(), { DBV_JEST_PS: ps }).code).toBe(2);
        }
    });
});

describe('reuse-first rule — new UI components only', () => {
    it('interrupts creating a component that does not exist yet', () => {
        const r = run(write('/repo/src/features/x/ui/BrandNewThing.tsx'), fresh());
        expect(r.code).toBe(2);
        expect(r.stderr).toMatch(/reuse-first/);
    });

    it('stays out of the way for a file that already exists', () => {
        // Editing an existing component is not the reflex being guarded.
        expect(run(write(ROUTER), fresh()).code).toBe(0);
    });

    it('ignores test files', () => {
        expect(run(write('/repo/tests/features/x/ui/Thing.tsx'), fresh()).code).toBe(0);
    });
});

describe('webview-test rule', () => {
    it('interrupts a new Spectrum webview test', () => {
        const r = run(edit('/repo/tests/features/x/ui/Thing.test.tsx'), fresh());
        expect(r.code).toBe(2);
        expect(r.stderr).toMatch(/webview-test-authoring/);
    });

    it('ignores a node-side handler test', () => {
        expect(run(edit('/repo/tests/features/x/handlers/thing.test.ts'), fresh()).code).toBe(0);
    });
});

describe('adobe-docs rule — matches on TOOL NAME, not on any payload field', () => {
    it('interrupts a docs search', () => {
        const r = run(mcp('mcp__adobe-exl__search_experience_league'), fresh());
        expect(r.code).toBe(2);
        expect(r.stderr).toMatch(/adobe-docs-lookup/);
    });

    it('interrupts WebSearch and WebFetch', () => {
        expect(run(mcp('WebSearch'), fresh()).code).toBe(2);
        expect(run(mcp('WebFetch'), fresh()).code).toBe(2);
    });

    it('ignores an unrelated MCP tool', () => {
        expect(run(mcp('mcp__serena__find_symbol'), fresh()).code).toBe(0);
    });
});

describe('unquoted-glob rule', () => {
    /**
     * zsh expands a glob BEFORE the command runs. With no match in the CWD it
     * aborts with `no matches found` and the tool never executes — so the result
     * is "never searched", which reads identically to "found nothing". Three
     * incidents on 2026-08-13; one printed five clean zeros and was caught only
     * by a positive control.
     *
     * These tests live here rather than in a shell script for a reason worth
     * keeping: a shell harness that feeds `--include=*.ts` to the router trips
     * this very rule on its own command line. The guard cannot tell a fixture
     * from real usage, so the fixture has to reach it through a child process.
     */
    const GLOB = /quote that glob/;

    it.each([
        ['grep --include', 'grep -rn foo src/ --include=*.ts'],
        ['grep --exclude', 'grep -rn foo . --exclude=*.min.js'],
        ['grep --exclude-dir with a star', 'grep -rl x . --exclude-dir=*modules'],
        ['find -name', 'find tests -name *.test.ts'],
        ['find -iname', 'find . -iname *.MD'],
        ['find -path', 'find . -path */dist/*'],
    ])('blocks %s', (_label, command) => {
        expect(run(bash(command), fresh()).stderr).toMatch(GLOB);
    });

    it.each([
        ['single-quoted', "grep -rn foo src/ --include='*.ts'"],
        ['double-quoted', 'grep -rn foo src/ --include="*.ts"'],
        ['quoted -name', "find tests -name '*.test.ts'"],
        ['no glob at all', 'grep -rn foo src/ --include=index.ts'],
    ])('allows %s', (_label, command) => {
        expect(run(bash(command), fresh()).stderr).not.toMatch(GLOB);
    });

    it.each([
        ['ls', 'ls *.ts'],
        ['cat a path glob', 'cat src/*.json'],
        ['a for-loop over a glob', 'for f in src/*.ts; do echo "$f"; done'],
    ])('does not fire on %s — there the expansion IS the point', (_label, command) => {
        expect(run(bash(command), fresh()).stderr).not.toMatch(GLOB);
    });

    it('is a hard stop, not once-per-session', () => {
        // Same session twice. A spendable guard against a mechanical mistake is
        // no guard: the second occurrence is exactly as silent as the first.
        const session = fresh();
        expect(run(bash('grep -rn a . --include=*.ts'), session).stderr).toMatch(GLOB);
        expect(run(bash('grep -rn b . --include=*.tsx'), session).stderr).toMatch(GLOB);
    });

    it('reaches the rule at all — the router pre-filter admits these commands', () => {
        // The dispatcher has a cheap substring gate before it parses JSON. A rule
        // whose tokens are missing from that gate can never fire, and would look
        // exactly like a rule that works and never matches.
        expect(run(bash('find . -name *.ts'), fresh()).code).toBe(2);
    });
});

describe('rules do not bleed into each other', () => {
    // Each rule must fire ONLY for its own trigger. With five rules in one
    // dispatcher, a loose pattern silently steals another rule's calls.
    it('a Bash rule never fires on a file-path payload, and vice versa', () => {
        expect(run(write('/repo/src/features/x/ui/New.tsx'), fresh()).stderr).not.toMatch(
            /never pipe jest/
        );
        expect(run(bash('npx jest --no-coverage | tail -5'), fresh()).stderr).not.toMatch(
            /reuse-first|webview-test-authoring/
        );
    });
});
