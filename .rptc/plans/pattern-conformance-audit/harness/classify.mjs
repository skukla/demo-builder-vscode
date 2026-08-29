#!/usr/bin/env node
/**
 * The audit's classifier — fills ledger.json with one verdict per (unit,
 * pattern). Verdict semantics are deliberately canon-neutral (no winner has
 * been ratified yet):
 *   conforming = the unit uses exactly ONE style, consistently
 *   deviating  = the unit MIXES styles, or violates an already-enforced rule
 *   exempt     = the pattern does not apply (evidence says why)
 * The STYLE each unit uses goes in `evidence`, so the slate can tally
 * prevalence for the owner's ruling without pre-judging it.
 *
 * Universe selection reuses the EXACT commands denominators.sh uses — a
 * classifier scoped differently from its denominator would reconcile against
 * the wrong total (the same-scope control rule).
 */
import { execSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const HARNESS = new URL('.', import.meta.url).pathname;
// Anchored to the repo root, the way program-metrics.mjs already was.
//
// WHY, in blood: every command below is a `git ls-files 'src/…'` or a `grep -r
// src`, and execSync inherits the caller's cwd. Run from this harness directory
// — the obvious place to run it from — they match NOTHING, every universe comes
// back empty, and the script cheerfully writes a ledger with zero rows over the
// real one. That happened on 2026-08-29: 998 rows to 5, no error, exit 0.
const ROOT = execSync('git rev-parse --show-toplevel', { encoding: 'utf8' }).trim();
const sh = (cmd) => execSync(cmd, { encoding: 'utf8', cwd: ROOT, maxBuffer: 64 * 1024 * 1024 }).trim();
const lines = (cmd) => { const out = sh(cmd + ' || true'); return out ? out.split('\n') : []; };

const srcFiles = lines(`git ls-files 'src/*.ts' 'src/*.tsx' 'src/**/*.ts' 'src/**/*.tsx'`);
const handlerFiles = lines(`grep -rln "defineHandlers\\|: MessageHandler" src --include="*.ts"`)
    .filter((f) => /andlers/.test(f));
const serviceFiles = lines(`grep -rln "^export class.*Service\\|^export class.*Manager" src --include="*.ts"`);
const registrarFiles = lines(`grep -rln "registerTool(" src --include="*.ts"`);

const rows = [];
const add = (unit, pattern, verdict, evidence) => rows.push({ unit, pattern, verdict, evidence });

// ── P1: di-style — every src file ───────────────────────────────────────────
for (const f of srcFiles) {
    const s = readFileSync(join(ROOT, f), 'utf8');
    const locator = (s.match(/ServiceLocator\.get/g) ?? []).length;
    const construct = (s.match(/new [A-Z][A-Za-z]*(Service|Manager|Client)\(/g) ?? []).length;
    if (f === 'src/extension.ts') {
        add(f, 'di-style', 'exempt', 'composition root — constructing and registering here IS the pattern');
    } else if (locator === 0 && construct === 0) {
        add(f, 'di-style', 'exempt', 'acquires no services');
    } else if (locator > 0 && construct > 0) {
        add(f, 'di-style', 'deviating', `MIXES styles: ${locator} locator reach-in(s) + ${construct} direct construction(s)`);
    } else if (locator > 0) {
        add(f, 'di-style', 'conforming', `style=locator (${locator} site(s))`);
    } else {
        add(f, 'di-style', 'conforming', `style=construction (${construct} site(s))`);
    }
}

// ── P2: response envelope — tool registrar files (already test-enforced) ────
for (const f of registrarFiles) {
    const s = readFileSync(join(ROOT, f), 'utf8');
    if (f.endsWith('mcpToolResult.ts')) {
        add(f, 'envelope', 'exempt', 'the builder itself');
        continue;
    }
    const handRolled = /content:\s*\[\s*\{\s*type:\s*['"]text['"]/.test(s);
    add(f, 'envelope', handRolled ? 'deviating' : 'conforming',
        handRolled ? 'hand-rolls the MCP content envelope' : 'uses asText/asRawText only');
}

// ── P3: handler-map shape — files exporting handler maps ────────────────────
for (const f of handlerFiles) {
    const s = readFileSync(join(ROOT, f), 'utf8');
    const hasMap = /defineHandlers\(|:\s*MessageHandler/.test(s);
    const adHocSwitch = /switch\s*\(\s*(message|type|messageType)\b/.test(s);
    if (!hasMap) add(f, 'handler-map', 'deviating', 'handler file without typed MessageHandler exports');
    else if (adHocSwitch) add(f, 'handler-map', 'deviating', 'typed handlers PLUS an ad-hoc message switch');
    else add(f, 'handler-map', 'conforming', 'typed MessageHandler exports / defineHandlers map');
}

// ── P4: UI-in-services — service/manager classes showing VS Code UI ─────────
for (const f of serviceFiles) {
    const s = readFileSync(join(ROOT, f), 'utf8');
    const uiCalls = (s.match(/vscode\.window\.show\w+/g) ?? []).length;
    add(f, 'ui-in-services', uiCalls === 0 ? 'conforming' : 'deviating',
        uiCalls === 0 ? 'no VS Code UI from the service layer'
                      : `${uiCalls} vscode.window.show* call(s) inside a service class`);
}

const ledger = {
    generatedAt: new Date().toISOString(),
    universes: {
        'di-style': 'src_files',
        envelope: 'tool_registrar_files',
        'handler-map': 'handler_map_files',
        'ui-in-services': 'service_class_files',
    },
    rows,
};
// A regenerated ledger should grow or hold steady as the codebase does. A
// COLLAPSE means the universes came back empty — a bad cwd, a moved directory, a
// grep that stopped matching — and writing it would destroy the audit rather
// than update it. Refuse, and say what to do.
const LEDGER = `${HARNESS}/ledger.json`;
if (existsSync(LEDGER)) {
    const previous = JSON.parse(readFileSync(LEDGER, 'utf8')).rows?.length ?? 0;
    if (previous > 0 && rows.length < previous * 0.9) {
        console.error(
            `REFUSED: would shrink the ledger ${previous} -> ${rows.length} rows.\n` +
                `That is a collapsed universe, not a smaller codebase. Run from the repo\n` +
                `root and check the grep/ls-files scopes above. Pass --force to override.`,
        );
        if (!process.argv.includes('--force')) process.exit(1);
    }
}
writeFileSync(LEDGER, JSON.stringify(ledger, null, 1));
console.log(`ledger written: ${rows.length} rows across ${Object.keys(ledger.universes).length} patterns`);
