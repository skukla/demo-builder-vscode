#!/usr/bin/env node
/**
 * Measure the extension's LLM-guidance surface and what it costs.
 *
 * `ai-coverage-scan` answers "can an agent REACH the feature?". This answers the
 * question that one structurally cannot: **what does our guidance cost, and is it
 * bounded?** Both matter — a feature reachable through a tool can still be
 * unusable if reading its answer costs more context than the work.
 *
 * Four mechanisms are measured, split by WHEN the agent pays:
 *
 *   ALWAYS-ON  — carried before the agent does anything: the generated AGENTS.md,
 *                every skill's frontmatter description (the listing), and the tool
 *                catalog's names + descriptions.
 *   ON-DEMAND  — paid only when used: skill BODIES (load on invocation) and tool
 *                RESPONSES (bounded by the ceiling table, or not bounded at all).
 *
 * Token figures are chars/4 estimates, NOT a tokenizer, and are labelled as such.
 * They are for comparing items against each other and tracking drift over time.
 * For an authoritative single-tool number, use `mcp-live-probe` against the
 * running server — that reads what the agent is actually served.
 *
 * Usage:  node scripts/measure-ai-guidance.mjs           # summary
 *         node scripts/measure-ai-guidance.mjs --full    # + per-item tables
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const ROOT = execSync('git rev-parse --show-toplevel', { encoding: 'utf8' }).trim();
const FULL = process.argv.includes('--full');

/** chars/4 — an estimate, deliberately not a tokenizer. See the header. */
const tok = (s) => Math.round(s.length / 4);
const num = (n) => n.toLocaleString('en-US');

function read(p) {
    try {
        return fs.readFileSync(p, 'utf8');
    } catch {
        return '';
    }
}

function walk(dir, filter, out = []) {
    let entries;
    try {
        entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
        return out;
    }
    for (const e of entries) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) walk(p, filter, out);
        else if (filter(p)) out.push(p);
    }
    return out;
}

// ── 1. Skills: description (always-on) vs body (on-demand) ───────────────────
const SKILL_DIR = path.join(ROOT, 'src/features/project-creation/templates/skills');
const skills = fs
    .readdirSync(SKILL_DIR)
    .filter((f) => f.endsWith('.md'))
    .map((f) => {
        const src = read(path.join(SKILL_DIR, f));
        const m = /^---\n([\s\S]*?)\n---\n/.exec(src);
        const desc = m ? (/description:\s*(.*)/.exec(m[1])?.[1] ?? '') : '';
        const body = m ? src.slice(m[0].length) : src;
        return { name: f.replace(/\.md$/, ''), desc: tok(desc), body: tok(body) };
    })
    .sort((a, b) => b.body - a.body);

// ── 2. Tools: catalog text (always-on) ───────────────────────────────────────
const toolFiles = [
    path.join(ROOT, 'src/mcp-server.ts'),
    ...walk(path.join(ROOT, 'src/features/ai/server'), (p) => p.endsWith('.ts')),
];
const toolNames = new Set();
const toolDescs = [];
for (const f of toolFiles) {
    const s = read(f);
    for (const m of s.matchAll(/registerTool\(\s*['"]([a-z0-9_]+)/g)) toolNames.add(m[1]);
    for (const m of s.matchAll(/tool:\s*['"]([a-z0-9_]+)['"]/g)) toolNames.add(m[1]);
    for (const m of s.matchAll(/description:\s*\n?\s*'([^']{20,})'/g)) toolDescs.push(m[1]);
    for (const m of s.matchAll(/description:\s*\n?\s*"([^"]{20,})"/g)) toolDescs.push(m[1]);
}

// ── 3. Response ceilings (the bound on what tools return) ────────────────────
const ceilSrc = read(path.join(ROOT, 'tests/features/ai/server/responseCeilings.ts'));
const ceilings = [...ceilSrc.matchAll(/(\w+):\s*\{[^}]*?bytes:\s*([\d_]+)/g)].map((m) => ({
    tool: m[1],
    bytes: Number(m[2].replace(/_/g, '')),
}));
const ceilingByTool = new Set(ceilings.map((c) => c.tool));

// A tool is COVERED by a ceiling or by an explicit exemption (a response that is a
// fixed short status by construction). Counting ceilings alone reports a ~50%
// boundedness that is simply wrong — 39 of the 46 descriptor tools are exempt on
// purpose, and the exemption is listed per-tool so a new tool cannot join silently.
const sizeTest = read(path.join(ROOT, 'tests/features/ai/server/responseSize.test.ts'));
const exemptBlock = /const EXEMPT = new Set\(\[([\s\S]*?)\]\)/.exec(sizeTest);
const exempt = new Set(
    exemptBlock ? [...exemptBlock[1].matchAll(/'([a-z0-9_]+)'/g)].map((m) => m[1]) : []
);

// Which registration path a tool arrives by decides whether anything CHECKS it.
const descriptorTools = new Set();
for (const f of walk(path.join(ROOT, 'src/features/ai/server'), (p) => p.endsWith('Descriptors.ts'))) {
    for (const m of read(f).matchAll(/tool:\s*['"]([a-z0-9_]+)['"]/g)) descriptorTools.add(m[1]);
}
// A recorded ceiling is not an exercised one. The table's own header says the
// numbers are "asserted where the tool is already driven by a test" — if no test
// produces a response, nothing compares anything to the number. Measured
// 2026-08-24: 54 ceilings recorded, 21 actually asserted.
const asserted = new Set();
for (const f of walk(path.join(ROOT, 'tests'), (p) => p.endsWith('.ts'))) {
    for (const m of read(f).matchAll(/expectWithinCeiling\(\s*['"]([a-z0-9_]+)['"]/g)) {
        asserted.add(m[1]);
    }
}

const directTools = [...toolNames].filter((t) => !descriptorTools.has(t));
const covered = (t) => ceilingByTool.has(t) || exempt.has(t);
const unbounded = [...toolNames].filter((t) => !covered(t)).sort();
const uncheckedDirect = directTools.filter((t) => !covered(t)).sort();

// ── 4. Generated AGENTS.md — measure a REAL one when present ─────────────────
// ONLY the two AGENTS.md files WE generate: the home one at the projects root and
// one per project directory. A recursive walk also finds vendored ones — cloned
// storefront repos and the starter kits under `.demo-builder-mcp/node_modules/`
// ship their own — and averaging those in inflated this figure by 2x on the first
// run (measured 2026-08-24: 6 files found, 4 of them not ours).
const projectsRoot = path.join(process.env.HOME ?? '', '.demo-builder/projects');
const agentsFiles = [];
if (fs.existsSync(path.join(projectsRoot, 'AGENTS.md'))) {
    agentsFiles.push(path.join(projectsRoot, 'AGENTS.md'));
}
for (const e of fs.existsSync(projectsRoot) ? fs.readdirSync(projectsRoot, { withFileTypes: true }) : []) {
    if (!e.isDirectory()) continue;
    const candidate = path.join(projectsRoot, e.name, 'AGENTS.md');
    if (fs.existsSync(candidate)) agentsFiles.push(candidate);
}
const agentsTok = agentsFiles.length
    ? Math.round(agentsFiles.reduce((a, f) => a + tok(read(f)), 0) / agentsFiles.length)
    : null;

// ── 5. External MCPs the extension INSTALLS (the denominator) ────────────────
let external = [];
try {
    const cfg = JSON.parse(
        read(path.join(ROOT, 'src/features/project-creation/config/ai-defaults.json'))
    );
    external = (cfg.mcpServers ?? []).map((e) => ({
        id: e.id,
        thirdParty: Boolean(e.thirdParty),
        requires: e.requires ?? '-',
    }));
} catch {
    /* config shape changed — reported as empty, and the control below catches it */
}

// ── Report ───────────────────────────────────────────────────────────────────
const descTok = skills.reduce((a, s) => a + s.desc, 0);
const bodyTok = skills.reduce((a, s) => a + s.body, 0);
const toolDescTok = tok(toolDescs.join(''));
const alwaysOn = (agentsTok ?? 0) + descTok + toolDescTok;

console.log('# AI guidance surface\n');
console.log('## ALWAYS-ON — carried before the agent does anything\n');
console.log(`  generated AGENTS.md        ~${num(agentsTok ?? 0)} tok` +
    (agentsFiles.length ? `  (mean of ${agentsFiles.length} real project file(s))` : '  (NONE FOUND — install a project to measure)'));
console.log(`  skill descriptions         ~${num(descTok)} tok  (${skills.length} skills, listing only)`);
console.log(`  tool descriptions          ~${num(toolDescTok)} tok  (${toolNames.size} tools)`);
console.log(`  ────────────────────────────────────`);
console.log(`  subtotal                   ~${num(alwaysOn)} tok  (excludes tool input SCHEMAS, which the`);
console.log(`                                        catalog also carries — use mcp-live-probe for the true figure)\n`);

console.log('## ON-DEMAND — paid only when used\n');
console.log(`  skill bodies               ~${num(bodyTok)} tok total, load on invocation`);
console.log(`  heaviest skill             ~${num(skills[0].body)} tok  (${skills[0].name})\n`);

console.log('## WATCHED — is what comes back checked? (NOT a runtime cap: ceilings are\n##           test-time regression alarms; RESPONSE_CEILINGS is imported in tests/ only)\n');
const coveredCount = toolNames.size - unbounded.length;
const pct = Math.round((coveredCount / toolNames.size) * 100);
const assertedCount = [...asserted].filter((t) => ceilingByTool.has(t)).length;
console.log(`  watched (ceiling or explicit exemption)  ${coveredCount} of ${toolNames.size}  (${pct}%)`);
console.log(`    ├─ ceiling ASSERTED against a payload  ${assertedCount}   <- the only tier that BREAKS a build`);
console.log(`    ├─ ceiling recorded, never exercised   ${ceilingByTool.size - assertedCount}   (documentation, not a guard)`);
console.log(`    └─ exempt by construction              ${exempt.size}`);
console.log(`  NEITHER                                  ${unbounded.length}`);
console.log(`\n  by registration path — this is where the enforcement gap lives:`);
const descUncovered = [...descriptorTools].filter((t) => !covered(t)).length;
console.log(`    descriptor tools    ${descriptorTools.size}, uncovered ${descUncovered}  (a test enforces this path)`);
console.log(`    directly registered ${directTools.length}, uncovered ${uncheckedDirect.length}  (NOTHING enforces this path)`);
if (ceilings.length) {
    const sorted = [...ceilings].sort((a, b) => b.bytes - a.bytes);
    console.log(`  median ceiling                  ${num(sorted[Math.floor(sorted.length / 2)].bytes)} B`);
    console.log(`  largest single ceiling          ${num(sorted[0].bytes)} B  ~${num(Math.round(sorted[0].bytes / 4))} tok  (${sorted[0].tool})`);
}
console.log();

console.log('## DENOMINATOR — external MCPs the extension installs alongside ours\n');
for (const e of external) {
    console.log(`  ${e.id.padEnd(24)} thirdParty=${String(e.thirdParty).padEnd(5)} gate=${e.requires}`);
}
console.log();

// Controls — a broken step must abort, not print a tidy zero.
const problems = [];
if (toolNames.size === 0) problems.push('0 tools found — the tool scan is broken.');
if (skills.length === 0) problems.push('0 skills found — the skill scan is broken.');
if (ceilings.length === 0) problems.push('0 ceilings found — the ceiling parse is broken.');
if (external.length === 0) problems.push('0 external MCP entries — ai-defaults shape changed.');
console.log('control: ' +
    `${toolNames.size} tools, ${skills.length} skills, ${ceilings.length} ceilings, ` +
    `${external.length} external entries, ${agentsFiles.length} AGENTS.md read`);
if (problems.length) {
    console.error('\nABORT:\n  ' + problems.join('\n  '));
    process.exit(1);
}

if (FULL) {
    console.log('\n## Skills — body cost (on-demand), heaviest first\n');
    for (const s of skills) console.log(`  ${String(s.body).padStart(6)} tok  ${s.name}`);
    console.log('\n## Tools with NEITHER a ceiling NOR an exemption\n');
    for (const t of unbounded) {
        console.log(`  ${t}${descriptorTools.has(t) ? '' : '   (directly registered — unchecked)'}`);
    }
}
