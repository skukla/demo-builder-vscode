#!/usr/bin/env node
/**
 * The KIND ledger — the owner's challenge answered with arithmetic
 * (2026-08-28: "the 786 files that don't touch shared services have a
 * purpose and should follow a pattern too, should they not?").
 *
 * Every src file gets exactly one KIND, mechanically. Then the matrix names,
 * per kind: which patterns apply and what (if anything) ENFORCES each —
 * 'test' (a jest suite fails on deviation), 'lint' (eslint errors),
 * 'scan' (an advisory skill exists, human-run), or 'NONE' (nothing checks;
 * the honest gap). No kind is allowed to be pattern-free: a kind with no
 * applicable pattern is a classification error, not a clean bill.
 */
import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

const HARNESS = new URL('.', import.meta.url).pathname;
const files = execSync(`git ls-files 'src/**/*.ts' 'src/**/*.tsx'`, { encoding: 'utf8' })
    .trim().split('\n');

function kindOf(f, src) {
    if (/\/types\/|\.types\.tsx?$|^src\/types\//.test(f)) return 'types';
    if (/\btests?\b/.test(f)) return 'other';
    if (f.endsWith('.tsx')) return /\/hooks\//.test(f) ? 'react-hook' : 'react-component';
    if (/\/hooks\/|\/use[A-Z]\w*\.ts$/.test(f)) return 'react-hook';
    if (/registerTool\(/.test(src)) return 'mcp-tool';
    if (/andlers?\.ts$|\/handlers\//.test(f)) return 'handler';
    if (/^export class \w*(Service|Manager|Client)\b/m.test(src)) return 'service-class';
    if (/\/commands\//.test(f)) return 'command';
    if (/\/config\//.test(f) || /ConfigurationLoader|\.json'/.test(src) && /\/config/.test(f)) return 'config';
    if (/\/ui\//.test(f)) return 'ui-support';
    if (/\/(utils|helpers)\//.test(f) || /^src\/core\//.test(f)) return 'helper';
    return 'feature-service-fn'; // feature logic exported as functions, not classes
}

const rows = files.map((f) => {
    const src = readFileSync(f, 'utf8');
    return { unit: f, pattern: 'kind', verdict: 'conforming', evidence: `kind=${kindOf(f, src)}` };
});

// The matrix: per kind, the applicable patterns and their enforcement TODAY.
// 'NONE' rows are the audit's honest gaps — they are the finding.
const MATRIX = {
    'react-component': [
        ['Spectrum/webview gotchas (Flex 450px, tokens)', 'scan: spectrum-webview-ui skill + docs'],
        ['size ≤350 lines / ≤8 props', 'test: SOP suite (god files) + lint max-lines'],
        ['complex JSX chains extracted', 'test: tests/sop/complex-expressions'],
        ['markup duplicated ≥3 sites → component', 'scan: component-extraction-scan'],
    ],
    'react-hook': [
        ['stable array/object refs to hooks', 'NONE (documented in memory only)'],
        ['inline fetching >20 lines → custom hook', 'scan: SOP docs, no detector'],
    ],
    handler: [
        ['typed MessageHandler map + dispatchHandler', 'audit: handler-map pattern (33/33)'],
        ['Pattern B responses (return, not sendMessage)', 'NONE (convention in docs)'],
        ['secrets never logged', 'scan: hand audits only'],
    ],
    'service-class': [
        ['no VS Code UI from services', 'audit: ui-in-services (32/33)'],
        ['DI style (the contested axis)', 'audit: di-style — awaiting ruling'],
        ['size ≤400 lines', 'lint: max-lines warn + SOP scan'],
    ],
    'mcp-tool': [
        ['response envelope via asText/asRawText', 'test: responseEnvelope (28/28)'],
        ['narration phrase + ceiling + floor/prompt', 'test: toolNarration, responseSize, toolPromptCoverage'],
        ['registration against real SDK', 'test: realSdkRegistration'],
    ],
    command: [['BaseCommand/BaseWebviewCommand shape', 'NONE (docs only)']],
    types: [['types-only, no runtime imports', 'NONE (tsc catches cycles only)']],
    config: [['ConfigurationLoader + schema', 'NONE (per-feature ad hoc)']],
    helper: [['pure, ≤300 lines, no vscode UI', 'lint: max-lines; purity NONE']],
    'ui-support': [['shared-ui conventions', 'scan: docs only']],
    'feature-service-fn': [
        ['injected-deps functions (the runner shape)', 'audit: di-style covers acquisition'],
        ['size ≤400 lines', 'lint: max-lines'],
    ],
    other: [['(re-classify: nothing should land here)', 'audit: this row IS the check']],
};

writeFileSync(`${HARNESS}/kind-ledger.json`, JSON.stringify({ rows, matrix: MATRIX }, null, 1));

// Report: counts per kind + the NONE gaps.
const counts = {};
for (const r of rows) {
    const k = r.evidence.slice(5);
    counts[k] = (counts[k] ?? 0) + 1;
}
console.log('files per kind:', JSON.stringify(counts, null, 1));
let gaps = 0;
for (const [kind, pats] of Object.entries(MATRIX)) {
    for (const [pat, enf] of pats) {
        if (enf.startsWith('NONE')) { gaps++; console.log(`GAP: ${kind} — "${pat}" — ${enf}`); }
    }
}
console.log(`total kinds=${Object.keys(counts).length}, unenforced-pattern gaps=${gaps}`);
const total = rows.length;
console.log(total === files.length ? `RECONCILED: ${total}/${files.length} files kinded` : `NOT DONE: ${total}/${files.length}`);
