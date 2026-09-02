#!/usr/bin/env node
/**
 * Turn a Stryker report into a WORKLIST of decisions nothing constrains.
 *
 *   node scripts/mutationWorklist.mjs [reports/mutation/focus.json]
 *   node scripts/mutationWorklist.mjs --json
 *
 * WHY NOT JUST READ THE SCORE. The score answers "how are we doing", which is not a
 * thing anyone can act on. This answers "what is unconstrained, and where", which is.
 *
 * WHAT IT FILTERS OUT, and why each is deliberate:
 *
 *   log lines            mutating a message changes nothing observable
 *   log-only branches    a condition whose whole body is a logger call. Measured
 *                        2026-09-02: only 6 of 412 survivors repo-wide, so this is a
 *                        small class — it is filtered because it is noise, not
 *                        because it is common
 *   non-decisions        string/object literals. They can matter (an agent-facing
 *                        description does), but they are a different KIND of work
 *                        from an untested branch and mixing them hides both
 *
 * What is left is `ConditionalExpression`, `EqualityOperator`, `LogicalOperator`,
 * `BooleanLiteral`, `BlockStatement`, `ArrowFunction`, `MethodExpression` — a decision
 * that could be flipped, or a body that could be deleted whole, with the suite green.
 *
 * Lines are ranked by how many survivors sit on them: a line with five is one
 * decision nothing constrains from five directions, and is usually one test.
 */
import { readFileSync } from 'fs';

const reportPath = process.argv.find((a) => a.endsWith('.json') && !a.startsWith('--'))
    ?? 'reports/mutation/focus.json';
const asJson = process.argv.includes('--json');

const LOGGY = /[Ll]ogger|\.log\(|\.debug\(|\.warn\(|\.info\(|\.error\(|\.trace\(/;
const DECISIONS = new Set([
    'ConditionalExpression',
    'EqualityOperator',
    'LogicalOperator',
    'BooleanLiteral',
    'BlockStatement',
    'ArrowFunction',
    'MethodExpression',
]);

/** A guarded body whose every statement feeds a logger changes nothing observable. */
function bodyIsOnlyLogging(lines, startLine) {
    const body = [];
    let depth = 0;
    let started = false;
    for (let i = startLine - 1; i < Math.min(lines.length, startLine + 12); i += 1) {
        const L = lines[i];
        depth += (L.match(/\{/g) ?? []).length - (L.match(/\}/g) ?? []).length;
        if (L.includes('{')) started = true;
        if (started) {
            body.push(L);
            if (depth <= 0 && body.length > 1) break;
        }
    }
    const inner = body
        .slice(1, -1)
        .map((l) => l.trim())
        .filter((l) => l && !l.startsWith('//'));
    return inner.length > 0 && inner.every((l) => LOGGY.test(l));
}

const report = JSON.parse(readFileSync(reportPath, 'utf8'));
const out = [];

for (const [path, file] of Object.entries(report.files)) {
    const lines = file.source.split('\n');
    const byLine = new Map();
    for (const m of file.mutants) {
        if (m.status !== 'Survived') continue;
        const line = m.location.start.line;
        const src = lines[line - 1] ?? '';
        if (LOGGY.test(src)) continue;
        if (!DECISIONS.has(m.mutatorName)) continue;
        if (bodyIsOnlyLogging(lines, line)) continue;
        if (!byLine.has(line)) byLine.set(line, { line, src: src.trim(), mutators: [] });
        byLine.get(line).mutators.push(m.mutatorName);
    }
    for (const row of byLine.values()) out.push({ file: path, ...row });
}

out.sort((a, b) => b.mutators.length - a.mutators.length || a.line - b.line);

if (asJson) {
    console.log(JSON.stringify(out, null, 2));
    process.exit(0);
}

const total = out.reduce((n, r) => n + r.mutators.length, 0);
console.log(`\n${total} unconstrained decisions on ${out.length} lines — ${reportPath}\n`);
if (out.length === 0) {
    console.log('  nothing left in this scope.');
} else {
    for (const r of out.slice(0, 25)) {
        console.log(`  ${String(r.mutators.length).padStart(2)}x  ${r.file.split('/').pop()}:${r.line}`);
        console.log(`        ${r.src.slice(0, 92)}`);
        console.log(`        ${[...new Set(r.mutators)].join(', ')}`);
    }
    if (out.length > 25) console.log(`\n  … and ${out.length - 25} more lines`);
}
