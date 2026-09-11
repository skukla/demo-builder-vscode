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
import {
    appendFileSync,
    existsSync,
    mkdirSync,
    mkdtempSync,
    readFileSync,
    rmSync,
    symlinkSync,
    writeFileSync,
} from 'fs';
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
    {
        id: 'react-fc',
        convention: 'A component is declared one way — never React.FC',
        enforcer: 'tests/sop/one-component-form.test.ts',
        expects: /no component is declared as React\.FC/,
        plant: {
            path: 'src/core/ui/components/ZzProofFc.tsx',
            content: [
                "import React from 'react';",
                '/** Planted by convention-proofs.mjs. */',
                'export const ZzProofFc: React.FC = () => null;',
                '',
            ].join('\n'),
        },
    },
    {
        id: 'mirror-placement',
        convention: 'A test file lives at the path mirroring the source it covers',
        enforcer: 'tests/sop/mirror-placement.test.ts',
        expects: /no test file lives in a tier directory|every test file is under a src\/ mirror/,
        plant: {
            path: 'tests/unit/zzProofMisplaced.test.ts',
            content: [
                "describe('planted', () => {",
                "    it('sits in a tier directory', () => {",
                '        expect(1).toBe(1);',
                '    });',
                '});',
                '',
            ].join('\n'),
        },
    },
    {
        id: 'credential-shaped-fixtures',
        convention: 'No credential-shaped fixture in the tree',
        enforcer: 'tests/sop/no-credential-shaped-fixtures.test.ts',
        // Two assertions enforce this convention: a hard ban on the URL/JWT shapes,
        // and a per-file CEILING on credential-shaped assignments. A planted
        // `secret = '...'` trips the ceiling, not the ban — the first `expects`
        // named the ban and the harness reported WRONG-REASON, which is the whole
        // point of attributing rather than accepting any red.
        expects: /credential-shaped assignments than its recorded ceiling|no file carries either shape/,
        plant: {
            path: 'tests/features/zzProof/credShape.test.ts',
            content: [
                "describe('planted', () => {",
                "    it('carries a credential-shaped literal', () => {",
                // A STANDALONE word: the ban is `\\bsecret\\b`, and `clientSecret`
                // has no word boundary before it — the first plant missed for
                // exactly that reason and the harness reported UNPROVEN.
                "        const secret = 'abcd1234efgh5678';",
                '        expect(clientSecret).toBeDefined();',
                '    });',
                '});',
                '',
            ].join('\n'),
        },
    },
    {
        id: 'redundant-automocks',
        convention: 'No bare automock of a module moduleNameMapper already redirects',
        enforcer: 'tests/sop/redundant-automocks.test.ts',
        expects: /no test bare-automocks a module moduleNameMapper already redirects/,
        plant: {
            path: 'tests/features/zzProof/automock.test.ts',
            content: [
                "jest.mock('vscode');",
                "describe('planted', () => {",
                "    it('bare-automocks a mapped module', () => {",
                '        expect(1).toBe(1);',
                '    });',
                '});',
                '',
            ].join('\n'),
        },
    },
    {
        id: 'cited-setting-identifiers',
        convention: 'Never publish an identifier you have not read from the source',
        enforcer: 'tests/sop/cited-identifiers.test.ts',
        expects: /every demoBuilder\.\* identifier a current-tense document names is real/,
        plant: {
            path: 'docs/zzProofCitation.md',
            content: [
                '# Planted by convention-proofs.mjs',
                '',
                'The setting `demoBuilder.zzProofSettingThatDoesNotExist` controls nothing,',
                'because it does not exist. This document is written in the present tense.',
                '',
            ].join('\n'),
        },
    },
    {
        id: 'cited-npm-scripts',
        convention: 'An npm script a current-tense document names is a real script',
        enforcer: 'tests/sop/cited-identifiers.test.ts',
        expects: /every `npm run` a current-tense document names is a real script/,
        plant: {
            path: 'docs/zzProofScript.md',
            content: [
                '# Planted by convention-proofs.mjs',
                '',
                'Run `npm run zz-proof-script-that-does-not-exist` to do the thing.',
                '',
            ].join('\n'),
        },
    },
    {
        id: 'logger-wording-assertions',
        convention: 'No test asserts on logger wording',
        enforcer: 'tests/sop/no-logger-wording-assertions.test.ts',
        // Named exactly. A loose /logger|wording/ matched too, and would have
        // matched nearly any assertion in that suite -- which is attribution in
        // name only.
        expects: /no file exceeds its ceiling, and no unlisted file has any/,
        plant: {
            path: 'tests/features/zzProof/loggerWording.test.ts',
            content: [
                "describe('planted', () => {",
                "    it('asserts on log text', () => {",
                '        const mockLogger = { error: jest.fn() };',
                "        mockLogger.error('boom');",
                "        expect(mockLogger.error).toHaveBeenCalledWith('boom');",
                '    });',
                '});',
                '',
            ].join('\n'),
        },
    },
    {
        id: 'stable-hook-arguments',
        convention: 'A value handed to a hook that depends on it must be stable across renders',
        enforcer: 'tests/sop/stable-hook-arguments.test.ts',
        expects: /no hook is handed a value that is new on every render/,
        // Shape taken from tests/fixtures/unstable-hook-args/probe.tsx, the suite's
        // own control fixture, rather than invented. The first attempt guessed a hook
        // name and a prop and came back UNPROVEN: the detector resolves the CALL to
        // the hook's declaration and reads its dependency array, so the hook has to
        // genuinely depend on the whole object for the caller to be a violation.
        plant: {
            path: 'src/core/ui/hooks/useZzProofUnstable.tsx',
            content: [
                "import { useEffect, useState } from 'react';",
                '',
                '/** Planted by convention-proofs.mjs. Depends on its whole parameter. */',
                'export function useZzProofLoop(opts: { items: string[] }): void {',
                '    const [, setN] = useState(0);',
                '    useEffect(() => {',
                '        setN((n) => n + 1);',
                '    }, [opts.items]);',
                '}',
                '',
                '/** The violation: a NEW array on every render, handed to a hook that depends on it. */',
                'export function ZzProofCaller(): null {',
                '    useZzProofLoop({ items: [] });',
                '    return null;',
                '}',
                '',
            ].join('\n'),
        },
    },
    {
        id: 'reduced-motion-layer',
        convention: 'Every reduced-motion block sits directly in @layer overrides',
        enforcer: 'tests/sop/css-declarations.test.ts',
        expects: /every reduced-motion block sits directly in @layer overrides/,
        plant: {
            path: 'src/core/ui/styles/zz-proof.css',
            content: [
                '/* Planted by convention-proofs.mjs — outside any layer. */',
                '@media (prefers-reduced-motion: reduce) {',
                '    .zz-proof-thing { animation: none; }',
                '}',
                '',
            ].join('\n'),
        },
    },
    {
        id: 'lowered-test-timeout',
        convention: 'Do not lower one test timeout below the file budget',
        enforcer: 'tests/sop/no-lowered-test-timeout.test.ts',
        expects: /finds no per-test timeout that undercuts its file/,
        plant: {
            path: 'tests/features/zzProof/loweredTimeout.test.ts',
            content: [
                'jest.setTimeout(20000);',
                '',
                "describe('planted', () => {",
                "    it('undercuts the file budget', () => {",
                '        expect(1).toBe(1);',
                '    }, 50);',
                '});',
                '',
            ].join('\n'),
        },
    },
    {
        id: 'wall-clock-bounds',
        convention: 'No test bounds a measured duration from above',
        enforcer: 'tests/sop/no-wall-clock-bounds.test.ts',
        expects: /no test bounds a measured duration from above/,
        plant: {
            path: 'tests/features/zzProof/wallClock.test.ts',
            content: [
                "describe('planted', () => {",
                "    it('bounds a duration from above', () => {",
                '        const started = Date.now();',
                '        const elapsed = Date.now() - started;',
                '        expect(elapsed).toBeLessThan(100);',
                '    });',
                '});',
                '',
            ].join('\n'),
        },
    },
    {
        id: 'config-leaf-mocks',
        convention: 'Do not mock a configuration leaf',
        enforcer: 'tests/sop/no-config-leaf-mocks.test.ts',
        expects: /has no NEW config-leaf mocks outside the allowlist/,
        plant: {
            path: 'tests/features/zzProof/configLeaf.test.ts',
            content: [
                "jest.mock('@/features/components/config/components.json', () => ({}));",
                "describe('planted', () => {",
                "    it('mocks a config leaf', () => {",
                '        expect(1).toBe(1);',
                '    });',
                '});',
                '',
            ].join('\n'),
        },
    },
    {
        id: 'canonical-fakes',
        convention: 'A fake that has a builder in tests/helpers/ is imported, not written',
        enforcer: 'tests/sop/canonical-fakes.test.ts',
        expects: /no test file hand-rolls a fake that has a canonical builder/,
        plant: {
            path: 'tests/features/zzProof/handRolledLogger.test.ts',
            content: [
                "describe('planted', () => {",
                "    it('hand-rolls a logger fake', () => {",
                '        const logger = {',
                '            info: jest.fn(),',
                '            warn: jest.fn(),',
                '            error: jest.fn(),',
                '            debug: jest.fn(),',
                '        };',
                '        expect(logger.info).toBeDefined();',
                '    });',
                '});',
                '',
            ].join('\n'),
        },
    },
    {
        id: 'tool-auth-declared',
        convention: 'Every MCP tool declares which sign-ins it needs',
        enforcer: 'tests/sop/tool-auth-declarations.test.ts',
        expects: /every tool answers the question|each tool is declared exactly once/,
        plant: {
            path: 'src/features/ai/server/zzProofAuthTools.ts',
            content: [
                '/** Planted by convention-proofs.mjs — registers a tool with no needsAuth. */',
                'export function registerZzProofAuthTools(server: {',
                '    registerTool: (...a: unknown[]) => void;',
                '}): void {',
                "    server.registerTool('get_zz_proof_undeclared', {}, async () => ({}));",
                '}',
                '',
            ].join('\n'),
        },
    },
    {
        id: 'jsx-and-chains',
        convention: 'No 4+ condition && chains in JSX conditionals',
        enforcer: 'tests/sop/complex-expressions.test.ts',
        expects: /should not have 4\+ condition && chains in JSX conditionals/,
        plant: {
            path: 'src/core/ui/components/ZzProofChain.tsx',
            content: [
                '/** Planted by convention-proofs.mjs. */',
                'export function ZzProofChain(p: {',
                '    a: boolean; b: boolean; c: boolean; d: boolean;',
                '}): JSX.Element {',
                // The pattern is `\{[^{}]*&&[^{}]*&&[^{}]*&&[^{}]*\(` — it requires a
                // PARENTHESISED tail. The first plant ended the chain with `<span>`
                // directly and matched nothing, so the harness said UNPROVEN.
                '    return <div>{p.a && p.b && p.c && p.d && (<span>yes</span>)}</div>;',
                '}',
                '',
            ].join('\n'),
        },
    },
    {
        id: 'handbook-cites-real-enforcers',
        convention: 'Every enforcer the handbook names exists',
        enforcer: 'tests/sop/handbook-links.test.ts',
        expects: /every named enforcer — test, hook rule, script, git hook — exists/,
        // APPENDED, not written: this rule cannot be broken by adding a file. The
        // defect is the handbook naming something that is not there.
        plant: {
            path: 'docs/development/handbook.md',
            append: true,
            content: [
                '',
                '> **Convention.** Planted by convention-proofs.mjs.',
                '> Enforced by `tests/sop/zz-proof-enforcer-that-does-not-exist.test.ts`.',
                '',
            ].join('\n'),
        },
    },
    {
        id: 'convention-scorecard',
        convention: 'The stated convention count matches the conventions actually written',
        enforcer: 'tests/sop/handbook-links.test.ts',
        expects: /the convention scorecard matches the conventions actually stated/,
        plant: {
            path: 'docs/development/handbook.md',
            append: true,
            // Cites a REAL enforcer on purpose, so the only thing broken is the COUNT.
            // Naming a fake one would trip the enforcer-exists assertion instead and
            // the proof would pass for the wrong reason.
            content: [
                '',
                '> **Convention.** Planted by convention-proofs.mjs — the count is now stale.',
                '> Enforced by `tests/sop/handbook-links.test.ts`.',
                // TWO trailing blanks, and it is not cosmetic: a convention block is
                // matched up to `(?=\n\n)`, so a block ending at EOF with one newline
                // is never counted and the plant does nothing. First attempt: UNPROVEN.
                '',
                '',
            ].join('\n'),
        },
    },
    {
        id: 'doc-module-refs',
        convention: 'Every module path a current-tense document cites must resolve',
        enforcer: 'tests/sop/doc-module-refs.test.ts',
        expects: /every backticked repo path names a file that exists/,
        plant: {
            path: 'docs/systems/mcp-server.md',
            append: true,
            content: [
                '',
                '## Planted by convention-proofs.mjs',
                '',
                'The implementation lives in `src/features/zz/proofModuleThatDoesNotExist.ts`.',
                '',
            ].join('\n'),
        },
    },
    {
        id: 'handler-imports-react',
        convention: 'A handler translates and returns — it never renders',
        enforcer: 'tests/sop/architecture-rules.test.ts',
        expects: /no handler imports React/,
        plant: {
            path: 'src/features/dashboard/handlers/zzProofRenderingHandler.ts',
            content: [
                "import React from 'react';",
                '/** Planted by convention-proofs.mjs. */',
                'export const zzProofReact = React;',
                '',
            ].join('\n'),
        },
    },
    {
        id: 'core-imports-feature',
        convention: 'core/ imports neither features nor commands',
        enforcer: 'tests/sop/architecture-rules.test.ts',
        expects: /every crossing is a reasoned ledger entry/,
        plant: {
            path: 'src/core/utils/zzProofCrossing.ts',
            content: [
                "import { registerProjectTools } from '@/features/ai/server/mcpToolResult';",
                '/** Planted by convention-proofs.mjs — core reaching into a feature. */',
                'export const zzProofCrossing = registerProjectTools;',
                '',
            ].join('\n'),
        },
    },
    {
        id: 'central-error-hierarchy',
        convention: 'The central error hierarchy only shrinks',
        enforcer: 'tests/sop/architecture-rules.test.ts',
        expects: /the central error hierarchy only shrinks/,
        // APPENDED: the ratchet counts classes IN that module, so a new file
        // elsewhere would not move it.
        plant: {
            path: 'src/core/errors/index.ts',
            append: true,
            content: [
                '',
                '/** Planted by convention-proofs.mjs. */',
                'export class ZzProofError extends AppError {}',
                '',
            ].join('\n'),
        },
    },
    {
        id: 'feature-barrel',
        convention: 'Features get no new barrel',
        enforcer: 'tests/sop/architecture-rules.test.ts',
        expects: /every feature-level barrel is a reasoned ledger entry/,
        plant: {
            path: 'src/features/mesh/index.ts',
            content: [
                '/** Planted by convention-proofs.mjs — a new feature barrel. */',
                "export * from './services/meshService';",
                '',
            ].join('\n'),
        },
    },
    {
        id: 'webview-channel-singleton',
        convention: 'One message channel per bundle, and it is a singleton',
        enforcer: 'tests/sop/webview-architecture-rules.test.ts',
        expects: /every channel-acquiring file is a reasoned ledger entry/,
        plant: {
            path: 'src/core/ui/utils/zzProofChannel.ts',
            content: [
                '/** Planted by convention-proofs.mjs — a second channel acquisition. */',
                'declare function acquireVsCodeApi(): unknown;',
                'export const zzProofApi = acquireVsCodeApi();',
                '',
            ].join('\n'),
        },
    },
    {
        id: 'webview-inline-literal-prop',
        convention: 'No empty [] or {} literal is passed as a JSX prop',
        enforcer: 'tests/sop/webview-architecture-rules.test.ts',
        expects: /no empty \[\] or \{\} literal is passed as a JSX prop/,
        plant: {
            path: 'src/core/ui/components/ZzProofLiteralProp.tsx',
            content: [
                '/** Planted by convention-proofs.mjs. */',
                'function ZzProofChild(_p: { items: string[] }): null {',
                '    return null;',
                '}',
                'export function ZzProofLiteralProp(): JSX.Element {',
                '    return <ZzProofChild items={[]} />;',
                '}',
                '',
            ].join('\n'),
        },
    },
    {
        id: 'component-style-block',
        convention: 'A webview component defines no CSS in a <style> block',
        enforcer: 'tests/sop/stylesheet-bundles.test.ts',
        expects: /a webview component defines NO CSS in a <style> block/,
        plant: {
            path: 'src/core/ui/components/ZzProofStyleBlock.tsx',
            content: [
                '/** Planted by convention-proofs.mjs. */',
                'export function ZzProofStyleBlock(): JSX.Element {',
                '    return (',
                '        <div>',
                '            <style>{`.zz-proof { color: red; }`}</style>',
                '        </div>',
                '    );',
                '}',
                '',
            ].join('\n'),
        },
    },
    {
        id: 'credential-env-registered',
        convention: 'A credential environment variable is registered as a secret',
        enforcer: 'tests/sop/credential-env-vars-registered.test.ts',
        expects: /registers every credential-shaped env var in SECRET_ENV_KEYS/,
        // TRANSFORMED, not written: the enforcer reads ONE file, components.json, so
        // a new file is invisible to it — the first plant created one and came back
        // UNPROVEN. Appending would break the JSON, hence the third mode.
        plant: {
            path: 'src/features/components/config/components.json',
            transform: (text) => {
                const doc = JSON.parse(text);
                // TOP-LEVEL `envVars`, which is what the enforcer reads. The second
                // attempt added it to a component's own `env` and was invisible —
                // the reader is `catalog.envVars`, and nothing else.
                doc.envVars = { ...(doc.envVars ?? {}), ZZ_PROOF_API_KEY: {} };
                return `${JSON.stringify(doc, null, 4)}\n`;
            },
        },
    },
    {
        id: 'fetch-boundary',
        convention: 'Services are fetched only at the boundary',
        enforcer: 'tests/sop/architecture-rules.test.ts',
        expects: /every out-of-boundary fetch is a reasoned ledger entry/,
        plant: {
            path: 'src/features/dashboard/services/zzProofFetch.ts',
            content: [
                '/** Planted by convention-proofs.mjs — a fetch below the boundary. */',
                "import { ServiceLocator } from '@/core/services/serviceLocator';",
                '',
                'export function zzProofFetch(): unknown {',
                "    return ServiceLocator.get('stateManager');",
                '}',
                '',
            ].join('\n'),
        },
    },
    {
        id: 'stateful-construction',
        convention: 'A class that accumulates state is constructed in one place',
        enforcer: 'tests/sop/architecture-rules.test.ts',
        expects: /every out-of-boundary construction of a STATEFUL class is a reasoned ledger entry/,
        // GitHubTokenService, because the enforcer's own control pins it as
        // stateful (it carries a validation cache). A stateless class here would
        // be no violation at all — the rule is about forking state, not about the
        // word `new`.
        plant: {
            path: 'src/features/dashboard/services/zzProofConstruct.ts',
            content: [
                '/** Planted by convention-proofs.mjs — a second owner of a cached service. */',
                "import { GitHubTokenService } from '@/features/eds/services/github/gitHubTokenService';",
                '',
                'export function zzProofConstruct(): unknown {',
                '    return new GitHubTokenService();',
                '}',
                '',
            ].join('\n'),
        },
    },
    {
        id: 'composition-point-lifetime',
        convention: 'A repeated composition point builds nothing stateful',
        enforcer: 'tests/sop/architecture-rules.test.ts',
        expects: /every stateful class built in a repeated composition point is a reasoned ledger entry/,
        // Planted INTO a composition point, because that is what the rule is about.
        // The same construction anywhere else is the rule above; here the defect is
        // the LIFETIME — this factory runs per incoming message, so a cache built
        // in it is empty every time it is read.
        plant: {
            path: 'src/commands/handlerContextFactory.ts',
            append: true,
            content: [
                '',
                '/** Planted by convention-proofs.mjs — a cache with a per-message lifetime. */',
                'export const zzProofCache = (): unknown => new PrerequisitesCacheManager();',
                '',
            ].join('\n'),
        },
    },
    {
        id: 'command-base-class',
        convention: 'Commands extend BaseCommand or BaseWebviewCommand',
        enforcer: 'tests/sop/architecture-rules.test.ts',
        expects: /every non-extending command class is a reasoned ledger entry/,
        plant: {
            path: 'src/commands/zzProofCommand.ts',
            content: [
                '/** Planted by convention-proofs.mjs — a command extending nothing. */',
                'export class ZzProofCommand {',
                '    public execute(): void {',
                '        /* nothing */',
                '    }',
                '}',
                '',
            ].join('\n'),
        },
    },
    {
        id: 'types-purity',
        convention: 'Files in src/types/ use import type only',
        enforcer: 'tests/sop/architecture-rules.test.ts',
        expects: /every runtime-importing types file is a reasoned ledger entry/,
        plant: {
            path: 'src/types/zzProofTypes.ts',
            content: [
                '/** Planted by convention-proofs.mjs — a runtime import in a types file. */',
                "import { join } from 'path';",
                '',
                'export interface ZzProofShape {',
                '    path: string;',
                '}',
                '',
                'export const zzProofJoin = join;',
                '',
            ].join('\n'),
        },
    },
    {
        id: 'one-dependency-bundle',
        convention: 'A service takes one dependency bundle per call',
        enforcer: 'tests/sop/architecture-rules.test.ts',
        expects: /no function takes two dependency bundles/,
        plant: {
            path: 'src/features/dashboard/services/zzProofTwoDeps.ts',
            content: [
                '/** Planted by convention-proofs.mjs — two envelopes in one signature. */',
                'interface ZzProofFooDeps { a: number }',
                'interface ZzProofBarDeps { b: number }',
                '',
                'export function zzProofTwoDeps(foo: ZzProofFooDeps, bar: ZzProofBarDeps): number {',
                '    return foo.a + bar.b;',
                '}',
                '',
            ].join('\n'),
        },
    },
    {
        id: 'argument-cast',
        convention: 'Never pass an argument as any or never',
        enforcer: 'tests/sop/architecture-rules.test.ts',
        expects: /no argument is passed as any or never/,
        plant: {
            path: 'src/features/dashboard/services/zzProofArgCast.ts',
            content: [
                '/** Planted by convention-proofs.mjs — a silenced type error at a call. */',
                'function zzProofTake(value: { id: string }): string {',
                '    return value.id;',
                '}',
                '',
                'export function zzProofArgCast(payload: unknown): string {',
                '    return zzProofTake(payload as any);',
                '}',
                '',
            ].join('\n'),
        },
    },
    {
        id: 're-export-index',
        convention: 'A module is imported by the path that defines the symbol',
        enforcer: 'tests/sop/architecture-rules.test.ts',
        expects: /every re-exporting index file is a reasoned ledger entry/,
        plant: [
            {
                path: 'src/core/utils/zzProofBarrel/thing.ts',
                content: [
                    '/** Planted by convention-proofs.mjs — the real home of the symbol. */',
                    'export const zzProofThing = 1;',
                    '',
                ].join('\n'),
            },
            {
                path: 'src/core/utils/zzProofBarrel/index.ts',
                content: [
                    '/** Planted by convention-proofs.mjs — a second path to the same symbol. */',
                    "export { zzProofThing } from './thing';",
                    '',
                ].join('\n'),
            },
        ],
    },
    {
        id: 'cross-bundle-class',
        convention: 'A CSS class used in a bundle is styled by that bundle',
        enforcer: 'tests/sop/stylesheet-bundles.test.ts',
        expects: /every cross-bundle class use is a reasoned ledger entry/,
        // `repo-private-badge` is defined in eds-steps.css and in NOTHING ELSE,
        // and the SIDEBAR entry does not import that sheet. That is the whole
        // defect in one line: the class is real, the sheet is real, and the
        // surface renders it bare with no error anywhere.
        //
        // The first plant used `text-orange-600` — the class the enforcer's own
        // positive control names — and came back UNPROVEN, because utilities.css
        // ALSO defines it and the sidebar imports utilities.css. A class defined
        // in two sheets is styled on any bundle that loads either one. The plant
        // has to be a class exactly one sheet defines.
        plant: {
            path: 'src/features/sidebar/ui/index.tsx',
            append: true,
            content: [
                '',
                '/** Planted by convention-proofs.mjs — a class this bundle does not load. */',
                'export function ZzProofCrossBundle(): React.ReactElement {',
                '    return <div className="repo-private-badge" />;',
                '}',
                '',
            ].join('\n'),
        },
    },
    {
        id: 'important-ceiling',
        convention: '!important is a symptom, not a mechanism — the count may only fall',
        enforcer: 'tests/sop/stylesheet-bundles.test.ts',
        expects: /the count never grows, and a fall is pinned/,
        plant: {
            path: 'src/core/ui/styles/zz-proof-important.css',
            content: [
                '/* Planted by convention-proofs.mjs — one !important against a ceiling of zero. */',
                '@layer overrides {',
                '    .zz-proof-important { color: red !important; }',
                '}',
                '',
            ].join('\n'),
        },
    },
    {
        id: 'vendor-layer-measured',
        convention: 'Vendor CSS is layered only for entries that have been measured',
        enforcer: 'tests/sop/stylesheet-bundles.test.ts',
        expects: /only entries that have been MEASURED are layered/,
        plant: {
            path: 'esbuild.config.js',
            transform: (text) => {
                const from = 'const LAYERED_VENDOR_ENTRIES = [';
                if (!text.includes(from)) throw new Error('LAYERED_VENDOR_ENTRIES not found');
                return text.replace(from, `${from}\n    'zzProofUnmeasured',`);
            },
        },
    },
    {
        id: 'stylesheet-owner',
        convention: 'A stylesheet lives where its owner lives',
        enforcer: 'tests/sop/stylesheet-bundles.test.ts',
        expects: /a core\/ui sheet holds shared-component or cross-feature classes, never one feature's/,
        // TWO FILES, and the second is the point. A sheet in core/ui is only
        // MISPLACED once exactly one feature uses it — a sheet nobody uses is dead
        // CSS, which the enforcer deliberately reports as a different defect. So
        // the plant has to create a user, and exactly one.
        plant: [
            {
                path: 'src/core/ui/styles/zz-proof-owner.css',
                // TWO RULES, and the first one is scaffolding. The reader splits the
                // sheet on `}` and takes the first `{` in each piece, so the opening
                // piece of a layered sheet is the `@layer` line itself and its
                // selector holds no class at all. A sheet with ONE rule is therefore
                // invisible to this check — the first plant had exactly that shape
                // and came back UNPROVEN.
                content: [
                    '/* Planted by convention-proofs.mjs — one feature\'s classes in a shared sheet. */',
                    '@layer overrides {',
                    '    .zzproofowner-anchor { color: red; }',
                    '    .zzproofowner-thing { color: blue; }',
                    '}',
                    '',
                ].join('\n'),
            },
            {
                path: 'src/features/dashboard/ui/ZzProofOwner.tsx',
                content: [
                    '/** Planted by convention-proofs.mjs — the single feature using it. */',
                    "import React from 'react';",
                    '',
                    'export function ZzProofOwner(): React.ReactElement {',
                    '    return <div className="zzproofowner-thing" />;',
                    '}',
                    '',
                ].join('\n'),
            },
        ],
    },
    {
        id: 'motion-timings',
        convention: "Motion timings come from Spectrum's scale, not hand-written milliseconds",
        enforcer: 'tests/sop/css-declarations.test.ts',
        expects: /no hand-written sub-second duration survives/,
        plant: {
            path: 'src/core/ui/styles/zz-proof-motion.css',
            content: [
                '/* Planted by convention-proofs.mjs — a hand-written sub-second timing. */',
                '@layer overrides {',
                '    .zz-proof-motion { transition: opacity 0.2s ease; }',
                '}',
                '',
            ].join('\n'),
        },
    },
    {
        id: 'stylesheet-parses',
        convention: 'Every stylesheet parses — no selector list is interrupted by an at-rule',
        enforcer: 'tests/sop/css-declarations.test.ts',
        expects: /no selector list is interrupted by an at-rule/,
        // The exact shape that shipped three times: the migration's mover found
        // rules by their BRACE line, so a selector list spread over several lines
        // had the wrapper inserted into the middle of it. Chrome keeps zero rules
        // from that, and nothing in the build ever parses the CSS to notice.
        plant: {
            path: 'src/core/ui/styles/zz-proof-parse.css',
            content: [
                '/* Planted by convention-proofs.mjs — a selector list broken by an at-rule. */',
                '.zz-proof-a,',
                '@layer overrides {',
                '.zz-proof-b { color: red; }',
                '}',
                '',
            ].join('\n'),
        },
    },
    {
        id: 'utility-class-explosion',
        convention: 'Utility classes live in one documented sheet, not scattered',
        enforcer: 'tests/sop/inline-styles.test.ts',
        expects: /should not have utility class patterns in non-documented CSS files/,
        plant: {
            path: 'src/core/ui/styles/zz-proof-utilities.css',
            content: [
                '/* Planted by convention-proofs.mjs — Tailwind-shaped utilities outside utilities.css. */',
                '@layer overrides {',
                '    .mt-4 { margin-top: 1rem; }',
                '    .px-3 { padding-inline: 0.75rem; }',
                '}',
                '',
            ].join('\n'),
        },
    },
    {
        id: 'scan-declares-a-control',
        convention: 'Every SOP scan declares a control',
        enforcer: 'tests/sop/every-scan-declares-a-control.test.ts',
        expects: /names a CONTROL test in every scan suite/,
        plant: {
            path: 'tests/sop/zzProofNoControl.test.ts',
            content: [
                '/** Planted by convention-proofs.mjs — a scan suite with no declared control. */',
                "it('finds no violations', () => {",
                '    expect([]).toStrictEqual([]);',
                '});',
                '',
            ].join('\n'),
        },
    },
    {
        id: 'enforcer-count-stated',
        convention: 'The stated enforcer-suite count matches the disk',
        enforcer: 'tests/sop/tooling-registry.test.ts',
        expects: /the stated count equals the suites in tests\/sop\//,
        // The SAME shape of plant as the proof above, aimed at a different suite.
        // One new file under tests/sop/ is both an undeclared scan and an
        // uncounted enforcer, and the two enforcers catch it independently —
        // which is the clearest demonstration available that these proofs are
        // attributing to the right assertion rather than to "something went red".
        plant: {
            path: 'tests/sop/zzProofExtraScan.test.ts',
            content: [
                '/** Planted by convention-proofs.mjs — an enforcer the count does not know about. */',
                "it('CONTROL: this planted suite is visible', () => {",
                '    expect(true).toBe(true);',
                '});',
                '',
            ].join('\n'),
        },
    },
    {
        id: 'ratchet-fails-both-ways',
        convention: 'A ratchet helper fails in both directions',
        enforcer: 'tests/sop/ratchet-controls.test.ts',
        expects: /fails when the count GREW above the pin/,
        // The violation here is not a new file — it is the RATCHET ITSELF going
        // one-sided, which is the failure the suite exists to catch and the one
        // nothing else could see: every ledger suite in the repo stays green
        // while a blunted `expectCeiling` banks regressions as easily as gains.
        plant: {
            path: 'tests/sop/architectureScan.ts',
            transform: (text) => {
                const from = "count > ceiling ? 'GREW_ABOVE_CEILING'";
                if (!text.includes(from)) throw new Error('expectCeiling verdict not found');
                return text.replace(from, "count > ceiling ? 'at'");
            },
        },
    },
    {
        id: 'test-family-shared-setup',
        convention: 'A split test family shares its setup',
        enforcer: 'tests/sop/test-family-setup.test.ts',
        expects: /no NEW family arrives without a shared setup/,
        // THREE FILES, because one is a violation of nothing. A family needs two
        // suites before it is a family, and the detector only treats a group as
        // real when a SOURCE file carries the subject's name — otherwise every
        // pair of suites whose names share a token would be a family.
        plant: [
            {
                path: 'src/core/utils/zzProofFamily.ts',
                content: [
                    '/** Planted by convention-proofs.mjs — the subject a family needs. */',
                    'export const zzProofFamily = (): number => 1;',
                    '',
                ].join('\n'),
            },
            {
                path: 'tests/core/utils/zzProofFamily.test.ts',
                content: [
                    "it('zz proof one', () => {",
                    '    expect(1).toBe(1);',
                    '});',
                    '',
                ].join('\n'),
            },
            {
                path: 'tests/core/utils/zzProofFamily-extra.test.ts',
                content: [
                    "it('zz proof two', () => {",
                    '    expect(2).toBe(2);',
                    '});',
                    '',
                ].join('\n'),
            },
        ],
    },
    {
        id: 'type-erasing-cast',
        convention: 'A test never erases a type',
        enforcer: 'tests/sop/type-erasing-casts.test.ts',
        expects: /the count only ever falls/,
        plant: {
            path: 'tests/core/utils/zzProofCast.test.ts',
            content: [
                '/** Planted by convention-proofs.mjs — a cast that erases its target. */',
                "it('zz proof cast', () => {",
                '    const widget = {} as any;',
                '    expect(widget).toBeDefined();',
                '});',
                '',
            ].join('\n'),
        },
    },
    {
        id: 'mock-wall-order',
        convention: 'A shared mock wall is imported before the subject',
        enforcer: 'tests/sop/mock-wall-import-order.test.ts',
        expects: /no NEW suite imports its subject before the wall/,
        // TWO FILES: the wall has to exist before a suite can import it in the
        // wrong order. The detector finds walls by reading every non-suite file
        // under tests/ for a top-level jest.mock, so the wall must be real.
        plant: [
            {
                path: 'tests/core/utils/zzProofWall.ts',
                content: [
                    '/** Planted by convention-proofs.mjs — a module wall. */',
                    "jest.mock('@/core/logging/debugLogger');",
                    '',
                    'export const zzProofWallReady = true;',
                    '',
                ].join('\n'),
            },
            {
                path: 'tests/core/utils/zzProofOrder.test.ts',
                content: [
                    '/** Planted by convention-proofs.mjs — the subject imported ABOVE the wall. */',
                    "import { zzProofFamily } from '@/core/utils/zzProofFamily';",
                    '',
                    "import { zzProofWallReady } from './zzProofWall';",
                    '',
                    "it('zz proof order', () => {",
                    '    expect(zzProofWallReady && zzProofFamily()).toBe(1);',
                    '});',
                    '',
                ].join('\n'),
            },
            {
                path: 'src/core/utils/zzProofFamily.ts',
                content: [
                    '/** Planted by convention-proofs.mjs — the subject the suite imports. */',
                    'export const zzProofFamily = (): number => 1;',
                    '',
                ].join('\n'),
            },
        ],
    },
    {
        id: 'builder-uniqueness',
        convention: 'A test builder name has one definition',
        enforcer: 'tests/sop/builder-uniqueness.test.ts',
        expects: /no NEW name becomes duplicated/,
        plant: [
            {
                path: 'tests/core/utils/zzProofBuilderOne.ts',
                content: [
                    '/** Planted by convention-proofs.mjs — one of two definitions. */',
                    'export function createZzProofThing(): number {',
                    '    return 1;',
                    '}',
                    '',
                ].join('\n'),
            },
            {
                path: 'tests/core/utils/zzProofBuilderTwo.ts',
                content: [
                    '/** Planted by convention-proofs.mjs — the second definition of the same name. */',
                    'export function createZzProofThing(): number {',
                    '    return 2;',
                    '}',
                    '',
                ].join('\n'),
            },
        ],
    },
    {
        id: 'magic-timeout',
        convention: 'A timeout is a named constant, not a number at the call site',
        enforcer: 'tests/sop/magic-timeouts.test.ts',
        expects: /should not have magic timeout numbers in core UI components/,
        plant: {
            path: 'src/core/ui/components/ZzProofMagicTimeout.tsx',
            content: [
                '/** Planted by convention-proofs.mjs — a raw millisecond literal. */',
                'export function zzProofMagicTimeout(done: () => void): void {',
                '    setTimeout(done, 5000);',
                '}',
                '',
            ].join('\n'),
        },
    },
    {
        id: 'credential-sink-scope',
        convention: 'A setting naming a credential sink is machine-scoped',
        enforcer: 'tests/sop/credential-sink-settings-scoped.test.ts',
        expects: /demoBuilder\.byom\.overlayUrl is machine-scoped/,
        // A TEXT transform, not JSON.parse/stringify. package.json's user-visible
        // settings descriptions carry em-dashes, and a round-trip through
        // JSON.stringify is fine but a round-trip through Python's json.dumps is
        // not — that one escaped every one of them to — across the file on
        // 2026-09-10. Editing the one line keeps the blast radius at one line.
        plant: {
            path: 'package.json',
            transform: (text) => {
                const at = text.indexOf('"demoBuilder.byom.overlayUrl"');
                if (at < 0) throw new Error('byom.overlayUrl setting not found');
                const head = text.slice(0, at);
                const tail = text.slice(at).replace('"scope": "machine"', '"scope": "window"');
                return head + tail;
            },
        },
    },
    {
        id: 'modal-hosting',
        convention: 'Modals are hosted in one place, not mounted where they are opened',
        enforcer: 'tests/sop/modal-hosting.test.ts',
        expects: /hosts every Modal in a DialogContainer or DialogTrigger/,
        plant: {
            path: 'src/core/ui/components/ZzProofUnhostedModal.tsx',
            content: [
                '/** Planted by convention-proofs.mjs — a Modal with no host. */',
                "import React from 'react';",
                '',
                "import { Modal } from '@/core/ui/components/ui/Modal';",
                '',
                'export function ZzProofUnhostedModal(): React.ReactElement {',
                '    return <Modal isOpen onClose={() => undefined} />;',
                '}',
                '',
            ].join('\n'),
        },
    },
    {
        id: 'handler-context-factory',
        convention: 'A HandlerContext is built by a factory, never by hand',
        enforcer: 'tests/sop/handler-context-from-factory.test.ts',
        expects: /builds its context through a factory/,
        plant: {
            path: 'src/core/communication/zzProofHandContext.ts',
            content: [
                '/** Planted by convention-proofs.mjs — a hand-assembled context. */',
                "import type { HandlerContext } from '@/types/handlers';",
                '',
                'export function zzProofBuildContext(): HandlerContext {',
                '    return {} as HandlerContext;',
                '}',
                '',
            ].join('\n'),
        },
    },
    {
        id: 'god-file-ceiling',
        convention: 'A source file stays within the size limit for its kind',
        enforcer: 'tests/sop/god-file-ratchet.test.ts',
        expects: /the number of files over their limit only falls/,
        // A SERVICE path, so the limit is 400. The limit is chosen by the path,
        // not by the content, so the directory is the load-bearing half of this
        // plant — the same 450 lines under `src/core/` would have no stated limit
        // and the ratchet would never see them.
        plant: {
            path: 'src/features/dashboard/services/zzProofGodFile.ts',
            content: [
                '/** Planted by convention-proofs.mjs — a service over its 400-line limit. */',
                'export const ZZ_PROOF_ROWS: number[] = [',
                ...Array.from({ length: 450 }, (_, i) => `    ${i},`),
                '];',
                '',
            ].join('\n'),
        },
    },
    {
        id: 'class-defined-nowhere',
        convention: 'A CSS class a component uses is defined somewhere',
        enforcer: 'tests/sop/stylesheet-bundles.test.ts',
        expects: /every class defined NOWHERE is a reasoned ledger entry/,
        // PLANTED INTO A BUNDLE ENTRY, not into a new file. The first attempt
        // created `src/core/ui/components/ZzProofUndefinedClass.tsx` and reported
        // UNPROVEN: the scan walks the module graph esbuild resolves from the eight
        // entries, so a component NOTHING IMPORTS is never read. That is correct
        // behaviour by the enforcer — an unreachable file styles no surface — and a
        // wrong plant by me. An entry file is reachable by definition.
        plant: {
            path: 'src/features/sidebar/ui/index.tsx',
            append: true,
            content: [
                '',
                '/** Planted by convention-proofs.mjs — a class no stylesheet defines. */',
                'export function ZzProofUndefinedClass(): React.ReactElement {',
                '    return <div className="zz-proof-class-defined-nowhere" />;',
                '}',
                '',
            ].join('\n'),
        },
    },
    {
        id: 'undeclared-layer',
        convention: 'Every @layer block names a layer the cascade order declares',
        enforcer: 'tests/sop/stylesheet-bundles.test.ts',
        expects: /every @layer block names a layer the order declares/,
        plant: {
            path: 'src/core/ui/styles/zz-proof-layer.css',
            content: [
                '/* Planted by convention-proofs.mjs — a layer nobody declared. */',
                '@layer zzProofUndeclared {',
                '    .zz-proof-layered { color: red; }',
                '}',
                '',
            ].join('\n'),
        },
    },
    {
        id: 'rules-outside-a-layer',
        convention: 'Rules outside every cascade layer may not grow',
        enforcer: 'tests/sop/stylesheet-bundles.test.ts',
        expects: /rules outside every layer may not grow/,
        plant: {
            path: 'src/core/ui/styles/zz-proof-unlayered.css',
            content: [
                '/* Planted by convention-proofs.mjs — a rule in no layer at all. */',
                '.zz-proof-unlayered { color: blue; }',
                '',
            ].join('\n'),
        },
    },
    {
        id: 'static-inline-styles',
        convention: 'The static inline-style count never grows',
        enforcer: 'tests/sop/inline-styles.test.ts',
        expects: /the static count never grows, and a fall is pinned/,
        plant: {
            path: 'src/core/ui/components/ZzProofInlineStyle.tsx',
            content: [
                '/** Planted by convention-proofs.mjs. */',
                'export function ZzProofInlineStyle(): JSX.Element {',
                '    return <div style={{ margin: 10, padding: 4 }} />;',
                '}',
                '',
            ].join('\n'),
        },
    },
];

/**
 * CONVENTIONS WITH NO WRITEABLE PROOF — the harness found what it was built to find.
 *
 * `component-extraction`: the handbook states "markup repeated in three or more places
 * becomes a component" and names `tests/sop/component-extraction.test.ts`. That suite
 * asserts four ADJACENT things — abstract classes with under two implementations, HOC
 * naming, over-generic wrappers, and usage counts for four named shared components —
 * and NOTHING about repeated markup. No violation of the stated convention can make it
 * red, so no proof can be written for it.
 *
 * This is not obviously a bug in the suite. CLAUDE.md states that duplication is the one
 * defect class deliberately left without an automatic hook, because deciding whether two
 * things SHOULD be one needs judgement — `component-extraction-scan` is the guided review
 * that owns it. So the likely correction is to the HANDBOOK: say what the suite enforces,
 * and move the three-copies rule to the reviewed tier. That changes the "every convention
 * is enforced" scorecard, which is the owner's call, so it is recorded here rather than
 * applied. (Found 2026-09-11, PL-55.)
 */

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
    // Five enforcers read the BUILT bundles. Without this their baseline run fails
    // on a clean worktree and the harness reports BROKEN rather than proving
    // anything. Borrowed read-only, exactly like node_modules — no proof rebuilds.
    if (existsSync(join(ROOT, 'dist'))) {
        symlinkSync(join(ROOT, 'dist'), join(wt, 'dist'), 'dir');
    }
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
        //
        // A plant may be a LIST. Some conventions cannot be broken by one file:
        // "a split test family shares its setup" needs two siblings before there
        // is a family at all, and "a builder name has one definition" needs a
        // second definition. One file each would be a violation of nothing.
        for (const step of [proof.plant].flat()) {
            const target = join(tree.wt, step.path);
            mkdirSync(dirname(target), { recursive: true });
            // APPEND when the violation has to live inside an existing file. Some rules
            // cannot be broken by adding a new file at all — a handbook citing an
            // enforcer that does not exist is a defect IN the handbook.
            if (step.transform) {
                // The third mode, and JSON forced it: some rules are broken only by
                // EDITING a specific file, where appending raw text would produce
                // something the enforcer cannot even parse. `transform` reads the real
                // content and returns the modified version.
                writeFileSync(target, step.transform(readFileSync(target, 'utf8')));
            } else if (step.append) {
                appendFileSync(target, step.content);
            } else {
                writeFileSync(target, step.content);
            }
            execSync(`git add -f "${step.path}"`, { cwd: tree.wt });
        }

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
