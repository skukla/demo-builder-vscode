#!/usr/bin/env node
/**
 * Append a row to the equivalent-mutant ledger in the file's own serialisation.
 *
 *   node scripts/mutationLedger.mjs add \
 *     --module src/features/x/y.ts \
 *     --anchor "if (!parsed) {" [--anchor "..."] [--line 102] \
 *     --mutants 2 --category branch \
 *     --reason "why no test can kill it" \
 *     --decision "none — ..." \
 *     [--source "PL-22 batch MUT-07"]
 *
 * WHY. Every goal session that added a ledger row on 2026-09-03 lost minutes to
 * the same snag: it rewrote the whole file with a different serialisation —
 * indentation, raw em-dashes against the file's `—` escapes — and the diff
 * was the whole file instead of one row. One session shipped the reformatted file
 * before noticing. This command writes exactly one row, in exactly the file's
 * style, and refuses an anchor that does not resolve — so a bad row cannot land.
 */
import { existsSync, readFileSync, writeFileSync } from 'fs';

const LEDGER = 'scripts/mutation-equivalents.ledger.json';

function args() {
    const out = { anchors: [] };
    const argv = process.argv.slice(3);
    for (let i = 0; i < argv.length; i += 2) {
        const key = argv[i].replace(/^--/, '');
        const value = argv[i + 1];
        if (key === 'anchor') out.anchors.push(value);
        else out[key] = value;
    }
    return out;
}

/** The file's style: 4-space indent, non-ASCII escaped as \uXXXX, trailing newline. */
function serialise(obj) {
    const json = JSON.stringify(obj, null, 4);
    // Written with escape sequences on purpose, so the range is readable in source.
    const nonAscii = new RegExp('[\\u0080-\\uffff]', 'g');
    return json.replace(nonAscii, (c) => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0')) + '\n';
}

function resolves(module, anchor, line) {
    if (!existsSync(module)) return `${module}: no such file`;
    const lines = readFileSync(module, 'utf8').split('\n');
    if (line !== undefined) {
        return (lines[line - 1] ?? '').trim() === anchor ? null : `anchor is not at line ${line}`;
    }
    const hits = lines.filter((l) => l.trim() === anchor).length;
    if (hits === 1) return null;
    return hits === 0 ? 'anchor not found in the module' : `anchor matches ${hits} lines — pass --line`;
}

function main() {
    if (process.argv[2] !== 'add') {
        console.error('Usage: node scripts/mutationLedger.mjs add --module <src/...> --anchor <text> [--line N] --mutants N --category <c> --reason <text> --decision <text> [--source <text>]');
        process.exit(1);
    }
    const a = args();
    const missing = ['module', 'mutants', 'category', 'reason', 'decision'].filter((k) => !a[k]);
    if (missing.length || !a.anchors.length) {
        console.error(`missing: ${[...missing, ...(a.anchors.length ? [] : ['anchor'])].join(', ')}`);
        process.exit(1);
    }
    const line = a.line !== undefined ? Number(a.line) : undefined;
    for (const anchor of a.anchors) {
        const problem = resolves(a.module, anchor, line);
        if (problem) {
            console.error(`REFUSED — ${problem}: "${anchor}"`);
            process.exit(2);
        }
    }
    if (a.reason.length < 120) {
        console.error('REFUSED — the reason must carry the argument (120+ characters), not a label.');
        process.exit(2);
    }

    const ledger = JSON.parse(readFileSync(LEDGER, 'utf8'));
    const entry = {
        module: a.module,
        anchors: a.anchors,
        ...(line !== undefined ? { line } : {}),
        mutants: Number(a.mutants),
        category: a.category,
        reason: a.reason,
        decision: a.decision,
        recorded: new Date().toISOString().slice(0, 10),
        source: a.source ?? 'mutationLedger add',
    };
    ledger.entries.push(entry);
    writeFileSync(LEDGER, serialise(ledger));
    console.log(`added: ${a.module} — ${a.mutants} mutant(s), ${a.anchors.length} anchor(s)`);
}

main();
