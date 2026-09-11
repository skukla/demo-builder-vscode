#!/usr/bin/env node
/**
 * Prove that a test-enforced convention's enforcer ACTUALLY ENFORCES IT.
 *
 * WHY THIS EXISTS. The handbook's invariant is "N conventions, all N enforced", and
 * every convention names the thing that fails the build. That claim is verified only
 * as far as the path RESOLVES — `doc-module-refs.test.ts` checks that much. Nothing
 * checks that the named suite would go RED if someone broke the rule. A convention
 * could cite a real test file that tests something else entirely and every check in
 * this repo would stay green: the path exists, the suite passes, the claim is false.
 *
 * Hook rules do not have this gap. All 25 carry a `.proof.sh` that feeds the router a
 * known-bad payload and asserts the right rule answers. Test-enforced conventions —
 * 67 of them — carry nothing equivalent. This is that missing half.
 *
 * WHAT A PROOF IS HERE. Plant a violation, run the named enforcer, require it to FAIL.
 * Then confirm the same suite passes without the violation, so a permanently-red
 * enforcer cannot masquerade as a working one.
 *
 * WHY A WORKTREE AND NOT A MOCK. Most SOP enforcers read the tree through
 * `git ls-files`, which lists TRACKED files only — a planted file is invisible until
 * it is staged. That is not incidental: the pre-push hook exists because a new test
 * file was invisible to every enforcer built that way. So the violation has to be
 * planted in a real checkout and staged, which means a throwaway worktree. Planting in
 * the live tree is not an option — PL-44 is an open item about exactly that hazard, a
 * probe file racing every suite that walks `tests/`.
 *
 * WHAT THIS CANNOT DO. It proves the enforcer rejects ONE known violation, not that it
 * rejects every possible one. `every-scan-declares-a-control.test.ts` already reasoned
 * about the limit and reached the same place: whether a test IS a control is not
 * decidable from source. A planted violation is strictly more than a declaration and
 * strictly less than a correctness proof, and that is the honest claim.
 *
 * Usage:
 *   node scripts/convention-proofs.mjs            # every proof
 *   node scripts/convention-proofs.mjs <id>       # one, by id
 *   node scripts/convention-proofs.mjs --list
 *
 * Run it ALONE: it invokes jest, and a second concurrent jest run fails suites at
 * random (the repo blocks that with a hook for the same reason).
 */
import { execFileSync, execSync } from 'child_process';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, symlinkSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import { dirname, join } from 'path';

const ROOT = execSync('git rev-parse --show-toplevel', { encoding: 'utf8' }).trim();

/**
 * One proof per test-enforced convention.
 *
 * `plant` is the violation, written verbatim into the worktree and staged. Keep it the
 * SMALLEST thing that breaks the rule — a proof that plants three violations tells you
 * the suite caught at least one of them.
 */
const PROOFS = [
    {
        id: 'builtin-namespace-mocks',
        convention: 'Never assign a jest.fn() onto a Node builtin namespace',
        enforcer: 'tests/sop/no-builtin-namespace-mock-assignment.test.ts',
        expects: /no builtin namespace is mutated with jest\.fn/,
        plant: {
            path: 'tests/features/zzProof/builtinMock.test.ts',
            content: [
                "import { promises as fs } from 'fs';",
                "describe('planted', () => {",
                "    it('violates the rule', () => {",
                '        fs.unlink = jest.fn();',
                '        expect(1).toBe(1);',
                '    });',
                '});',
                '',
            ].join('\n'),
        },
    },
    {
        id: 'vsix-contents',
        convention: 'Every top-level directory ships or is excluded by .vscodeignore',
        enforcer: 'tests/sop/vsix-contents.test.ts',
        expects: /every top-level directory is classified/,
        // The violation is an UNCLASSIFIED top-level directory — the case the suite
        // exists to force a decision on.
        plant: { path: 'zzProofDir/.gitkeep', content: '' },
    },
    {
        id: 'reversibility',
        convention: 'A capability that creates something names what undoes it',
        enforcer: 'tests/sop/reversibility-ledger.test.ts',
        expects: /every create-shaped tool has a ledger row/,
        // A create-shaped tool with no ledger row. Registered the hand-written way so
        // the shared surface reader finds it.
        plant: {
            path: 'src/features/ai/server/zzProofTools.ts',
            content: [
                '/** Planted by convention-proofs.mjs. */',
                'export function registerZzProofTools(server: { registerTool: (...a: unknown[]) => void }): void {',
                "    server.registerTool('create_zz_proof_thing', {}, async () => ({}));",
                '}',
                '',
            ].join('\n'),
        },
    },
    {
        id: 'no-bare-sleep',
        convention: 'No hand-rolled sleep in src/ — use the shared helper',
        enforcer: 'tests/sop/no-bare-sleep.test.ts',
        expects: /finds no hand-rolled sleep in src/,
        plant: {
            path: 'src/core/utils/zzProofSleep.ts',
            content: [
                '/** Planted by convention-proofs.mjs. */',
                'export async function zzProofWait(ms: number): Promise<void> {',
                '    await new Promise((resolve) => setTimeout(resolve, ms));',
                '}',
                '',
            ].join('\n'),
        },
    },
    {
        id: 'nested-ternary',
        convention: 'No nested ternary operators in source files',
        enforcer: 'tests/sop/complex-expressions.test.ts',
        expects: /should not have nested ternary operators/,
        plant: {
            path: 'src/core/utils/zzProofTernary.ts',
            content: [
                '/** Planted by convention-proofs.mjs. */',
                'export function zzProofPick(a: number): string {',
                "    const label = a > 2 ? 'big' : a > 1 ? 'mid' : 'small';",
                '    return label;',
                '}',
                '',
            ].join('\n'),
        },
    },
    {
        id: 'naming-pascal-tsx',
        convention: 'A PascalCase .tsx exports a symbol of the same name',
        enforcer: 'tests/sop/naming-conventions.test.ts',
        expects: /a PascalCase \.tsx exports a symbol of the same name/,
        plant: {
            path: 'src/core/ui/components/ZzProofWidget.tsx',
            content: [
                '/** Planted by convention-proofs.mjs — the export does NOT match the file. */',
                'export function somethingElseEntirely(): null {',
                '    return null;',
                '}',
                '',
            ].join('\n'),
        },
    },
    {
        id: 'lenient-emptiness',
        convention: 'Assert emptiness with toStrictEqual, never toEqual',
        enforcer: 'tests/sop/no-lenient-emptiness.test.ts',
        expects: /no test asserts emptiness with toEqual/,
        plant: {
            path: 'tests/features/zzProof/lenient.test.ts',
            content: [
                "describe('planted', () => {",
                "    it('asserts emptiness leniently', () => {",
                '        expect([]).toEqual([]);',
                '    });',
                '});',
                '',
            ].join('\n'),
        },
    },
    {
        id: 'disjunction-assertions',
        convention: 'No assertion accepts either of two outcomes',
        enforcer: 'tests/sop/no-disjunction-assertions.test.ts',
        expects: /no assertion accepts either of two outcomes/,
        plant: {
            path: 'tests/features/zzProof/disjunction.test.ts',
            content: [
                "describe('planted', () => {",
                "    it('accepts either outcome', () => {",
                '        const a = 1;',
                '        expect(a === 1 || a === 2).toBe(true);',
                '    });',
                '});',
                '',
            ].join('\n'),
        },
    },
    {
        id: 'jest-environment-docblock',
        convention: 'No test file chooses its own jest environment',
        enforcer: 'tests/sop/no-jest-environment-docblocks.test.ts',
        expects: /no @jest-environment docblock anywhere under tests/,
        plant: {
            path: 'tests/features/zzProof/envDocblock.test.ts',
            content: [
                '/**',
                ' * @jest-environment jsdom',
                ' */',
                "describe('planted', () => {",
                "    it('picks its own environment', () => {",
                '        expect(1).toBe(1);',
                '    });',
                '});',
                '',
            ].join('\n'),
        },
    },
    {
        id: 'src-erases-no-types',
        convention: 'PRODUCTION erases no types — as any and as never are banned in src/',
        enforcer: 'tests/sop/src-erases-no-types.test.ts',
        expects: /no file in src\/ casts to any or never/,
        plant: {
            path: 'src/core/utils/zzProofCast.ts',
            content: [
                '/** Planted by convention-proofs.mjs. */',
                'export function zzProofErase(value: unknown): string {',
                '    return (value as any).whatever;',
                '}',
                '',
            ].join('\n'),
        },
    },
];

function run(cmd, args, cwd) {
    try {
        const out = execFileSync(cmd, args, { cwd, stdio: 'pipe', encoding: 'utf8' });
        return { status: 0, out };
    } catch (e) {
        return { status: e.status ?? 1, out: `${e.stdout ?? ''}${e.stderr ?? ''}` };
    }
}

/**
 * Which assertions failed, by name.
 *
 * ATTRIBUTION IS THE POINT, and it is the same lesson the hook proofs learned: 25
 * rules share one router, so "something blocked" says nothing about which rule
 * answered, and they attribute by message instead. Here, six suites back MORE THAN ONE
 * convention — `architecture-rules.test.ts` backs ten — so "the suite went red" does
 * not say which rule caught the violation. Ten proofs against that suite could all be
 * passing for the same reason, or for a reason unrelated to the convention they claim:
 * a syntax error in the planted file turns the suite red just as well.
 *
 * Jest prints `● <describe> › <test name>` for each failure, twice; dedup and match.
 */
function failedAssertions(output) {
    const names = new Set();
    for (const m of output.matchAll(/●\s+(.+?)\n/g)) {
        const name = m[1].trim();
        if (name && !/Console$/.test(name)) names.add(name);
    }
    return [...names];
}

/** A throwaway checkout of HEAD, sharing .git and borrowing node_modules. */
function makeWorktree() {
    const dir = mkdtempSync(join(tmpdir(), 'convproof-'));
    const wt = join(dir, 'wt');
    execSync(`git worktree add --detach --quiet "${wt}" HEAD`, { cwd: ROOT });
    // jest needs the deps; symlinking beats a multi-minute copy.
    symlinkSync(join(ROOT, 'node_modules'), join(wt, 'node_modules'), 'dir');
    return { dir, wt };
}

function dropWorktree({ dir, wt }) {
    try {
        execSync(`git worktree remove --force "${wt}"`, { cwd: ROOT, stdio: 'ignore' });
    } catch {
        /* fall through to rm */
    }
    rmSync(dir, { recursive: true, force: true });
}

function proveOne(proof) {
    const tree = makeWorktree();
    try {
        const jest = ['jest', '--no-coverage', '--selectProjects', 'node', '--runTestsByPath', proof.enforcer];

        // BASELINE: the enforcer must PASS on a clean tree. Without this a
        // permanently-red suite would read as a working proof.
        const clean = run('npx', jest, tree.wt);
        if (clean.status !== 0) {
            return {
                ...proof,
                verdict: 'BROKEN',
                detail: `enforcer fails on a CLEAN tree — ${failedAssertions(clean.out)[0] ?? 'no assertion named'}`,
            };
        }

        // PLANT: write the violation and stage it — `git ls-files` lists tracked
        // files only, so an unstaged file is invisible to most enforcers here.
        const target = join(tree.wt, proof.plant.path);
        mkdirSync(dirname(target), { recursive: true });
        writeFileSync(target, proof.plant.content);
        execSync(`git add -f "${proof.plant.path}"`, { cwd: tree.wt });

        const planted = run('npx', jest, tree.wt);
        if (planted.status === 0) {
            return { ...proof, verdict: 'UNPROVEN', detail: 'enforcer PASSED with the violation planted' };
        }

        const failed = failedAssertions(planted.out);
        // ATTRIBUTED, not merely red. A proof without `expects` claims only that the
        // suite failed, which for a suite backing ten conventions is nearly no claim
        // at all — so it is required.
        if (!proof.expects) {
            return { ...proof, verdict: 'UNATTRIBUTED', detail: `no \`expects\`; suite failed at: ${failed.join(' | ') || 'unknown'}` };
        }
        const hit = failed.find((n) => proof.expects.test(n));
        return hit
            ? { ...proof, verdict: 'PROVEN', detail: `rejected it at "${hit}"` }
            : {
                  ...proof,
                  verdict: 'WRONG-REASON',
                  detail: `suite failed, but not where expected. Failed at: ${failed.join(' | ') || 'unknown'}`,
              };
    } finally {
        dropWorktree(tree);
    }
}

/**
 * A proof that MUST come back UNPROVEN.
 *
 * Without it this harness is unfalsifiable: every run would print PROVEN and nobody
 * could tell a working check from one that reports success whatever it is fed. Same
 * reason `dogfood.sh` ends with a deliberate failure, and the same reason the rule
 * about pairing "nothing found" with a positive control exists at all.
 *
 * The violation here is real, and aimed at an enforcer that has no business seeing it:
 * a builtin-namespace mock planted against the VSIX-contents suite.
 */
const SELF_TEST = {
    id: 'SELFTEST',
    convention: 'the harness can report failure',
    enforcer: 'tests/sop/vsix-contents.test.ts',
    expects: /every top-level directory is classified/,
    plant: {
        path: 'tests/features/zzProof/wrongEnforcer.test.ts',
        content: [
            "import { promises as fs } from 'fs';",
            "describe('planted', () => {",
            "    it('violates a DIFFERENT rule', () => {",
            '        fs.unlink = jest.fn();',
            '        expect(1).toBe(1);',
            '    });',
            '});',
            '',
        ].join('\n'),
    },
};

const arg = process.argv[2];
if (arg === '--selftest') {
    const r = proveOne(SELF_TEST);
    const ok = r.verdict === 'UNPROVEN';
    console.log(`  selftest verdict: ${r.verdict} — ${r.detail}`);
    console.log(
        ok
            ? '  CONTROL PASSED — the harness can report a failure to prove'
            : '  *** CONTROL FAILED *** — every PROVEN from this harness is meaningless'
    );
    process.exit(ok ? 0 : 1);
}
if (arg === '--list') {
    for (const p of PROOFS) console.log(`  ${p.id.padEnd(26)} ${p.enforcer}`);
    process.exit(0);
}

const selected = arg ? PROOFS.filter((p) => p.id === arg) : PROOFS;
if (selected.length === 0) {
    console.error(`No proof with id "${arg}". Try --list.`);
    process.exit(1);
}
if (!existsSync(join(ROOT, 'node_modules'))) {
    console.error('node_modules is missing — the worktree borrows it.');
    process.exit(1);
}

console.log(`convention proofs — ${selected.length} of ${PROOFS.length}\n`);
let bad = 0;
for (const p of selected) {
    const r = proveOne(p);
    if (r.verdict !== 'PROVEN') bad++;
    console.log(`  ${r.verdict === 'PROVEN' ? 'PROVEN  ' : '*** ' + r.verdict + ' ***'} ${r.id}`);
    console.log(`      ${r.convention}`);
    console.log(`      ${r.enforcer} — ${r.detail}`);
}
console.log(`\n${selected.length - bad}/${selected.length} proven`);
process.exit(bad === 0 ? 0 : 1);
