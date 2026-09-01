#!/usr/bin/env node
/**
 * Find the ONE React trap this repo says no tool catches: a value that is a NEW
 * REFERENCE on every render, handed to a hook that depends on it.
 *
 *   node scripts/codemod/survey-unstable-refs.mjs [--json]
 *
 * WHY IT IS SAID TO BE UNCATCHABLE, and why that is only half true. The claim in
 * CLAUDE.md is about `exhaustive-deps`: it reads the dependency array INSIDE a hook
 * and cannot see across the boundary to the caller that built the value. True. But
 * the type checker CAN cross that boundary — it resolves the call to the hook's
 * declaration, and the hook's dependency arrays are right there to read. So the
 * question "does this inline literal reach a dep array?" is answerable for every
 * hook declared in this repo. That is what this does.
 *
 * WHAT IS A RISK AND WHAT IS NOISE. An inline `[]` / `{}` / `() => …` is a fresh
 * reference every render, but that only MATTERS if something depends on it:
 *
 *   RISK      the argument reaches a dependency array inside the hook — an effect
 *             re-runs every render, and one that sets state loops forever
 *   INERT     it reaches no dependency array; a new reference costs nothing
 *   BUILTIN   React's own hooks, deliberately excluded. `useState([])` is an
 *             INITIAL value read once, and `useMemo(fn, [])` — that `[]` IS the
 *             dependency array. Flagging either would be flagging correct code,
 *             which is how a rule gets switched off
 *   EXTERNAL  the hook is not declared here (a library), so nothing can be read
 *             and nothing is claimed
 *
 * The distinction is the whole point. A detector that reports every inline literal
 * at a hook call reports mostly-correct code and teaches people to ignore it.
 *
 * @see src/core/ui/CLAUDE.md — "the one nothing enforces"
 */
import * as path from 'node:path';
import { Node, SyntaxKind } from 'ts-morph';
import { addFiles, createProject } from './project.mjs';

const JSON_OUT = process.argv.includes('--json');

/**
 * Which tree to read. Defaults to `src/`; the enforcer's CONTROL points it at a
 * fixture instead.
 *
 * The control does NOT plant a probe file in `src/`, deliberately. Jest runs
 * suites in parallel, and a probe appearing and vanishing under another scanner's
 * feet is a race that already broke four of them here on 2026-09-01 — a directory
 * walk listed the file and the read found it gone. A separate fixture tree cannot
 * collide with anything.
 */
const globArg = process.argv.indexOf('--globs');
const GLOBS = globArg !== -1 ? process.argv[globArg + 1].split(',') : ['src/**/*.tsx', 'src/**/*.ts'];

/** React's own hooks. An inline literal here is normal and correct. */
const BUILTIN = new Set([
    'useState', 'useRef', 'useMemo', 'useCallback', 'useEffect', 'useLayoutEffect',
    'useReducer', 'useContext', 'useImperativeHandle', 'useDebugValue', 'useId',
    'useTransition', 'useDeferredValue', 'useSyncExternalStore', 'useInsertionEffect',
]);

/** The hooks whose SECOND argument is a dependency array. */
const DEP_HOOKS = new Set(['useEffect', 'useLayoutEffect', 'useMemo', 'useCallback', 'useInsertionEffect']);

/**
 * The hooks where an unstable dependency can LOOP rather than merely waste work.
 * An effect that re-runs every render and sets state never settles; a `useMemo`
 * that re-runs every render just fails to memoise. Same cause, different severity,
 * and grading them the same is how a real finding gets lost in a list of nits.
 */
const EFFECT_HOOKS = new Set(['useEffect', 'useLayoutEffect', 'useInsertionEffect']);

const project = createProject({ mode: 'typed' });
const files = addFiles(project, GLOBS, { readOnly: true, quiet: JSON_OUT });

function isUnstable(node) {
    const k = node.getKind();
    return (
        k === SyntaxKind.ArrayLiteralExpression ||
        k === SyntaxKind.ObjectLiteralExpression ||
        k === SyntaxKind.ArrowFunction ||
        k === SyntaxKind.FunctionExpression
    );
}

/**
 * Every identifier named in a dependency array anywhere inside the hook body.
 * A name in this set is depended upon; a name absent from it is not.
 */
function dependedNames(fnNode) {
    const names = new Map(); // name -> 'effect' | 'memo'
    for (const call of fnNode.getDescendantsOfKind(SyntaxKind.CallExpression)) {
        const callee = call.getExpression().getText().replace(/^React\./, '');
        if (!DEP_HOOKS.has(callee)) continue;
        const args = call.getArguments();
        // An effect that re-runs every render LOOPS only if it sets state on the
        // way through. One that merely registers a listener re-subscribes every
        // render — waste, and worth fixing, but it settles. Calling both "infinite
        // loop" overstates the second and devalues the first.
        const setsStateSync = EFFECT_HOOKS.has(callee) && (() => {
            const body = args[0];
            if (!body || !Node.isArrowFunction(body) && !Node.isFunctionExpression(body)) return false;
            for (const c of body.getDescendantsOfKind(SyntaxKind.CallExpression)) {
                if (!/^set[A-Z]/.test(c.getExpression().getText().split('.').pop() ?? '')) continue;
                // inside a nested callback = deferred, not synchronous
                let n = c.getParent();
                let nested = false;
                while (n && n !== body) {
                    if (Node.isArrowFunction(n) || Node.isFunctionExpression(n)) { nested = true; break; }
                    n = n.getParent();
                }
                if (!nested) return true;
            }
            return false;
        })();
        const deps = args[args.length - 1];
        if (!deps || deps.getKind() !== SyntaxKind.ArrayLiteralExpression) continue;
        for (const el of deps.getElements()) {
            /**
             * A SPREAD does not depend on the array — it depends on its ELEMENTS.
             * `useEffect(fn, [...conditions, setX])` compares each condition, so
             * the array being freshly built every render changes nothing. This was
             * the second false-positive class, and it accounted for three of the
             * six the detector first called loops: `useCanProceedAll` spreads, and
             * every caller passing an inline array is correct.
             */
            if (el.getKind() === SyntaxKind.SpreadElement) continue;
            // `a.b.c` depends on `a`; the root identifier is what matters
            const root = el.getKind() === SyntaxKind.Identifier ? el : el.getFirstDescendantByKind(SyntaxKind.Identifier);
            if (!root) continue;
            const sev = setsStateSync ? 'loop' : EFFECT_HOOKS.has(callee) ? 'churn' : 'memo';
            const RANK = { memo: 0, churn: 1, loop: 2 };
            const prev = names.get(root.getText());
            // the WORST use of the value is its severity
            if (!prev || RANK[sev] > RANK[prev]) names.set(root.getText(), sev);
        }
    }
    return names;
}

/** Resolve a `use*()` call to its declaration, if that declaration lives here. */
function resolveHook(call) {
    let sym = call.getExpression().getSymbol();
    if (sym?.getAliasedSymbol) sym = sym.getAliasedSymbol() ?? sym;
    for (const d of sym?.getDeclarations() ?? []) {
        const fp = d.getSourceFile().getFilePath();
        if (fp.includes('node_modules')) continue;
        if (Node.isFunctionDeclaration(d) || Node.isArrowFunction(d) || Node.isFunctionExpression(d)) return d;
        if (Node.isVariableDeclaration(d)) {
            const init = d.getInitializer();
            if (init && (Node.isArrowFunction(init) || Node.isFunctionExpression(init))) return init;
        }
    }
    return null;
}

const findings = { LOOP: [], CHURN: [], MEMO: [], INERT: [], EXTERNAL: [], BUILTIN: 0 };

for (const file of files) {
    const rel = path.relative(process.cwd(), file.getFilePath());
    for (const call of file.getDescendantsOfKind(SyntaxKind.CallExpression)) {
        const callee = call.getExpression().getText().replace(/^React\./, '');
        if (!/^use[A-Z]/.test(callee)) continue;

        const args = call.getArguments();
        // Which arguments are freshly-allocated on every render?
        const unstable = [];
        args.forEach((a, i) => {
            if (isUnstable(a)) unstable.push({ index: i, node: a, prop: null });
            // one level in: `useThing({ items: [] })` — the PROPERTY is the value
            // the hook destructures, so that is what a dep array would name
            if (a.getKind() === SyntaxKind.ObjectLiteralExpression) {
                for (const p of a.getProperties()) {
                    if (!Node.isPropertyAssignment(p)) continue;
                    const v = p.getInitializer();
                    if (v && isUnstable(v)) unstable.push({ index: i, node: v, prop: p.getName() });
                }
            }
        });
        if (unstable.length === 0) continue;

        if (BUILTIN.has(callee)) { findings.BUILTIN += unstable.length; continue; }

        const decl = resolveHook(call);
        const line = call.getStartLineNumber();
        if (!decl) {
            findings.EXTERNAL.push(`${rel}:${line}  ${callee}`);
            continue;
        }

        const deps = dependedNames(decl);
        const params = decl.getParameters();
        for (const u of unstable) {
            let name = u.prop;
            if (!name) {
                const p = params[u.index];
                /**
                 * A DESTRUCTURED parameter is the false-positive class this
                 * detector had on its first run, and it was the majority of the
                 * report: `useWizardState({ … })` tears the object apart in its
                 * own signature, so the hook never holds the object and no
                 * dependency array can name it. The literal being fresh on every render
                 * costs exactly nothing. Only a parameter the hook keeps WHOLE —
                 * a plain identifier — can be depended upon.
                 *
                 * The properties INSIDE it are a separate question, and they are
                 * already covered: they are pushed as their own findings above.
                 */
                if (!p || p.getNameNode().getKind() !== SyntaxKind.Identifier) continue;
                name = p.getNameNode().getText();
            }
            const sev = deps.get(name);
            const row = `${rel}:${line}  ${callee}(${u.prop ? `{ ${u.prop}: … }` : `arg ${u.index}`})`;
            if (sev === 'loop') findings.LOOP.push(row);
            else if (sev === 'churn') findings.CHURN.push(row);
            else if (sev === 'memo') findings.MEMO.push(row);
            else findings.INERT.push(row);
        }
    }
}

if (JSON_OUT) { console.log(JSON.stringify(findings, null, 2)); process.exit(0); }

console.log(`\nunstable references handed to hooks — ${files.length} files\n`);
console.log(`  LOOP     (effect sets state -> no settle): ${findings.LOOP.length}`);
console.log(`  CHURN    (effect re-runs, but settles)   : ${findings.CHURN.length}`);
console.log(`  MEMO     (defeats a useMemo/useCallback): ${findings.MEMO.length}`);
console.log(`  INERT    (depended on by nothing)     : ${findings.INERT.length}`);
console.log(`  EXTERNAL (hook not declared here)     : ${findings.EXTERNAL.length}`);
console.log(`  BUILTIN  (React's own — excluded)     : ${findings.BUILTIN}`);
for (const [label, rows] of [['LOOPS', findings.LOOP], ['CHURN', findings.CHURN], ['DEFEATED MEMOS', findings.MEMO]]) {
    if (!rows.length) continue;
    console.log(`\n  ${label}:`);
    for (const r of rows) console.log(`      ${r}`);
}
